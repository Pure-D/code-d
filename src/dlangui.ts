import * as vscode from "vscode"
import { LanguageClient } from "vscode-languageclient";

const colorRegex = /(color:\s*\")(.*)\"/gi;
export class DlangUIHandler implements vscode.CompletionItemProvider {
	constructor(public served: LanguageClient, private colorDecorationBase: vscode.TextEditorDecorationType) {
		vscode.workspace.onDidChangeTextDocument(this.fileUpdate);
	}

	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
		// TODO: Port to serve-d
		/*let self = this.served;
		console.log("provideCompletionItems(DlangUI)");
		return new Promise((resolve, reject) => {
			if (!self.dlanguiReady)
				return resolve(null);
			let offset = document.offsetAt(position);
			self.request({ cmd: "dlangui", subcmd: "list-completion", code: document.getText(), pos: offset }).then((completions) => {
				let items: vscode.CompletionItem[] = [];
				completions.forEach(item => {
					let i = new vscode.CompletionItem(item.value);
					i.kind = mapCompletionType(item.type);
					i.detail = item.enumName;
					i.documentation = item.documentation;
					i.insertText = item.value + ": ";
					if (item.type === 1)
						i.insertText = item.value + " \\{{{}}\\}";
					else if (item.type === 4)
						i.insertText = item.value + ": \"{{#000000}}\"";
					else if (item.type === 5)
						i.insertText = item.enumName + "." + item.value;
					else if (item.type === 7)
						i.insertText = item.value + ": {{0}}";
					else if (item.type === 9)
						i.insertText = undefined;
					items.push(i);
				});
				console.log("resolve");
				console.log(items);
				resolve(items);
			}, reject);
		});*/
		return Promise.resolve([]);
	}

	fileUpdate(e: vscode.TextDocumentChangeEvent) {
		console.log(typeof this);
		try {
			console.log(typeof this);
			if (e.document.languageId != "dml")
				return;
			console.log(typeof this);
			var editor = vscode.window.activeTextEditor;
			if (!editor || editor.document != e.document)
				throw "Invalid Document!";
			console.log(typeof this);
			var match: RegExpExecArray | null;
			var options: vscode.DecorationOptions[] = [];
			var text = e.document.getText();
			console.log(typeof this);
			while (match = colorRegex.exec(text)) {
				console.log(match[2] + " -> " + toCSSColor(match[2]));
				options.push({
					range: new vscode.Range(editor.document.positionAt(match.index + match[1].length - 1), editor.document.positionAt(match.index + match[1].length + match[2].length + 1)),
					hoverMessage: match[2],
					renderOptions: {
						before: {
							backgroundColor: toCSSColor(match[2]),
							width: "1em",
							height: "1em",
							contentText: "",
							border: "1px solid black"
						}
					}
				});
			}
			console.log(typeof this);
			if (vscode.window.activeTextEditor)
				vscode.window.activeTextEditor.setDecorations(this.colorDecorationBase, options);
			console.log("Done");
		}
		catch (e) {
			console.log(e);
		}
	}
}

function toCSSColor(str: string): string {
	if (str[0] == '#') {
		if (str.length == 8 + 1)
			return "rgba(" + parseInt(str.substr(3, 2), 16) + ", " + parseInt(str.substr(5, 2), 16) + ", " + parseInt(str.substr(7, 2), 16) + ", " + (parseInt(str.substr(1, 2), 16) / 255.0) + ")";
		else
			return str;
	}
	else return str;
}

function mapCompletionType(type: number): vscode.CompletionItemKind {
	if (type == 1)
		return vscode.CompletionItemKind.Class;
	else if (type == 2)
		return vscode.CompletionItemKind.Value;
	else if (type == 3)
		return vscode.CompletionItemKind.Value;
	else if (type == 4)
		return vscode.CompletionItemKind.Color;
	else if (type == 5)
		return vscode.CompletionItemKind.Enum;
	else if (type == 6)
		return vscode.CompletionItemKind.Enum;
	else if (type == 7)
		return vscode.CompletionItemKind.Value;
	else if (type == 8)
		return vscode.CompletionItemKind.Value;
	else if (type == 9)
		return vscode.CompletionItemKind.Keyword;
	else
		return vscode.CompletionItemKind.Text;
}