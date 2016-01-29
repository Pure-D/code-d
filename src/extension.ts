import * as vscode from 'vscode';
import { D_MODE, DML_MODE } from "./dmode"
import { WorkspaceD } from "./workspace-d"
import { CompileButtons } from "./compile-buttons"
import { uploadCode } from "./util"
import * as statusbar from "./statusbar"
import * as path from "path"
import { DlangUIHandler } from "./dlangui"

let diagnosticCollection: vscode.DiagnosticCollection;

function config() {
	return vscode.workspace.getConfiguration("d");
}

export function activate(context: vscode.ExtensionContext) {
	if (!vscode.workspace.rootPath) {
		console.warn("code-d requires a folder to be open to work");
		return;
	}

	let workspaced = new WorkspaceD(vscode.workspace.rootPath);
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(DML_MODE, workspaced.getDlangUI()));
	
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(D_MODE, workspaced, "."));
	context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(D_MODE, workspaced, "(", ","));
	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerHoverProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerDefinitionProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(D_MODE, workspaced));

	context.subscriptions.push(workspaced);

	context.subscriptions.push(statusbar.setup(workspaced));
	context.subscriptions.push(new CompileButtons(workspaced));

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

	vscode.languages.setLanguageConfiguration(DML_MODE.language, {
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
		},

		indentationRules: {
			decreaseIndentPattern: /\}/,
			increaseIndentPattern: /\{/
		},
		
		wordPattern: /[a-zA-Z_][a-zA-Z0-9_]*/g,

		brackets: [
			['{', '}'],
			['[', ']'],
			['(', ')'],
		]
	});

	context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(workspaced));

	diagnosticCollection = vscode.languages.createDiagnosticCollection("d");
	context.subscriptions.push(diagnosticCollection);

	let version;
	let oldLint = [[], []];
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(document => {
		if (document.languageId != "d")
			return;
		version = document.version;
		let target = version;
		if (config().get("enableLinting", true)) {
			let allErrors: [vscode.Uri, vscode.Diagnostic[]][] = [];

			let fresh = true;
			let buildErrors = () => {
				allErrors = [];
				oldLint.forEach(errors => {
					allErrors.push.apply(allErrors, errors);
				});
				diagnosticCollection.set(allErrors);
			};

			workspaced.lint(document).then((errors: [vscode.Uri, vscode.Diagnostic[]][]) => {
				if (target == version) {
					oldLint[0] = errors;
					buildErrors();
				}
			});
			if (config().get("enableDubLinting", true))
				workspaced.dubBuild(document).then((errors: [vscode.Uri, vscode.Diagnostic[]][]) => {
					if (target == version) {
						oldLint[1] = errors;
						buildErrors();
					}
				});
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand("code-d.uploadSelection", () => {
		if (vscode.window.activeTextEditor.selection.isEmpty)
			vscode.window.showErrorMessage("No code selected");
		else {
			let code = vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selection);
			let name = path.basename(vscode.window.activeTextEditor.document.fileName);
			let syntax = vscode.window.activeTextEditor.document.languageId;
			uploadCode(name, syntax, code).then((url) => {
				vscode.window.showInformationMessage("Code pasted on " + url);
			});
		}
	}, (err) => {
		console.error(err);
		vscode.window.showErrorMessage("Failed to switch configuration. See console for details.");
	}));

	context.subscriptions.push(vscode.commands.registerCommand("code-d.switchConfiguration", () => {
		vscode.window.showQuickPick(workspaced.listConfigurations()).then((config) => {
			if (config)
				workspaced.setConfiguration(config);
		});
	}, (err) => {
		console.error(err);
		vscode.window.showErrorMessage("Failed to switch configuration. See console for details.");
	}));

	context.subscriptions.push(vscode.commands.registerCommand("code-d.switchBuildType", () => {
		vscode.window.showQuickPick(workspaced.listBuildTypes()).then((config) => {
			if (config)
				workspaced.setBuildType(config);
		});
	}, (err) => {
		console.error(err);
		vscode.window.showErrorMessage("Failed to switch build type. See console for details.");
	}));

	context.subscriptions.push(vscode.commands.registerCommand("code-d.killServer", () => {
		workspaced.killServer().then((res) => {
			vscode.window.showInformationMessage("Killed DCD-Server", "Restart").then((pick) => {
				if (pick == "Restart")
					vscode.commands.executeCommand("code-d.restartServer");
			});
		}, (err) => {
			console.error(err);
			vscode.window.showErrorMessage("Failed to kill DCD-Server. See console for details.");
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand("code-d.restartServer", () => {
		workspaced.restartServer().then((res) => {
			vscode.window.showInformationMessage("Restarted DCD-Server");
		}, (err) => {
			console.error(err);
			vscode.window.showErrorMessage("Failed to kill DCD-Server. See console for details.");
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand("code-d.reloadImports", () => {
		workspaced.updateImports().then((success) => {
			if (success)
				vscode.window.showInformationMessage("Successfully reloaded import paths");
			else
				vscode.window.showWarningMessage("Import paths are empty!");
		}, (err) => {
			vscode.window.showErrorMessage("Could not update imports. dub might not be initialized yet!");
		});
	}));
	
	context.subscriptions.push(vscode.commands.registerCommand("code-d.insertDscanner", () => {
		vscode.window.activeTextEditor.edit((bld) => {
			bld.insert(vscode.window.activeTextEditor.selection.start, `; Configurue which static analysis checks are enabled
[analysis.config.StaticAnalysisConfig]
; Check variable, class, struct, interface, union, and function names against the Phobos style guide
style_check="true"
; Check for array literals that cause unnecessary allocation
enum_array_literal_check="true"
; Check for poor exception handling practices
exception_check="true"
; Check for use of the deprecated 'delete' keyword
delete_check="true"
; Check for use of the deprecated floating point operators
float_operator_check="true"
; Check number literals for readability
number_style_check="true"
; Checks that opEquals, opCmp, toHash, and toString are either const, immutable, or inout.
object_const_check="true"
; Checks for .. expressions where the left side is larger than the right.
backwards_range_check="true"
; Checks for if statements whose 'then' block is the same as the 'else' block
if_else_same_check="true"
; Checks for some problems with constructors
constructor_check="true"
; Checks for unused variables and function parameters
unused_variable_check="true"
; Checks for unused labels
unused_label_check="true"
; Checks for duplicate attributes
duplicate_attribute="true"
; Checks that opEquals and toHash are both defined or neither are defined
opequals_tohash_check="true"
; Checks for subtraction from .length properties
length_subtraction_check="true"
; Checks for methods or properties whose names conflict with built-in properties
builtin_property_names_check="true"
; Checks for confusing code in inline asm statements
asm_style_check="true"
; Checks for confusing logical operator precedence
logical_precedence_check="true"
; Checks for undocumented public declarations
undocumented_declaration_check="true"
; Checks for poor placement of function attributes
function_attribute_check="true"
; Checks for use of the comma operator
comma_expression_check="true"
; Checks for local imports that are too broad
local_import_check="true"
; Checks for variables that could be declared immutable
could_be_immutable_check="true"
; Checks for redundant expressions in if statements
redundant_if_check="true"
; Checks for redundant parenthesis
redundant_parens_check="true"
; Checks for mismatched argument and parameter names
mismatched_args_check="true"
; Checks for labels with the same name as variables
label_var_same_name_check="true"
; Checks for lines longer than 120 characters
long_line_check="true"
; Checks for assignment to auto-ref function parameters
auto_ref_assignment_check="true"
; Checks for incorrect infinite range definitions
incorrect_infinite_range_check="true"
; Checks for asserts that are always true
useless_assert_check="true"`);
		});
	}));

	console.log("Initialized code-d");
}
