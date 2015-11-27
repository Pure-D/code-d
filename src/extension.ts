import * as vscode from 'vscode';
import { D_MODE } from "./dmode"
import { WorkspaceD } from "./workspace-d"

export function activate(context: vscode.ExtensionContext) {
	if (!vscode.workspace.rootPath) {
		console.warn("Could not initialize code-d");
		return;
	}
	let subs = context.subscriptions;
	let workspaced = new WorkspaceD(vscode.workspace.rootPath);
	subs.push(vscode.languages.registerCompletionItemProvider(D_MODE, workspaced));
	console.log("Initialized code-d");
}