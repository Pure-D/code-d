import * as vscode from "vscode"
import { WorkspaceD } from "./workspace-d"

export class DlangUIHandler implements vscode.CompletionItemProvider {
	constructor(public workspaced: WorkspaceD) {
	}

	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
		let self = this.workspaced;
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
					items.push(i);
				});
				console.log("resolve");
				console.log(items);
				resolve(items);
			}, reject);
		});
	}
}

function mapCompletionType(type: number): vscode.CompletionItemKind {
	if (type == 1)
		return vscode.CompletionItemKind.Class;
	else if (type == 2)
		return vscode.CompletionItemKind.Property;
	else
		return vscode.CompletionItemKind.Text;
}