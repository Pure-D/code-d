import * as ChildProcess from "child_process"
import * as vscode from "vscode"
import { EventEmitter } from "events"

export class WorkspaceD extends EventEmitter implements
	vscode.CompletionItemProvider,
	vscode.SignatureHelpProvider,
	vscode.WorkspaceSymbolProvider,
	vscode.DocumentSymbolProvider,
	vscode.DefinitionProvider,
	vscode.HoverProvider {
	constructor(private projectRoot: string) {
		super();
		let self = this;
		this.on("error", function(err) {
			console.error(err);
			self.ensureDCDRunning();
		});
		this.instance = ChildProcess.spawn("workspace-d", [], { cwd: projectRoot });
		this.totalData = new Buffer(0);
		this.instance.stderr.on("data", function(chunk) {
			console.log("WorkspaceD Debug: " + chunk);
		});
		this.instance.stdout.on("data", function(chunk) {
			self.handleData.call(self, chunk);
		});
		this.setupDub();
	}

	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
		let self = this;
		return new Promise((resolve, reject) => {
			if (!self.dcdReady)
				return reject("DCD not ready");
			let offset = document.offsetAt(position);
			self.request({ cmd: "dcd", subcmd: "list-completion", code: document.getText(), pos: offset }).then((completions) => {
				if (completions.type == "identifiers") {
					let items = [];
					completions.identifiers.forEach(element => {
						let item = new vscode.CompletionItem(element.identifier);
						item.kind = self.types[element.type] || vscode.CompletionItemKind.Text;
						items.push(item);
					});
					resolve(items);
				}
				else {
					reject("Not a valid completable");
				}
			}, reject);
		});
	}

	provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.SignatureHelp> {
		let self = this;
		return new Promise((resolve, reject) => {
			if (!self.dcdReady)
				return reject("DCD not ready");
			let offset = document.offsetAt(position);
			self.request({ cmd: "dcd", subcmd: "list-completion", code: document.getText(), pos: offset }).then((completions) => {
				if (completions.type == "calltips") {
					let help = new vscode.SignatureHelp();
					completions.calltips.forEach(element => {
						help.signatures.push(new vscode.SignatureInformation(element));
					});
					resolve(help);
				}
				else {
					reject("Not a valid signature");
				}
			}, reject);
		});
	}

	provideWorkspaceSymbols(query: string, token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
		let self = this;
		return new Promise((resolve, reject) => {
			if (!self.dcdReady)
				return reject("DCD not ready");
			self.request({ cmd: "dcd", subcmd: "search-symbol", query: query }).then((symbols) => {
				let found = [];
				symbols.forEach(element => {
					let type = self.types[element.type] || vscode.CompletionItemKind.Text;
					let range = new vscode.Range(1, 1, 1, 1);
					let uri = vscode.Uri.file(element.file);
					vscode.workspace.textDocuments.forEach(doc => {
						if (doc.uri.fsPath == uri.fsPath) {
							range = doc.getWordRangeAtPosition(doc.positionAt(element.position));
						}
					});
					let entry = new vscode.SymbolInformation(query, type, range, uri);
					found.push(entry);
				});
				resolve(found);
			}, reject);
		});
	}

	provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): Thenable<vscode.SymbolInformation[]> {
		let self = this;
		return new Promise((resolve, reject) => {
			if (!self.dscannerReady)
				return reject("DScanner not ready");
			self.request({ cmd: "dscanner", subcmd: "list-definitions", file: document.uri.fsPath }).then(definitions => {
				let informations: vscode.SymbolInformation[] = [];
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
				resolve(informations);
			}, reject);
		});
	}

	provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Hover> {
		let self = this;
		return new Promise((resolve, reject) => {
			if (!self.dcdReady)
				return reject("DCD not ready");
			let offset = document.offsetAt(position);
			self.request({ cmd: "dcd", subcmd: "get-documentation", code: document.getText(), pos: offset }).then((documentation) => {
				if (!documentation || documentation.trim().length == 0)
					return reject();
				resolve(new vscode.Hover({ language: "ddoc", value: documentation.trim() }));
			}, reject);
		});
	}

	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Definition> {
		let self = this;
		return new Promise((resolve, reject) => {
			if (!self.dcdReady)
				return reject("DCD not ready");
			let offset = document.offsetAt(position);
			self.request({ cmd: "dcd", subcmd: "find-declaration", code: document.getText(), pos: offset }).then((declaration) => {
				if(!declaration)
					return reject();
				let range = new vscode.Range(1, 1, 1, 1);
				let uri = document.uri;
				if (declaration[0] != "stdin")
					uri = vscode.Uri.file(declaration[0]);
				vscode.workspace.textDocuments.forEach(doc => {
					if (doc.uri.fsPath == uri.fsPath) {
						range = doc.getWordRangeAtPosition(doc.positionAt(declaration[1]));
					}
				});
				resolve(new vscode.Location(uri, range));
			}, reject);
		});
	}

	lint(document: vscode.TextDocument): Thenable<vscode.Diagnostic[]> {
		let self = this;
		return new Promise((resolve, reject) => {
			if (!self.dscannerReady)
				return reject("DScanner not ready");
			self.request({ cmd: "dscanner", subcmd: "lint", file: document.uri.fsPath }).then(issues => {
				let diagnostics: vscode.Diagnostic[] = [];
				issues.forEach(element => {
					let range = document.getWordRangeAtPosition(new vscode.Position(element.line - 1, element.column - 1));
					diagnostics.push(new vscode.Diagnostic(range, element.description, self.mapLintType(element.type)));
				});
				resolve(diagnostics);
			}, reject);
		});
	}

	dispose() {
		console.log("Disposing");
		this.request({ cmd: "unload", components: "*" }).then((data) => {
			console.log("Unloaded " + data.join(", "));
		});
		this.instance.kill();
	}

	private mapLintType(type: string): vscode.DiagnosticSeverity {
		switch (type) {
			case "warn":
				return vscode.DiagnosticSeverity.Warning;
			case "error":
			default:
				return vscode.DiagnosticSeverity.Error;
		}
	}

	private setupDub() {
		let self = this;
		this.request({ cmd: "load", components: ["dub"], dir: this.projectRoot }).then((data) => {
			console.log("dub is ready");
			self.dubReady = true;
			self.setupDCD();
			self.setupDScanner();
		}, (err) => {
			vscode.window.showErrorMessage("Could not initialize dub. See console for details!");
		});
	}

	private setupDScanner() {
		let self = this;
		this.request({ cmd: "load", components: ["dscanner"], dir: this.projectRoot }).then((data) => {
			console.log("DScanner is ready");
			self.dscannerReady = true;
		});
	}

	private setupDCD() {
		this.request({ cmd: "load", components: ["dcd"], dir: this.projectRoot, autoStart: false }).then((data) => {
			this.startDCD();
		}, (err) => {
			vscode.window.showErrorMessage("Could not initialize DCD. See console for details!");
		});
	}

	private ensureDCDRunning() {
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

	private startDCD() {
		this.request({ cmd: "dcd", subcmd: "find-and-select-port", port: 9166 }).then((data) => {
			this.request({ cmd: "dcd", subcmd: "setup-server" }).then((data) => {
				this.request({ cmd: "dcd", subcmd: "add-imports", imports: ["/usr/include/dmd/druntime/import", "/usr/include/dmd/phobos"] }).then((data) => {
					console.log("DCD is ready");
					this.dcdReady = true;
				}, (err) => {
					vscode.window.showErrorMessage("Could not initialize DCD. See console for details!");
				});
			}, (err) => {
				vscode.window.showErrorMessage("Could not initialize DCD. See console for details!");
			});
		}, (err) => {
			vscode.window.showErrorMessage("Could not initialize DCD. See console for details!");
		});
	}

	private request(data): Thenable<any> {
		let lengthBuffer = new Buffer(4);
		let idBuffer = new Buffer(4);
		let dataStr = JSON.stringify(data);
		lengthBuffer.writeInt32BE(Buffer.byteLength(dataStr, "utf8") + 4, 0);
		let reqID = this.requestNum++;
		idBuffer.writeInt32BE(reqID, 0);
		let buf = Buffer.concat([lengthBuffer, idBuffer, new Buffer(dataStr, "utf8")]);
		this.instance.stdin.write(buf);
		let self = this;
		return new Promise((resolve, reject) => {
			self.once("res-" + reqID, function(error, data) {
				if (error)
					reject(error);
				else
					resolve(data);
			});
		});
	}

	private handleData(chunk) {
		this.totalData = Buffer.concat([this.totalData, chunk]);
		while (this.handleChunks());
	}

	private handleChunks() {
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

	private runCheckTimeout = -1;
	private dubReady: boolean = false;
	private dcdReady: boolean = false;
	private dscannerReady: boolean = false;
	private totalData: Buffer;
	private requestNum = 0;
	private instance: ChildProcess.ChildProcess;
	private scanTypes = {
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
	private types = {
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