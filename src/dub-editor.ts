import * as vscode from "vscode";
import * as fs from "fs";
import * as jsonc from 'jsonc-parser';

export class DubEditor implements vscode.CustomTextEditorProvider {
	private static readonly viewType = "code-d.dubRecipe";

	private editorTemplate: Promise<string>;

	constructor(private context: vscode.ExtensionContext) {
		let editorPath = this.context.asAbsolutePath("html/dubeditor.html");
		this.editorTemplate = new Promise<string>((resolve, reject) => {
			fs.readFile(editorPath, {
				encoding: "utf8"
			}, (err, data) => {
				if (err) reject(new Error("Failed to read dubeditor: " + err));
				else resolve(data);
			});
		});
	}

	static register(context: vscode.ExtensionContext): { dispose(): any; } {
		const provider = new DubEditor(context);
		return vscode.window.registerCustomEditorProvider(DubEditor.viewType, provider);
	}

	async resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): Promise<void> {
		webviewPanel.webview.options = {
			enableCommandUris: true,
			enableScripts: true
		};
		webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview);

		function updateWebview() {
			let errors: jsonc.ParseError[] = [];
			let parsed = jsonc.parse(document.getText(), errors);
			webviewPanel.webview.postMessage({
				type: "update",
				json: parsed,
				errors: errors.map(err => {
					let loc = document.positionAt(err.offset);
					return {
						message: jsonc.printParseErrorCode(err.error),
						line: loc.line + 1,
						column: loc.character + 1
					};
				}),
			});
		}

		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === document.uri.toString()) {
				updateWebview();
			}
		});

		// Make sure we get rid of the listener when our editor is closed.
		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
		});

		webviewPanel.webview.onDidReceiveMessage(async (e) => {
			switch (e.cmd) {
				case "setValue":
					try {
						this.setValue(document, e.arg);
					} catch (e: any) {
						vscode.window.showErrorMessage((e.message || e) + "");
					}
					break;
				case "getInput":
					let callbackId = <string>e.arg.callbackId;
					let label = <string>e.arg.label;
					let options = <{ error?: string, placeholder?: string, value?: string } | undefined>e.arg.options;

					if (options?.error) {
						vscode.window.showErrorMessage(options.error);
					}

					let res = await vscode.window.showInputBox({
						title: label,
						placeHolder: options?.placeholder,
						value: options?.value
					});

					webviewPanel.webview.postMessage({
						type: "callback",
						id: callbackId,
						value: res
					})
					break;
				case "showError":
					vscode.window.showErrorMessage((e.message || e) + "");
					break;
				case "showWarning":
					vscode.window.showWarningMessage((e.message || e) + "");
					break;
				case "showInfo":
					vscode.window.showInformationMessage((e.message || e) + "");
					break;
				case "refetch":
					updateWebview();
					break;
				default:
					vscode.window.showErrorMessage("Unknown command " + e.cmd);
					break;
			}
		});
	}

	setValue(doc: vscode.TextDocument, arg: { path: string[], value: any | undefined }) {
		const root = jsonc.parseTree(doc.getText(), undefined, {
			disallowComments: true
		});
		if (!root) {
			throw new Error(doc.fileName + " does not contain valid JSON, please recreate.");
		}
		let value = arg.value;

		if (!Array.isArray(arg.path) || typeof arg.path == "string")
			throw new Error("invalid path");

		// compute minimal insert edit
		let scope = root;
		let i = 0;
		for (; i < arg.path.length - 1; i++) {
			let part = arg.path[i];
			if (part[0] == ":") {
				let [key, value] = part.substr(1).split("=", 2);
				// find "key": value in json
				if (scope.type == "property" && scope.children)
					scope = scope.children[1];
				if (scope.type == "array" && scope.children) {
					for (let i = 0; i < scope.children.length; i++) {
						const child = scope.children[i];
						let match = findChildNodeByKey(child, key);
						if (match && match.children && match.children[1].value == value) {
							scope = child;
							break;
						}
					}
				}
			} else {
				let child = findChildNodeByKey(scope, part);
				if (child === undefined || !child.children) {
					break; // remaining below
				}
				scope = child.children[1];
			}
		}
		// create empty objects
		for (let remaining = arg.path.length - 2; remaining >= i; remaining--) {
			if (value === undefined) return; // already done, don't need to remove anything
			let part = arg.path[i];
			if (part[0] == ":") {
				throw new Error("invalid code-d editor state");
			} else {
				let obj: any = {};
				obj[part] = value;
				value = obj;
			}
		}

		let edit = new vscode.WorkspaceEdit();
		let key = arg.path[arg.path.length - 1];
		// now set scope[key] to the new value in the document
		let existingKey = findChildNodeByKey(scope, key);
		if (existingKey) {
			if (value === undefined) {
				// delete
				let start = doc.positionAt(existingKey.offset);
				let end = doc.positionAt(existingKey.offset + existingKey.length);
				let leading = doc.getText(new vscode.Range(start.with(start.line - 1, 0), start));
				let trailing = doc.getText(new vscode.Range(end, end.with(end.line + 1, 100000)));
				const whitespaceRegex = /\s/;
				if (trailing.trimStart().startsWith(",")) {
					// make sure we don't leave a trailing comma + clean up whitespace
					let i = trailing.indexOf(',');
					for (; i < trailing.length - 1; i++) {
						if (!whitespaceRegex.exec(trailing[i + 1])) {
							break;
						}
					}
					end = doc.positionAt(existingKey.offset + existingKey.length + i + 1);
				} else if (leading.trimEnd().endsWith(",")) {
					// no trailing comma, but comma before (last item in object)
					// so delete comma before + clean up whitespace
					let i = leading.lastIndexOf(',');
					for (; i >= 0; i--) {
						if (!whitespaceRegex.exec(leading[i - 1])) {
							break;
						}
					}
					start = doc.positionAt(existingKey.offset - (leading.length - i));
				}
				edit.delete(doc.uri, new vscode.Range(start, end));
			} else {
				// value exists, replace
				let indent = getNodeIndentation(doc, existingKey);
				let child = (existingKey.children && existingKey.children[1]) || existingKey;
				edit.replace(doc.uri,
					new vscode.Range(
						doc.positionAt(child.offset),
						doc.positionAt(child.offset + child.length)
					),
					JSON.stringify(value, null, "\t")
						.replace(/\n/g, "\n" + indent));
			}
		} else if (scope.children) {
			if (value === undefined) return; // already done, don't need to remove anything
			// get indentation based on first property
			let indent = getNodeIndentation(doc, scope.children[0]);

			// does not exist yet, append property at end of object
			let last = scope.children[scope.children.length - 1];
			if (!last)
				throw new Error("invalid JSON");
			// insert after last value
			edit.insert(doc.uri,
				doc.positionAt(last.offset + last.length),
				",\n" + indent
					+ JSON.stringify(key) + ": "
					+ JSON.stringify(value, null, "\t")
					.replace(/\n/g, "\n" + indent));
		} else {
			throw new Error("invalid JSON");
		}
		return vscode.workspace.applyEdit(edit);
	}

	private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
		let scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.context.extensionUri, "html", "dubeditor.js"));

		let styleUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.context.extensionUri, "html", "dubeditor.css"));

		let vscodeUiUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.context.extensionUri, "node_modules", "@vscode", "webview-ui-toolkit", "dist", "toolkit.js"));

		let codiconUri = webview.asWebviewUri(vscode.Uri.joinPath(
			this.context.extensionUri, "node_modules", "@vscode", "codicons", "dist", "codicon.css"));

		return (await this.editorTemplate)
			.replace("{{dubEditorStyleUri}}", styleUri.toString())
			.replace("{{dubEditorScriptUri}}", scriptUri.toString())
			.replace("{{vscodeuiToolkitUri}}", vscodeUiUri.toString())
			.replace("{{codiconUri}}", codiconUri.toString())
		;
	}
}

function getNodeIndentation(document: vscode.TextDocument, node?: jsonc.Node): string {
	let indent = "";
	if (node && node.type == "property") {
		let pos = document.positionAt(node.offset);
		indent = document.getText(new vscode.Range(pos.with(undefined, 0), pos));
		// make sure there is only whitespace
		const whitespaceRegex = /\s/;
		for (let i = indent.length - 1; i >= 0; i--) {
			if (!whitespaceRegex.exec(indent[i])) {
				indent = indent.substr(i + 1);
				break;
			}
		}
	}
	return indent;
}

function findChildNodeByKey(node: jsonc.Node, key: string): jsonc.Node | undefined {
	if (!node.children)
		return undefined;

	for (let i = 0; i < node.children.length; i++) {
		const child = node.children[i];
		if (child.type != "property" || !child.children)
			continue;
		// "property" has children [key, value] of type [Node(string), Node(any)]
		if (child.children[0].value === key)
			return child;
	}
	return undefined;
}