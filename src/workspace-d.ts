import * as ChildProcess from "child_process"
import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import { EventEmitter } from "events"
import { DlangUIHandler } from "./dlangui"
import { installWorkspaceD } from "./installer"
import { config } from "./extension"

function byteOffsetAt(editor: vscode.TextDocument, pos: vscode.Position): number {
	return Buffer.byteLength(editor.getText(new vscode.Range(new vscode.Position(0, 0), pos)), "utf8");
}

function positionFromByteOffset(editor: vscode.TextDocument, byteOff: number): vscode.Position {
	return editor.positionAt(new Buffer(editor.getText()).slice(0, byteOff).toString("utf8").length);
}

var mixinRegex = /-mixin-\d+$/;
function fixPath(pathStr: string, projectRoot: string, stringImportPaths: string[]): string {
	var match = mixinRegex.exec(pathStr);
	if (match)
		pathStr = pathStr.slice(0, -match[0].length);
	var absPath = path.isAbsolute(pathStr) ? pathStr : path.join(projectRoot, pathStr);
	if (pathStr.endsWith(".d"))
		pathStr = absPath;
	else if (!path.isAbsolute(pathStr)) {
		var found = false;
		for (var i = 0; i < stringImportPaths.length; i++) {
			var importPath = stringImportPaths[i];
			if (!path.isAbsolute(importPath))
				importPath = path.join(projectRoot, importPath);
			var modPath = path.join(importPath, pathStr);
			if (fs.existsSync(modPath)) {
				pathStr = modPath;
				found = true;
				break;
			}
		}
		if (!found)
			pathStr = absPath;
	}
	else
		pathStr = absPath;
	return pathStr;
}

export const TARGET_VERSION = [2, 8, 0];

export class WorkspaceD extends EventEmitter implements
	vscode.CompletionItemProvider,
	vscode.SignatureHelpProvider,
	vscode.WorkspaceSymbolProvider,
	vscode.DocumentSymbolProvider,
	vscode.DefinitionProvider,
	vscode.DocumentFormattingEditProvider,
	vscode.HoverProvider {
	constructor(public projectRoot: string, public processEnv: any) {
		super();
		let self = this;
		this.on("error", function (err) {
			console.error(err);
			if (this.shouldRestart)
				self.ensureDCDRunning();
		});
		this.startWorkspaceD();
	}

	startWorkspaceD() {
		if (!this.shouldRestart)
			return;
		let self = this;
		this.workspaced = true;
		let path = config().get("workspacedPath", "workspace-d");
		this.instance = ChildProcess.spawn(path, [], { cwd: this.projectRoot, env: this.processEnv });
		this.totalData = new Buffer(0);
		this.instance.stderr.on("data", function (chunk) {
			console.log("WorkspaceD Debug: " + chunk);
			if (chunk.toString().indexOf("DCD-Server stopped with code") != -1)
				self.ensureDCDRunning();
		});
		this.instance.stdout.on("data", function (chunk) {
			self.handleData.call(self, chunk);
		});
		this.instance.on("error", function (err) {
			console.log("WorkspaceD ended with an error:");
			console.log(err);
			if (err && (<any>err).code == "ENOENT") {
				vscode.window.showErrorMessage("workspace-d is not installed or points to a folder", "Install workspace-d", "Open User Settings", "Retry").then(s => {
					if (s == "Retry")
						self.startWorkspaceD.call(self);
					else if (s == "Open User Settings")
						vscode.commands.executeCommand("workbench.action.openGlobalSettings");
					else if (s == "Install workspace-d")
						installWorkspaceD(self.processEnv);
				});
				self.workspaced = false;
			}
		});
		this.instance.on("exit", function (code) {
			console.log("WorkspaceD ended with code " + code);
			vscode.window.showWarningMessage("Workspace-D crashed. Please kill dcd-server if neccessary!", "Restart").then(s => {
				if (s == "Restart")
					self.startWorkspaceD.call(self);
			});
		});
		this.emit("workspace-d-start");
		this.checkVersion();
	}

	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
		let self = this;
		console.log("provideCompletionItems");
		return new Promise((resolve, reject) => {
			if (!self.dcdReady)
				return resolve([]);
			let offset = byteOffsetAt(document, position);
			self.request({ cmd: "dcd", subcmd: "list-completion", code: document.getText(), pos: offset }).then((completions) => {
				if (completions.type == "identifiers") {
					let items = [];
					if (completions.identifiers && completions.identifiers.length)
						completions.identifiers.forEach(element => {
							let item = new vscode.CompletionItem(element.identifier);
							item.kind = self.types[element.type] || vscode.CompletionItemKind.Text;
							items.push(item);
						});
					console.log("resolve");
					console.log(items);
					resolve(items);
				}
				else {
					console.log("resolve null");
					resolve([]);
				}
			}, reject);
		});
	}


	extractFunctionParameters(sig: string) {
		let params = [];
		let i = sig.length - 1;

		if (sig[i] == ')')
			i -= 1;

		let paramEnd = i;

		let skip = (open: string, close: string) => {

			i -= 1;

			let depth = 1;

			while (i < 0 && depth > 0) {
				if (sig[i] == open) {
					depth += 1;
				}
				else if (sig[i] == close) {
					depth -= 1;
				}

				i -= 1;
			}

		};

		while (i >= 0) {
			switch (sig[i]) {
				case ',':
					params.push(sig.substr(i + 1, paramEnd - i).trim());
					i -= 1;
					paramEnd = i;
					break;
				case ';':
				case '(':
					let param = sig.substr(i + 1, paramEnd - i).trim();

					if (param.length != 0)
						params.push(param);

					return params.reverse();
				case ')':
					skip(')', '(');
					break;
				case '}':
					skip('}', '{');
					break;
				case ']':
					skip(']', '[');
					break;
				default:
					i -= 1;
			}
		}

		return params;
	}

	provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.SignatureHelp> {
		let self = this;
		console.log("provideSignatureHelp");
		return new Promise((resolve, reject) => {
			if (!self.dcdReady)
				return resolve(null);
			let offset = byteOffsetAt(document, position);
			self.request({ cmd: "dcd", subcmd: "list-completion", code: document.getText(), pos: offset }).then((completions) => {
				if (completions.type == "calltips") {
					let help = new vscode.SignatureHelp();
					if (completions.calltips && completions.calltips.length) {
						let paramsCounts = [];
						completions.calltips.forEach(element => {
							let sig = new vscode.SignatureInformation(element);
							let params = self.extractFunctionParameters(element);

							paramsCounts.push(params.length - 1);

							params.forEach(param => {
								sig.parameters.push(new vscode.ParameterInformation(param));
							});

							help.signatures.push(sig);
						});

						let text = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
						let extractedParams = self.extractFunctionParameters(text);
						help.activeParameter = Math.max(0, extractedParams.length - 1);
						let possibleFunctions = [];
						for (var i = 0; i < paramsCounts.length; i++) {
							if (paramsCounts[i] >= extractedParams.length - 1)
								possibleFunctions.push(i);
						}
						help.activeSignature = possibleFunctions[0] || 0;
					}

					console.log("resolve");
					resolve(help);
				}
				else {
					console.log("resolve null");
					resolve(null);
				}
			}, reject);
		});
	}

	provideWorkspaceSymbols(query: string, token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
		let self = this;
		console.log("provideWorkspaceSymbols");
		return new Promise((resolve, reject) => {
			if (!self.dcdReady)
				return resolve([]);
			self.request({ cmd: "dcd", subcmd: "search-symbol", query: query }).then((symbols) => {
				let found = [];
				if (symbols && symbols.length)
					symbols.forEach(element => {
						let type = self.types[element.type] || vscode.CompletionItemKind.Text;
						let range = new vscode.Range(1, 1, 1, 1);
						let uri = vscode.Uri.file(element.file);
						vscode.workspace.textDocuments.forEach(doc => {
							if (doc.uri.fsPath == uri.fsPath) {
								range = doc.getWordRangeAtPosition(positionFromByteOffset(doc, element.position));
							}
						});
						let entry = new vscode.SymbolInformation(query, type, range, uri);
						if (entry && range)
							found.push(entry);
					});
				console.log("resolve");
				console.log(found);
				resolve(found);
			}, reject);
		});
	}

	provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
		let self = this;
		console.log("provideDocumentSymbols");
		return new Promise((resolve, reject) => {
			if (!self.dscannerReady)
				return resolve([]);
			self.request({ cmd: "dscanner", subcmd: "list-definitions", file: document.uri.fsPath }).then(definitions => {
				let informations: vscode.SymbolInformation[] = [];
				if (definitions && definitions.length)
					definitions.forEach(element => {
						let container = undefined;
						let range = new vscode.Range(element.line - 1, 0, element.line - 1, 0);
						let type = self.scanTypes[element.type];
						if (element.type == "f" && element.name == "this")
							type = vscode.SymbolKind.Constructor;
						if (element.attributes.struct)
							container = element.attributes.struct;
						if (element.attributes.class)
							container = element.attributes.class;
						if (element.attributes.enum)
							container = element.attributes.enum;
						if (element.attributes.union)
							container = element.attributes.union;
						informations.push(new vscode.SymbolInformation(element.name, type, range, document.uri, container));
					});
				console.log("resolve");
				console.log(informations);
				resolve(informations);
			}, reject);
		});
	}

	provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Hover> {
		let self = this;
		console.log("provideHover");
		return new Promise((resolve, reject) => {
			if (!self.dcdReady)
				return resolve(null);
			let offset = byteOffsetAt(document, position);
			self.request({ cmd: "dcd", subcmd: "get-documentation", code: document.getText(), pos: offset }).then((documentation) => {
				if (!documentation || documentation.trim().length == 0) {
					console.log("resolve null");
					return resolve(null);
				}
				console.log("resolve");
				console.log(new vscode.Hover({ language: "ddoc", value: documentation.trim() }));
				resolve(new vscode.Hover({ language: "ddoc", value: documentation.trim() }));
			}, reject);
		});
	}

	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Definition> {
		let self = this;
		console.log("provideDefinition");
		return new Promise((resolve, reject) => {
			if (!self.dcdReady)
				return resolve(null);
			let offset = byteOffsetAt(document, position);
			self.request({ cmd: "dcd", subcmd: "find-declaration", code: document.getText(), pos: offset }).then((declaration) => {
				if (!declaration) {
					console.log("Resolve null");
					return resolve(null);
				}
				let range = new vscode.Range(1, 1, 1, 1);
				let uri = document.uri;
				if (declaration[0] != "stdin")
					uri = vscode.Uri.file(declaration[0]);
				vscode.workspace.textDocuments.forEach(doc => {
					if (doc.uri.fsPath == uri.fsPath) {
						let pos = positionFromByteOffset(doc, declaration[1]);
						if (!pos)
							pos = new vscode.Position(1, 1);
						range = doc.getWordRangeAtPosition(pos);
						if (!range)
							range = new vscode.Range(pos, pos);
					}
				});
				if (!range)
					range = new vscode.Range(1, 1, 1, 1);
				console.log("resolve");
				console.log(new vscode.Location(uri, range));
				resolve(new vscode.Location(uri, range));
			}, reject);
		});
	}

	provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]> {
		let self = this;
		console.log("provideDocumentFormattingEdits");
		return new Promise((resolve, reject) => {
			if (!self.dfmtReady)
				return resolve([]);
			var request: { cmd: string, code: string, arguments?: string[] } = {
				cmd: "dfmt",
				code: document.getText()
			};
			if (config().get("overrideDfmtEditorconfig", true)) {
				var dfmt = vscode.workspace.getConfiguration("dfmt");
				var maxLineLength = 120;
				var softMaxLineLength = 80;
				var rulers = vscode.workspace.getConfiguration("editor").get<number[]>("rulers", []);
				if (rulers.length == 1) {
					maxLineLength = rulers[0];
					softMaxLineLength = maxLineLength - 40;
				}
				else if (rulers.length >= 2) {
					maxLineLength = rulers[rulers.length - 1];
					softMaxLineLength = rulers[rulers.length - 2];
				}
				request.arguments = [
					"--align_switch_statements", dfmt.get("alignSwitchStatements", true).toString(),
					"--brace_style", dfmt.get("braceStyle", "allman"),
					"--end_of_line", document.getText(document.lineAt(0).rangeIncludingLineBreak).endsWith("\r\n") ? "crlf" : "lf",
					"--indent_size", options.tabSize.toString(),
					"--indent_style", options.insertSpaces ? "space" : "tab",
					"--max_line_length", maxLineLength.toString(),
					"--soft_max_line_length", softMaxLineLength.toString(),
					"--outdent_attributes", dfmt.get("outdentAttributes", true).toString(),
					"--space_after_cast", dfmt.get("spaceAfterCast", true).toString(),
					"--split_operator_at_line_end", dfmt.get("splitOperatorAtLineEnd", false).toString(),
					"--tab_width", options.tabSize.toString(),
					"--selective_import_space", dfmt.get("selectiveImportSpace", true).toString(),
					"--compact_labeled_statements", dfmt.get("compactLabeledStatements", true).toString(),
					"--template_constraint_style", dfmt.get("templateConstraintStyle", "conditional_newline_indent")
				];
			}
			self.request(request).then((formatted) => {
				let lastLine = document.lineCount;
				let lastLineLastCol = document.lineAt(lastLine - 1).range.end.character;
				let range = new vscode.Range(0, 0, lastLine - 1, lastLineLastCol);
				console.log("resolve");
				console.log([new vscode.TextEdit(range, formatted)]);
				resolve([new vscode.TextEdit(range, formatted)]);
			}, reject);
		});
	}

	lint(document: vscode.TextDocument): Thenable<[vscode.Uri, vscode.Diagnostic[]][]> {
		let self = this;
		console.log("lint");
		return new Promise((resolve, reject) => {
			if (!self.dscannerReady)
				return resolve([]);
			let useProjectIni = fs.existsSync(path.join(self.projectRoot, "dscanner.ini"));
			self.request({ cmd: "dscanner", subcmd: "lint", file: document.uri.fsPath, ini: useProjectIni ? path.join(self.projectRoot, "dscanner.ini") : "" }).then(issues => {
				let diagnostics: vscode.Diagnostic[] = [];
				if (issues && issues.length)
					issues.forEach(element => {
						let range = document.getWordRangeAtPosition(new vscode.Position(Math.max(0, element.line - 1), element.column));
						if (!range || !range.start)
							range = new vscode.Range(Math.max(0, element.line - 1), element.column, Math.max(0, element.line - 1), element.column + 1);
						console.log(range);
						if (range)
							diagnostics.push(new vscode.Diagnostic(range, element.description, self.mapLintType(element.type)));
					});
				console.log("Resolve");
				console.log([[document.uri, diagnostics]]);
				resolve([[document.uri, diagnostics]]);
			}, reject);
		});
	}

	dubBuild(document: vscode.TextDocument): Thenable<[vscode.Uri, vscode.Diagnostic[]][]> {
		console.log("dubBuild");
		return new Promise((resolve, reject) => {
			if (!this.dubReady)
				return resolve([]);
			this.listStringImports().then((stringImportPaths) => {
				this.request({ cmd: "dub", subcmd: "build" }).then((issues: { line: number, column: number, file: string, type: number, text: string }[]) => {
					let diagnostics: [vscode.Uri, vscode.Diagnostic[]][] = [];
					if (issues && issues.length)
						issues.forEach(element => {
							let range = new vscode.Range(Math.max(0, element.line - 1), element.column - 1, Math.max(0, element.line - 1), element.column + 500);
							let uri = vscode.Uri.file(fixPath(element.file, this.projectRoot, stringImportPaths));
							let error = new vscode.Diagnostic(range, element.text, this.mapDubLintType(element.type));
							let found = false;
							diagnostics.forEach(element => {
								if (element[0].fsPath == uri.fsPath) {
									found = true;
									element[1].push(error);
								}
							});
							if (!found)
								diagnostics.push([uri, [error]]);
						});
					console.log("Resolve");
					console.log(diagnostics);
					resolve(diagnostics);
				});
			});
		});
	}

	dispose() {
		this.shouldRestart = false;
		console.log("Disposing");
		let to = setTimeout(this.instance.kill, 150);
		this.request({ cmd: "unload", components: "*" }).then((data) => {
			console.log("Unloaded");
			this.instance.kill();
			clearTimeout(to);
		});
	}

	upgrade() {
		return this.request({ cmd: "dub", subcmd: "upgrade" });
	}

	listConfigurations(): Thenable<string[]> {
		return this.request({ cmd: "dub", subcmd: "list:configurations" });
	}

	getConfiguration(): Thenable<string> {
		return this.request({ cmd: "dub", subcmd: "get:configuration" });
	}

	setConfiguration(config: string): Thenable<boolean> {
		return this.request({ cmd: "dub", subcmd: "set:configuration", configuration: config }).then((success) => {
			if (success) {
				this.listImports().then(console.log);
				this.emit("configuration-change", config);
				if (this.dcdReady) {
					this.request({ cmd: "dcd", subcmd: "refresh-imports" }).then(() => {
						console.log("Updated completion for dcd");
					});
				}
			}
			else
				vscode.window.showInformationMessage("No import paths available for this project. Autocompletion could be broken!", "Switch Configuration").then((s) => {
					if (s == "Switch Configuration") {
						vscode.commands.executeCommand("code-d.switchConfiguration");
					}
				});
			return success;
		});
	}

	getCompiler(): Thenable<string> {
		return this.request({ cmd: "dub", subcmd: "get:compiler" });
	}

	setCompiler(comp: string): Thenable<boolean> {
		return this.request({ cmd: "dub", subcmd: "set:compiler", compiler: comp }).then((success) => {
			if (success) {
				this.listImports().then(console.log);
				this.getCompiler().then(comp => this.emit("compiler-change", comp));
				if (this.dcdReady) {
					this.request({ cmd: "dcd", subcmd: "refresh-imports" }).then(() => {
						console.log("Updated completion for dcd");
					});
				}
			}
			else
				vscode.window.showErrorMessage("Could not switch compiler", "Switch Compiler").then((s) => {
					if (s == "Switch Compiler") {
						vscode.commands.executeCommand("code-d.switchCompiler");
					}
				});
			return success;
		});
	}

	listArchTypes(): Thenable<string[]> {
		return this.request({ cmd: "dub", subcmd: "list:arch-types" });
	}

	getArchType(): Thenable<string> {
		return this.request({ cmd: "dub", subcmd: "get:arch-type" });
	}

	setArchType(arch: string): Thenable<boolean> {
		return this.request({ cmd: "dub", subcmd: "set:arch-type", "arch-type": arch }).then((success) => {

			if (success)
				this.emit("arch-type-change", arch);
			else
				vscode.window.showInformationMessage("Could not switch arch type", "Switch Arch Type").then((s) => {
					if (s == "Switch Arch Type") {
						vscode.commands.executeCommand("code-d.switchArchType");
					}
				});

			return success;
		},
			err => {
				console.error(err);
				vscode.window.showErrorMessage("Failed to switch arch type. See console for details.");
				return false;
			});
	}

	listBuildTypes(): Thenable<string[]> {
		return this.request({ cmd: "dub", subcmd: "list:build-types" });
	}

	getBuildType(): Thenable<string> {
		return this.request({ cmd: "dub", subcmd: "get:build-type" });
	}

	setBuildType(config: string): Thenable<boolean> {
		return this.request({ cmd: "dub", subcmd: "set:build-type", "build-type": config }).then((success) => {
			if (success) {
				this.request({ cmd: "dub", subcmd: "list:import" }).then(console.log);
				this.emit("build-type-change", config);
			}
			else
				vscode.window.showInformationMessage("No import paths available for this build type. Autocompletion could be broken!", "Switch Build Type").then((s) => {
					if (s == "Switch Build Type") {
						vscode.commands.executeCommand("code-d.switchBuildType");
					}
				});
			return success;
		});
	}

	killServer(): Thenable<any> {
		if (!this.dcdReady)
			return new Promise((resolve, reject) => { reject(); });
		return this.request({ cmd: "dcd", subcmd: "kill-server" });
	}

	restartServer(): Thenable<any> {
		if (!this.dcdReady)
			return new Promise((resolve, reject) => { reject(); });
		return this.request({ cmd: "dcd", subcmd: "restart-server" });
	}

	updateImports(): Thenable<boolean> {
		return new Promise((resolve, reject) => {
			if (!this.dubReady)
				reject();
			this.request({ cmd: "dub", subcmd: "update" }).then((success) => {
				if (!success)
					return resolve(success);
				if (this.dcdReady) {
					this.request({ cmd: "dcd", subcmd: "refresh-imports" }).then(() => {
						resolve(true);
						this.listImports().then(console.log);
					}, reject);
				} else {
					vscode.window.showWarningMessage("Could not update DCD. Please restart DCD if its not working properly");
					resolve(true);
				}
			}, reject);
		});
	}

	listImports(): Thenable<string[]> {
		if (!this.dubReady)
			return new Promise((resolve, reject) => { resolve([]); });
		return this.request({ cmd: "dub", subcmd: "list:import" });
	}

	listStringImports(): Thenable<string[]> {
		if (!this.dubReady)
			return new Promise((resolve, reject) => { resolve([]); });
		return this.request({ cmd: "dub", subcmd: "list:string-import" });
	}

	getDlangUI(subs: vscode.Disposable[]): DlangUIHandler {
		var decoType = vscode.window.createTextEditorDecorationType({});
		subs.push(decoType);
		var handler = new DlangUIHandler(this, decoType);
		vscode.workspace.onDidChangeTextDocument(e => handler.fileUpdate(e));
		return handler;
	}

	public mapLintType(type: string): vscode.DiagnosticSeverity {
		switch (type) {
			case "warn":
				return vscode.DiagnosticSeverity.Warning;
			case "error":
			default:
				return vscode.DiagnosticSeverity.Error;
		}
	}

	public mapDubLintType(type: number): vscode.DiagnosticSeverity {
		switch (type) {
			case 2:
				return vscode.DiagnosticSeverity.Information;
			case 1:
				return vscode.DiagnosticSeverity.Warning;
			case 0:
			default:
				return vscode.DiagnosticSeverity.Error;
		}
	}

	public checkResponsiveness(): Thenable<boolean> {
		return new Promise((resolve) => {
			var unresponsiveTimeout = setTimeout(() => {
				vscode.window.showWarningMessage("Workspace-D is unresponsive. Auto completion might not work", "Restart").then(s => {
					if (s == "Restart") {
						this.shouldRestart = true;
						try {
							process.kill(-this.instance.pid);
						}
						catch (e) {
							vscode.window.showErrorMessage("Could not kill workspace-d. Please manually kill it! PID: " + this.instance.pid);
						}
						this.startWorkspaceD();
					}
				});
				resolve(false);
			}, 10 * 1000);
			this.request({ cmd: "version" }).then(version => {
				clearTimeout(unresponsiveTimeout);
				resolve(true);
			});
		});
	}

	public checkVersion() {
		this.request({ cmd: "version" }).then((version) => {
			let callback = (r) => {
				if (r == "Install newest version")
					installWorkspaceD(this.processEnv);
			};
			if (version.major < TARGET_VERSION[0])
				return vscode.window.showErrorMessage("workspace-d is outdated! Please update to continue using this plugin. (target="
					+ formatVersion(TARGET_VERSION) + ", workspaced=" + formatVersion([version.major, version.minor, version.patch]) + ")",
					"Install newest version").then(callback);
			if (version.major == TARGET_VERSION[0] && version.minor < TARGET_VERSION[1])
				vscode.window.showWarningMessage("workspace-d might be outdated! Please update if things are not working as expected. (target="
					+ formatVersion(TARGET_VERSION) + ", workspaced=" + formatVersion([version.major, version.minor, version.patch]) + ")",
					"Install newest version").then(callback);
			if (version.major == TARGET_VERSION[0] && version.minor == TARGET_VERSION[1] && version.patch < TARGET_VERSION[2])
				vscode.window.showInformationMessage("workspace-d has a new optional update! Please update before submitting a bug report. (target="
					+ formatVersion(TARGET_VERSION) + ", workspaced=" + formatVersion([version.major, version.minor, version.patch]) + ")",
					"Install newest version").then(callback);
			this.setupDub();
		}, () => {
			vscode.window.showErrorMessage("Could not identify workspace-d version. Please update workspace-d!");
		});
	}

	private dubPackageDescriptorExists() {
		return fs.existsSync(path.join(this.projectRoot, "dub.json")) ||
			fs.existsSync(path.join(this.projectRoot, "dub.sdl")) ||
			fs.existsSync(path.join(this.projectRoot, "package.json"));
	}

	public setupDub() {
		if (config().get("neverUseDub", false)) {
			this.setupCustomWorkspace();
			return;
		}
		if (this.dubPackageDescriptorExists()) {
			this.request({ cmd: "load", components: ["dub"], dir: this.projectRoot }).then((data) => {
				console.log("dub is ready");
				this.dubReady = true;
				this.emit("dub-ready");
				this.setupDCD();
				this.setupDScanner();
				this.setupDfmt();
				this.setupDlangUI();
				this.listConfigurations().then((configs) => {
					if (configs.length == 0) {
						vscode.window.showInformationMessage("No configurations available for this project. Autocompletion could be broken!");
					} else {
						var defaultConfig = config().get("dubConfiguration", "");
						if (defaultConfig) {
							if (configs.indexOf(defaultConfig) == -1) {
								vscode.window.showErrorMessage("Configuration '" + defaultConfig + "' which is specified in the config is not available!");
								return this.setConfiguration(configs[0]);
							}
							else {
								return this.setConfiguration(defaultConfig);
							}
						}
						else {
							return this.setConfiguration(configs[0]);
						}
					}
				}).then(success => {
					console.log("Configuration: " + success);
					var defaultArchType = config().get("dubArchType", "");
					var defaultBuildType = config().get("dubBuildType", "");
					var defaultCompiler = config().get("dubCompiler", "");
					if (defaultArchType) {
						this.setArchType(defaultArchType).then(success => {
							if (!success)
								vscode.window.showErrorMessage("Arch Type '" + defaultArchType + "' which is specified in the config is not available!");
						});
					}
					if (defaultBuildType) {
						this.setBuildType(defaultBuildType).then(success => {
							if (!success)
								vscode.window.showErrorMessage("Build Type '" + defaultBuildType + "' which is specified in the config is not available!");
						});
					}
					if (defaultCompiler) {
						this.setCompiler(defaultCompiler).then(success => {
							if (!success)
								vscode.window.showErrorMessage("Compiler '" + defaultCompiler + "' which is specified in the config is not available!");
						});
					}
				});
			}, (err) => {
				vscode.window.showWarningMessage("Could not initialize dub. Falling back to limited functionality!");
				this.setupCustomWorkspace();
			});
		}
		else this.setupCustomWorkspace();
	}

	private getPossibleSourceRoots(): string[] {
		let confPaths = config().get("projectImportPaths", []);
		if (confPaths && confPaths.length) {
			let roots = [];
			confPaths.forEach(p => {
				if (path.isAbsolute(p))
					roots.push(p);
				else
					roots.push(path.join(this.projectRoot, p));
			});
			return roots;
		}
		if (fs.existsSync(path.join(this.projectRoot, "source")))
			return [path.join(this.projectRoot, "source")];
		if (fs.existsSync(path.join(this.projectRoot, "src")))
			return [path.join(this.projectRoot, "src")];
		return [this.projectRoot];
	}

	public setupCustomWorkspace() {
		let paths = this.getPossibleSourceRoots();
		let rootDir = paths[0];
		let addPaths = [];
		if (paths.length > 1)
			addPaths = paths.slice(1);
		this.request({ cmd: "load", components: ["fsworkspace"], dir: rootDir, additionalPaths: addPaths }).then((data) => {
			console.log("fsworkspace is ready");
			this.setupDCD();
			this.setupDScanner();
			this.setupDfmt();
			this.setupDlangUI();
		}, (err) => {
			vscode.window.showErrorMessage("Could not initialize fsworkspace. See console for details!");
		});
	}

	public setupDScanner() {
		this.request({ cmd: "load", components: ["dscanner"], dir: this.projectRoot, dscannerPath: config().get("dscannerPath", "dscanner") }).then((data) => {
			console.log("DScanner is ready");
			this.emit("dscanner-ready");
			this.dscannerReady = true;
		});
	}

	public setupDCD() {
		if (config().get("enableAutoComplete", true))
			this.request({
				cmd: "load",
				components: ["dcd"],
				dir: this.projectRoot,
				autoStart: false,
				clientPath: config().get("dcdClientPath", "dcd-client"),
				serverPath: config().get("dcdServerPath", "dcd-server")
			}).then((data) => {
				this.startDCD();
			}, (err) => {
				vscode.window.showErrorMessage("Could not initialize DCD. See console for details!");
			});
	}

	public setupDfmt() {
		this.request({ cmd: "load", components: ["dfmt"], dir: this.projectRoot, dfmtPath: config().get("dfmtPath", "dfmt") }).then((data) => {
			console.log("Dfmt is ready");
			this.emit("dfmt-ready");
			this.dfmtReady = true;
		});
	}

	public setupDlangUI() {
		this.request({ cmd: "load", components: ["dlangui"] }).then((data) => {
			console.log("DlangUI is ready");
			this.emit("dlangui-ready");
			this.dlanguiReady = true;
		});
	}

	public ensureDCDRunning() {
		if (!this.dcdReady)
			return;
		if (!this.shouldRestart)
			return;
		clearTimeout(this.runCheckTimeout);
		this.runCheckTimeout = setTimeout((() => {
			console.log("Checking status...");
			this.request({ cmd: "dcd", subcmd: "status" }).then((status) => {
				console.log("Status:");
				console.log(status);
				if (!status.isRunning) {
					console.error("Restarting DCD");
					this.startDCD();
				}
			});
		}).bind(this), 500);
	}

	public startDCD() {
		this.request({
			cmd: "dcd",
			subcmd: "find-and-select-port",
			port: 9166
		}).then((data) => {
			this.request({ cmd: "dcd", subcmd: "start-server", additionalImports: vscode.workspace.getConfiguration("d").get("stdlibPath", ["/usr/include/dmd/druntime/import", "/usr/include/dmd/phobos"]) }).then((data) => {
				console.log("DCD is ready");
				this.emit("dcd-ready");
				this.dcdReady = true;
				if (this.dcdReady) {
					this.request({ cmd: "dcd", subcmd: "refresh-imports" }).then(() => {
						this.listImports().then((paths) => {
							console.log("Loaded completions for " + paths.length + " import paths");
						});
					});
				} else {
					vscode.window.showWarningMessage("Could not update DCD. Please restart DCD if its not working properly");
				}
			}, (err) => {
				vscode.window.showErrorMessage("Could not initialize DCD. See console for details!");
			});
		}, (err) => {
			vscode.window.showErrorMessage("Could not initialize DCD. See console for details!");
		});
	}

	public request(data): Thenable<any> {
		let lengthBuffer = new Buffer(4);
		let idBuffer = new Buffer(4);
		let dataStr = JSON.stringify(data);
		lengthBuffer.writeInt32BE(Buffer.byteLength(dataStr, "utf8") + 4, 0);
		let reqID = this.requestNum++;
		idBuffer.writeInt32BE(reqID, 0);
		let buf = Buffer.concat([lengthBuffer, idBuffer, new Buffer(dataStr, "utf8")]);
		this.instance.stdin.write(buf);
		return new Promise((resolve, reject) => {
			this.once("res-" + reqID, function (error, data) {
				if (error)
					reject(error);
				else
					resolve(data);
			});
		});
	}

	public handleData(chunk) {
		this.totalData = Buffer.concat([this.totalData, chunk]);
		while (this.handleChunks());
	}

	public handleChunks() {
		if (this.totalData.length < 8)
			return false;
		let len = this.totalData.readInt32BE(0);
		if (this.totalData.length >= len + 4) {
			let id = this.totalData.readInt32BE(4);
			let buf = new Buffer(len - 4);
			this.totalData.copy(buf, 0, 8, 4 + len);
			let newBuf = new Buffer(this.totalData.length - 4 - len);
			this.totalData.copy(newBuf, 0, 4 + len);
			this.totalData = newBuf;
			let obj = JSON.parse(buf.toString());
			if (typeof obj == "object" && obj && obj["error"]) {
				this.emit("error", obj);
				this.emit("res-" + id, obj);
			}
			else
				this.emit("res-" + id, null, obj);
			return true;
		}
		return false;
	}

	public runCheckTimeout: NodeJS.Timer;
	public workspaced: boolean = true;
	public dubReady: boolean = false;
	public dcdReady: boolean = false;
	public dfmtReady: boolean = false;
	public dlanguiReady: boolean = false;
	public dscannerReady: boolean = false;
	public shouldRestart: boolean = true;
	public totalData: Buffer;
	public requestNum = 0;
	public instance: ChildProcess.ChildProcess;
	public scanTypes = {
		g: vscode.SymbolKind.Enum,
		e: vscode.SymbolKind.Field,
		v: vscode.SymbolKind.Variable,
		i: vscode.SymbolKind.Interface,
		c: vscode.SymbolKind.Class,
		s: vscode.SymbolKind.Class,
		f: vscode.SymbolKind.Function,
		u: vscode.SymbolKind.Class,
		T: vscode.SymbolKind.Property,
		a: vscode.SymbolKind.Field
	};
	public types = {
		c: vscode.CompletionItemKind.Class,
		i: vscode.CompletionItemKind.Interface,
		s: vscode.CompletionItemKind.Unit,
		u: vscode.CompletionItemKind.Unit,
		v: vscode.CompletionItemKind.Variable,
		m: vscode.CompletionItemKind.Field,
		k: vscode.CompletionItemKind.Keyword,
		f: vscode.CompletionItemKind.Function,
		g: vscode.CompletionItemKind.Enum,
		e: vscode.CompletionItemKind.Field,
		P: vscode.CompletionItemKind.Module,
		M: vscode.CompletionItemKind.Module,
		a: vscode.CompletionItemKind.Variable,
		A: vscode.CompletionItemKind.Variable,
		l: vscode.CompletionItemKind.Reference,
		t: vscode.CompletionItemKind.Property,
		T: vscode.CompletionItemKind.Property,
	};
}

function formatVersion(version: number[]): string {
	return version[0] + "." + version[1] + "." + version[2];
}