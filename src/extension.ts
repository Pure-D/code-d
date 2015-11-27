import * as vscode from 'vscode';
import { D_MODE } from "./dmode"
import { WorkspaceD } from "./workspace-d"

export function activate(context: vscode.ExtensionContext) {
	if (!vscode.workspace.rootPath) {
		console.warn("Could not initialize code-d");
		return;
	}
	let workspaced = new WorkspaceD(vscode.workspace.rootPath);
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(D_MODE, workspaced));
	context.subscriptions.push(workspaced);
	console.log("Initialized code-d");
}