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
					i.detail = item.enumName;
					i.documentation = item.documentation;
					i.insertText = item.value + ": ";
					if (item.type === 1)
						i.insertText = item.value + " {}";
					else if (item.type === 4)
						i.insertText = item.value + ": \"#000000\"";
					else if (item.type === 5)
						i.insertText = item.enumName + "." + item.value;
					else if (item.type === 7)
						i.insertText = item.value + ": Rect { 0, 0, 0, 0 }";
					else if (item.type === 9)
						i.insertText = undefined;
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