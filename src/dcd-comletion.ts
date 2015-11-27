"use strict";

import * as vscode from "vscode";
import * as ChildProcess from "child_process"

var currentPort = 9166;

export class DCDCompletionProvider implements vscode.CompletionItemProvider {
	private port: number;
	private projectRoot: string;
	private dcdClientPath: string;

	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
		let self = this;
		return new Promise((resolve, reject) => {
			let offset = document.offsetAt(position);
			let dcdClient = ChildProcess.spawn(self.dcdClientPath, ["-p", "" + self.port, "-c", "" + offset], {
				cwd: self.projectRoot
			});
			dcdClient.stdin.end(document.getText());
			
			var data = "";
			
			dcdClient.stdout.on("data", (out) => {
				data += out.toString("utf8");
			});
			
			dcdClient.stderr.on("data", (data) => {
				if (data.indexOf("Unable to connect socket: Connection refused") != -1 ||
					data.indexOf("Server closed the connection") != -1)
					self.start();
				else
					reject(data);
			});
		});
	}
	
	constructor() {
		this.dcdClientPath = vscode.workspace.getConfiguration("d")["dcdClientPath"];
	}
	
	start() {
		this.port = currentPort;
		currentPort++;
		
		let checkDCD = ChildProcess.spawn(this.dcdClientPath, ["-q", "-p", "" + this.port]);
		
		let self = this;
		
		checkDCD.stdout.on("data", (data) => {});
		checkDCD.on("exit", (code) => {
			if(code == 1)
				self.startServer();
		});
	}
	
	startServer() {
		let self = this;
		
	}
	
	dispose() {
		ChildProcess.spawn(this.dcdClientPath, ["--shutdown", "-p", "" + this.port]);
	}
}