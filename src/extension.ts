import * as vscode from 'vscode';
import { D_MODE, DML_MODE, DSCRIPT_MODE, SDL_MODE } from "./dmode"
import { WorkspaceD } from "./workspace-d"
import { CompileButtons } from "./compile-buttons"
import { uploadCode } from "./util"
import * as statusbar from "./statusbar"
import * as path from "path"
import * as fs from "fs"
import { DlangUIHandler } from "./dlangui"
import { lintDfmt } from "./dfmt-check"
import { GCProfiler } from "./gcprofiler"
import { addJSONProviders } from "./json-contributions"
import { addSDLProviders } from "./sdl/sdl-contributions"
import * as ChildProcess from "child_process"

let diagnosticCollection: vscode.DiagnosticCollection;
let oldLint: [vscode.Uri, vscode.Diagnostic[]][][] = [[], [], []];

function config() {
	return vscode.workspace.getConfiguration("d");
}

export function activate(context: vscode.ExtensionContext) {
	if (!vscode.workspace.rootPath) {
		console.warn("code-d requires a folder to be open to work");
		return;
	}

	let workspaced = new WorkspaceD(vscode.workspace.rootPath);
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(DML_MODE, workspaced.getDlangUI(context.subscriptions), ":", ";"));

	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(D_MODE, workspaced, "."));
	context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(D_MODE, workspaced, "(", ","));
	context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerHoverProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerDefinitionProvider(D_MODE, workspaced));
	context.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider(D_MODE, workspaced));

	context.subscriptions.push(workspaced);
	function checkUnresponsive() {
		setTimeout(() => {
			workspaced.checkResponsiveness().then(responsive => {
				if (responsive)
					checkUnresponsive();
			});
		}, 10 * 1000);
	}
	workspaced.on("workspace-d-start", checkUnresponsive);
	checkUnresponsive();

	context.subscriptions.push(addSDLProviders());
	context.subscriptions.push(addJSONProviders());

	context.subscriptions.push(statusbar.setup(workspaced));
	context.subscriptions.push(new CompileButtons(workspaced));

	vscode.languages.setLanguageConfiguration(D_MODE.language, {
		comments: {
			blockComment: ["/*", "*/"],
			lineComment: "//"
		},

		brackets: [
			["(", ")"],
			["{", "}"],
			["[", "]"]
		],

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

	vscode.languages.setLanguageConfiguration(DSCRIPT_MODE.language, {
		brackets: [
			["(", ")"],
			["{", "}"],
			["[", "]"]
		],

		comments: {
			blockComment: ["/*", "*/"],
			lineComment: "//"
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
		comments: {
			blockComment: ["/*", "*/"],
			lineComment: "//"
		},

		brackets: [
			["(", ")"],
			["{", "}"],
			["[", "]"]
		],

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

		wordPattern: /[a-zA-Z_][a-zA-Z0-9_]*/g
	});

	vscode.languages.setLanguageConfiguration(SDL_MODE.language, {
		comments: {
			blockComment: ["/*", "*/"],
			lineComment: "//"
		},

		brackets: [
			["(", ")"],
			["{", "}"],
			["[", "]"]
		],

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

		wordPattern: /[a-zA-Z0-9_\-\.\$]+/g
	});

	context.subscriptions.push(vscode.languages.registerWorkspaceSymbolProvider(workspaced));

	function upgradeDubPackage(document: vscode.TextDocument) {
		if (path.basename(document.fileName) == "dub.json" || path.basename(document.fileName) == "dub.sdl") {
			workspaced.upgrade();
			workspaced.updateImports();
		}
	}

	vscode.workspace.onDidSaveTextDocument(upgradeDubPackage, null, context.subscriptions);

	let gcprofiler = new GCProfiler();
	vscode.languages.registerCodeLensProvider(D_MODE, gcprofiler);

	let watcher = vscode.workspace.createFileSystemWatcher("**/profilegc.log", false, false, false);
	watcher.onDidCreate(gcprofiler.updateProfileCache.bind(gcprofiler), null, context.subscriptions);
	watcher.onDidChange(gcprofiler.updateProfileCache.bind(gcprofiler), null, context.subscriptions);
	watcher.onDidDelete(gcprofiler.clearProfileCache.bind(gcprofiler), null, context.subscriptions);
	context.subscriptions.push(watcher);

	let profileGCPath = path.join(vscode.workspace.rootPath, "profilegc.log");
	if (fs.existsSync(profileGCPath))
		gcprofiler.updateProfileCache(vscode.Uri.file(profileGCPath));

	context.subscriptions.push(vscode.commands.registerCommand("code-d.showGCCalls", gcprofiler.listProfileCache.bind(gcprofiler)));

	diagnosticCollection = vscode.languages.createDiagnosticCollection("d");
	context.subscriptions.push(diagnosticCollection);
	let version;
	let writeTimeout;
	let buildErrors = () => {
		diagnosticCollection.clear();
		let allErrors: [vscode.Uri, vscode.Diagnostic[]][] = [];
		oldLint.forEach(errors => {
			errors.forEach(error => {
				for (var i = 0; i < allErrors.length; i++) {
					if (allErrors[i][0] == error[0]) {
						var arr = allErrors[i][1];
						if (!arr)
							arr = [];
						arr.push.apply(arr, error[1]);
						allErrors[i][1] = arr;
						return;
					}
				}
				var dup: [vscode.Uri, vscode.Diagnostic[]] = [error[0], []];
				error[1].forEach(errElem => {
					dup[1].push(errElem);
				});
				allErrors.push(dup);
			});
		});
		diagnosticCollection.set(allErrors);
	};
	vscode.workspace.onDidChangeTextDocument(event => {
		let document = event.document;
		if (document.languageId != "d")
			return;
		clearTimeout(writeTimeout);
		writeTimeout = setTimeout(function () {
			if (config().get("enableLinting", true)) {
				let issues = lintDfmt(document);
				if (issues)
					oldLint[2] = [[document.uri, issues]];
				else
					oldLint[2] = [];
				buildErrors();
			}
		}, 200);
	}, null, context.subscriptions);

	vscode.workspace.onDidSaveTextDocument(document => {
		if (document.languageId != "d")
			return;
		version = document.version;
		let target = version;
		if (config().get("enableLinting", true))
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
	}, null, context.subscriptions);

	let rdmdOutput = vscode.window.createOutputChannel("rdmd");
	context.subscriptions.push(vscode.commands.registerCommand("code-d.rdmdCurrent", (file: vscode.Uri) => {
		let proc;
		var args = [];
		if (file)
			proc = ChildProcess.spawn("rdmd", args = [file.fsPath], { cwd: vscode.workspace.rootPath });
		else if (!vscode.window.activeTextEditor.document.fileName)
			proc = ChildProcess.spawn("rdmd", args = ["--eval=" + vscode.window.activeTextEditor.document.getText()], { cwd: vscode.workspace.rootPath });
		else
			proc = ChildProcess.spawn("rdmd", args = [vscode.window.activeTextEditor.document.fileName], { cwd: vscode.workspace.rootPath });

		rdmdOutput.show();
		rdmdOutput.clear();
		rdmdOutput.appendLine("rdmd " + args.join(" "));

		let handleData = (data) => {
			let lines = data.toString("utf8").split('\n');
			for (var i = 0; i < lines.length - 1; i++) {
				rdmdOutput.appendLine(lines[i]);
			}
			rdmdOutput.append(lines[lines.length - 1]);
		};

		proc.stderr.on("data", handleData.bind(this));
		proc.stdout.on("data", handleData.bind(this));
		proc.once("close", (code) => {
			code = (code || 0);
			if (code !== 0)
				rdmdOutput.appendLine("rdmd stopped with error code " + code);
			else
				rdmdOutput.appendLine("rdmd stopped with no errors");
		});
		proc.once("error", (err) => {
			rdmdOutput.appendLine("rdmd crashed:");
			rdmdOutput.appendLine(err.toString());
		});
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

	context.subscriptions.push(vscode.commands.registerCommand("code-d.switchArchType", () => {
		vscode.window.showQuickPick(workspaced.listArchTypes()).then((arch) => {
			if (arch)
				workspaced.setArchType(arch);
		});
	}, (err) => {
		console.error(err);
		vscode.window.showErrorMessage("Failed to switch arch type. See console for details.");
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

	context.subscriptions.push(vscode.commands.registerCommand("code-d.switchCompiler", () => {
		workspaced.getCompiler().then(compiler => {
			vscode.window.showInputBox({ value: compiler, prompt: "Enter compiler identifier. (e.g. dmd, ldc2, gdc)" }).then(compiler => {
				if (compiler)
					workspaced.setCompiler(compiler);
			});
		}, (err) => {
			console.error(err);
			vscode.window.showErrorMessage("Failed to switch compiler. See console for details.");
		});
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
			bld.insert(vscode.window.activeTextEditor.selection.start, `; Configure which static analysis checks are enabled
[analysis.config.StaticAnalysisConfig]
; Check variable, class, struct, interface, union, and function names against the Phobos style guide
style_check="enabled"
; Check for array literals that cause unnecessary allocation
enum_array_literal_check="enabled"
; Check for poor exception handling practices
exception_check="enabled"
; Check for use of the deprecated 'delete' keyword
delete_check="enabled"
; Check for use of the deprecated floating point operators
float_operator_check="enabled"
; Check number literals for readability
number_style_check="enabled"
; Checks that opEquals, opCmp, toHash, and toString are either const, immutable, or inout.
object_const_check="enabled"
; Checks for .. expressions where the left side is larger than the right.
backwards_range_check="enabled"
; Checks for if statements whose 'then' block is the same as the 'else' block
if_else_same_check="enabled"
; Checks for some problems with constructors
constructor_check="enabled"
; Checks for unused variables and function parameters
unused_variable_check="enabled"
; Checks for unused labels
unused_label_check="enabled"
; Checks for duplicate attributes
duplicate_attribute="enabled"
; Checks that opEquals and toHash are both defined or neither are defined
opequals_tohash_check="enabled"
; Checks for subtraction from .length properties
length_subtraction_check="enabled"
; Checks for methods or properties whose names conflict with built-in properties
builtin_property_names_check="enabled"
; Checks for confusing code in inline asm statements
asm_style_check="enabled"
; Checks for confusing logical operator precedence
logical_precedence_check="enabled"
; Checks for undocumented public declarations
undocumented_declaration_check="enabled"
; Checks for poor placement of function attributes
function_attribute_check="enabled"
; Checks for use of the comma operator
comma_expression_check="enabled"
; Checks for local imports that are too broad
local_import_check="enabled"
; Checks for variables that could be declared immutable
could_be_immutable_check="enabled"
; Checks for redundant expressions in if statements
redundant_if_check="enabled"
; Checks for redundant parenthesis
redundant_parens_check="enabled"
; Checks for mismatched argument and parameter names
mismatched_args_check="enabled"
; Checks for labels with the same name as variables
label_var_same_name_check="enabled"
; Checks for lines longer than 120 characters
long_line_check="enabled"
; Checks for assignment to auto-ref function parameters
auto_ref_assignment_check="enabled"
; Checks for incorrect infinite range definitions
incorrect_infinite_range_check="enabled"
; Checks for asserts that are always true
useless_assert_check="enabled"
; Check for uses of the old-style alias syntax
alias_syntax_check="enabled"
; Checks for else if that should be else static if
static_if_else_check="enabled"
; Check for unclear lambda syntax
lambda_return_check="enabled"`);
		});
	}));

	console.log("Initialized code-d");
}
