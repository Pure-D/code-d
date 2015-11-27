import * as ChildProcess from "child_process"
import * as vscode from "vscode"
import { EventEmitter } from "events"

export class WorkspaceD extends EventEmitter implements vscode.CompletionItemProvider, vscode.SignatureHelpProvider {
	constructor(private projectRoot: string) {
		super();
		this.on("error", function(err) {
			console.error(err);
		});
		this.instance = ChildProcess.spawn("workspace-d", [], { cwd: projectRoot });
		this.totalData = new Buffer(0);
		let self = this;
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
			if(!self.dcdReady)
				return reject("DCD not ready");
			let offset = document.offsetAt(position);
			self.request({ cmd: "dcd", subcmd: "list-completion", code: document.getText(), pos: offset }).then((completions) => {
				if(completions.type == "identifiers")
				{
					let items = [];
					completions.identifiers.forEach(element => {
						let item = new vscode.CompletionItem(element.identifier);
						item.kind = self.types[element.type] || vscode.CompletionItemKind.Text;
						items.push(item);
					});
					resolve(items);
				}
				else
				{
					reject("Not a valid completable");
				}
			}, reject);
		});
	}

	provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.SignatureHelp> {
		let self = this;
		return new Promise((resolve, reject) => {
			if(!self.dcdReady)
				return reject("DCD not ready");
			let offset = document.offsetAt(position);
			self.request({ cmd: "dcd", subcmd: "list-completion", code: document.getText(), pos: offset }).then((completions) => {
				if(completions.type == "calltips")
				{
					let help = new vscode.SignatureHelp();
					completions.calltips.forEach(element => {
						help.signatures.push(new vscode.SignatureInformation(element));
					});
					help.activeSignature = 0;
					resolve(help);
				}
				else
				{
					reject("Not a valid signature");
				}
			}, reject);
		});
	}

	private setupDub() {
		let self = this;
		this.request({ cmd: "load", components: ["dub"], dir: this.projectRoot }).then((data) => {
			console.log("dub is ready");
			self.dubReady = true;
			self.setupDCD();
		}, (err) => {
			vscode.window.showErrorMessage("Could not initialize dub. See console for details!");
		});
	}
	
	private setupDCD() {
		let self = this;
		this.request({ cmd: "load", components: ["dcd"], dir: this.projectRoot, autoStart: false }).then((data) => {
					console.log("DCD loaded");
			this.request({ cmd: "dcd", subcmd: "find-and-select-port", port: 9166 }).then((data) => {
					console.log("DCD server port found");
				this.request({ cmd: "dcd", subcmd: "setup-server" }).then((data) => {
					console.log("DCD is ready");
					self.dcdReady = true;
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
		lengthBuffer.writeInt32BE(dataStr.length + 4, 0);
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
		let len = this.totalData.readInt32BE(0);
		if (len >= this.totalData.length - 4) {
			let id = this.totalData.readInt32BE(4);
			let buf = new Buffer(len - 4);
			this.totalData.copy(buf, 0, 8, 4 + len);
			let newBuf = new Buffer(this.totalData.length - 4 - len);
			this.totalData.copy(newBuf, 0, 4 + len);
			this.totalData = newBuf;
			let obj = JSON.parse(buf.toString());
			if (typeof obj == "object" && obj && obj["error"]) {
				this.emit("res-" + id, obj);
				this.emit("error", obj);
			}
			else
				this.emit("res-" + id, null, obj);
		}
	}

	private dubReady : boolean = false;
	private dcdReady : boolean = false;
	private totalData: Buffer;
	private requestNum = 0;
	private instance: ChildProcess.ChildProcess;
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