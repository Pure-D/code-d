import * as vscode from 'vscode';
import { D_MODE } from "./dmode"
import { WorkspaceD } from "./workspace-d"

let diagnosticCollection: vscode.DiagnosticCollection;

function config() {
	return vscode.workspace.getConfiguration("d");
}

export function activate(context: vscode.ExtensionContext) {
	if (!vscode.workspace.rootPath) {
		console.warn("Could not initialize code-d");
		return;
	}
	let workspaced = new WorkspaceD(vscode.workspace.rootPath);
	context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(D_MODE, workspaced, "(", ","));
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerHoverProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerDefinitionProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(D_MODE, workspaced));
	context.subscriptions.push(workspaced);

	vscode.languages.setLanguageConfiguration(D_MODE.language, {
		__electricCharacterSupport: {
			brackets: [
				{ tokenType: 'delimiter.curly.ts', open: '{', close: '}', isElectric: true },
				{ tokenType: 'delimiter.square.ts', open: '[', close: ']', isElectric: true },
				{ tokenType: 'delimiter.paren.ts', open: '(', close: ')', isElectric: true }
			]
		},

		__characterPairSupport: {
			autoClosingPairs: [
				{ open: '{', close: '}' },
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '`', close: '`', notIn: ['string'] },
				{ open: '"', close: '"', notIn: ['string'] },
				{ open: '\'', close: '\'', notIn: ['string', 'comment'] }
			]
		}
	});


	context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(workspaced));

	diagnosticCollection = vscode.languages.createDiagnosticCollection("d");
	context.subscriptions.push(diagnosticCollection);

	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
		if (document.languageId != "d")
			return;
		if (config().get("enableLinting", true))
			workspaced.lint(document).then(errors => {
				diagnosticCollection.delete(document.uri);
				diagnosticCollection.set(document.uri, errors);
			});
	}));

	vscode.commands.registerCommand("code-d.switchConfiguration", () => {
		vscode.window.showQuickPick(workspaced.listConfigurations()).then((config) => {
			if (config)
				workspaced.setConfiguration(config);
		});
	}, (err) => {
		console.error(err);
		vscode.window.showErrorMessage("Failed to switch configuration. See console for details.");
	});

	vscode.commands.registerCommand("code-d.killServer", () => {
		workspaced.killServer().then((res) => {
			vscode.window.showInformationMessage("Killed DCD-Server", "Restart").then((pick) => {
				if (pick == "Restart")
					vscode.commands.executeCommand("code-d.restartServer");
			});
		}, (err) => {
			console.error(err);
			vscode.window.showErrorMessage("Failed to kill DCD-Server. See console for details.");
		});
	});

	vscode.commands.registerCommand("code-d.restartServer", () => {
		workspaced.restartServer().then((res) => {
			vscode.window.showInformationMessage("Restarted DCD-Server");
		}, (err) => {
			console.error(err);
			vscode.window.showErrorMessage("Failed to kill DCD-Server. See console for details.");
		});
	});

	console.log("Initialized code-d");
}
