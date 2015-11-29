import * as vscode from 'vscode';
import { D_MODE } from "./dmode"
import { WorkspaceD } from "./workspace-d"

let diagnosticCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext) {
	if (!vscode.workspace.rootPath) {
		console.warn("Could not initialize code-d");
		return;
	}
	let workspaced = new WorkspaceD(vscode.workspace.rootPath);
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerHoverProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerDefinitionProvider(D_MODE, workspaced));
	context.subscriptions.push(workspaced);
	
	context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(workspaced));

	diagnosticCollection = vscode.languages.createDiagnosticCollection("d");
	context.subscriptions.push(diagnosticCollection);

	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
		if (document.languageId != "d")
			return;
		workspaced.lint(document).then(errors => {
			diagnosticCollection.delete(document.uri);
			diagnosticCollection.set(document.uri, errors);
		});
	}));

	console.log("Initialized code-d");
}
