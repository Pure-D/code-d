import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { JSDOM } from "jsdom";
import { DubEditor } from "./dub-editor";
import { LanguageClient, LanguageClientOptions, ServerOptions, DocumentFilter, NotificationType, TextEdit } from "vscode-languageclient";
import { ServeD } from "./extension";
import { showProjectCreator, performTemplateCopy, openFolderWithExtension } from "./project-creator";
import { uploadCode, req } from "./util";
import { listPackageOptions, getLatestPackageInfo } from "./dub-api"
import { DubDependency } from "./dub-view";
import { DubTasksProvider } from "./dub-tasks";
import { showDpldocsSearch } from "./dpldocs";

var gClient: LanguageClient;

export function registerClientCommands(context: vscode.ExtensionContext, client: LanguageClient, served: ServeD) {
	var subscriptions = context.subscriptions;

	subscriptions.push(vscode.tasks.registerTaskProvider("dub", new DubTasksProvider(client)));

	gClient = client;

	subscriptions.push(vscode.commands.registerCommand("code-d.switchConfiguration", () => {
		vscode.window.showQuickPick(client.sendRequest<string[]>("served/listConfigurations")).then((config) => {
			if (config)
				client.sendRequest<boolean>("served/switchConfig", config).then(success => {
					if (success)
						served.emit("config-change", config);
				});
		});
	}, (err: any) => {
		client.outputChannel.appendLine(err.toString());
		vscode.window.showErrorMessage("Failed to switch configuration. See extension output for details.");
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.switchArchType", () => {
		vscode.window.showQuickPick(client.sendRequest<string[]>("served/listArchTypes")).then((arch) => {
			if (arch)
				client.sendRequest<boolean>("served/switchArchType", arch).then(success => {
					if (success)
						served.emit("arch-type-change", arch);
				});
		});
	}, (err: any) => {
		client.outputChannel.appendLine(err.toString());
		vscode.window.showErrorMessage("Failed to switch arch type. See extension output for details.");
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.switchBuildType", () => {
		vscode.window.showQuickPick(client.sendRequest<string[]>("served/listBuildTypes")).then((type) => {
			if (type)
				client.sendRequest<boolean>("served/switchBuildType", type).then(success => {
					if (success)
						served.emit("build-type-change", type);
				});
		});
	}, (err: any) => {
		client.outputChannel.appendLine(err.toString());
		vscode.window.showErrorMessage("Failed to switch build type. See extension output for details.");
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.switchCompiler", () => {
		client.sendRequest<string>("served/getCompiler").then(compiler => {
			vscode.window.showInputBox({ value: compiler, prompt: "Enter compiler identifier. (e.g. dmd, ldc2, gdc)" }).then(compiler => {
				if (compiler)
					client.sendRequest<boolean>("served/switchCompiler", compiler).then(success => {
						if (success)
							served.emit("compiler-change", compiler);
					});
			});
		}, (err) => {
			client.outputChannel.appendLine(err.toString());
			vscode.window.showErrorMessage("Failed to switch compiler. See extension output for details.");
		});
	}));

	subscriptions.push(vscode.commands.registerTextEditorCommand("code-d.sortImports", (editor, edit, location) => {
		if (typeof location !== "number")
			location = editor.document.offsetAt(editor.selection.start);
		client.sendRequest<any>("served/sortImports", {
			textDocument: {
				uri: editor.document.uri.toString()
			},
			location: location
		}).then((change: TextEdit[]) => {
			if (!change.length)
				return;
			editor.edit((edit) => {
				var s = change[0].range.start;
				var e = change[0].range.end;
				var start = new vscode.Position(s.line, s.character);
				var end = new vscode.Position(e.line, e.character);
				edit.replace(new vscode.Range(start, end), change[0].newText);
			});
		}, (err) => {
			vscode.window.showErrorMessage("Could not sort imports");
			client.outputChannel.appendLine(err.toString());
		});
	}));

	subscriptions.push(vscode.commands.registerTextEditorCommand("code-d.implementMethods", (editor, edit, location) => {
		if (typeof location !== "number")
			location = editor.document.offsetAt(editor.selection.start);
		client.sendRequest<any>("served/implementMethods", {
			textDocument: {
				uri: editor.document.uri.toString()
			},
			location: location
		}).then((change: TextEdit[]) => {
			if (!change.length)
				return;
			editor.edit((edit) => {
				var s = change[0].range.start;
				var start = new vscode.Position(s.line, s.character);
				edit.insert(start, change[0].newText);
			});
		}, (err) => {
			vscode.window.showErrorMessage("Could not implement methods");
			client.outputChannel.appendLine(err.toString());
		});
	}));

	subscriptions.push(vscode.commands.registerTextEditorCommand("code-d.ignoreDscannerKey", (editor, edit, key: string, mode?: boolean | "line") => {
		var ignored = vscode.workspace.getConfiguration("dscanner", editor.document.uri).get("ignoredKeys");
		if (!ignored)
			ignored = vscode.workspace.getConfiguration("dscanner", null).get("ignoredKeys");
		var doChange = function (key: string, global?: boolean) {
			if (Array.isArray(ignored))
				ignored.push(key);
			else
				ignored = [key];
			vscode.workspace.getConfiguration("dscanner", editor.document.uri).update("ignoredKeys", ignored, global ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.WorkspaceFolder).then(() => {
				served.triggerDscanner(editor.document.uri);
			});
		};
		if (typeof key !== "string" || !key.length) {
			var available: string[] = [
				"dscanner.bugs.backwards_slices",
				"dscanner.bugs.if_else_same",
				"dscanner.bugs.logic_operator_operands",
				"dscanner.bugs.self_assignment",
				"dscanner.confusing.argument_parameter_mismatch",
				"dscanner.confusing.brexp",
				"dscanner.confusing.builtin_property_names",
				"dscanner.confusing.constructor_args",
				"dscanner.confusing.function_attributes",
				"dscanner.confusing.lambda_returns_lambda",
				"dscanner.confusing.logical_precedence",
				"dscanner.confusing.struct_constructor_default_args",
				"dscanner.deprecated.delete_keyword",
				"dscanner.deprecated.floating_point_operators",
				"dscanner.if_statement",
				"dscanner.performance.enum_array_literal",
				"dscanner.style.allman",
				"dscanner.style.alias_syntax",
				"dscanner.style.doc_missing_params",
				"dscanner.style.doc_missing_returns",
				"dscanner.style.doc_non_existing_params",
				"dscanner.style.explicitly_annotated_unittest",
				"dscanner.style.has_public_example",
				"dscanner.style.imports_sortedness",
				"dscanner.style.long_line",
				"dscanner.style.number_literals",
				"dscanner.style.phobos_naming_convention",
				"dscanner.style.undocumented_declaration",
				"dscanner.suspicious.auto_ref_assignment",
				"dscanner.suspicious.catch_em_all",
				"dscanner.suspicious.comma_expression",
				"dscanner.suspicious.incomplete_operator_overloading",
				"dscanner.suspicious.incorrect_infinite_range",
				"dscanner.suspicious.label_var_same_name",
				"dscanner.suspicious.length_subtraction",
				"dscanner.suspicious.local_imports",
				"dscanner.suspicious.missing_return",
				"dscanner.suspicious.object_const",
				"dscanner.suspicious.redundant_attributes",
				"dscanner.suspicious.redundant_parens",
				"dscanner.suspicious.static_if_else",
				"dscanner.suspicious.unmodified",
				"dscanner.suspicious.unused_label",
				"dscanner.suspicious.unused_parameter",
				"dscanner.suspicious.unused_variable",
				"dscanner.suspicious.useless_assert",
				"dscanner.unnecessary.duplicate_attribute",
				"dscanner.useless.final",
				"dscanner.useless-initializer",
				"dscanner.vcall_ctor",
				"dscanner.syntax"
			];
			if (Array.isArray(ignored)) {
				ignored.forEach(element => {
					var i = available.indexOf(element);
					if (i != -1)
						available.splice(i, 1);
				});
			}
			vscode.window.showQuickPick(available, {
				placeHolder: "Select which key to ignore"
			}).then(key => {
				if (key) {
					if (typeof mode == "string") {
						editor.edit(edit => {
							edit.insert(editor.document.lineAt(editor.selection.end).range.end, " // @suppress(" + key + ")");
							served.triggerDscanner(editor.document.uri);
						});
					}
					else
						doChange(key, mode);
				}
			});
		}
		else {
			if (typeof mode == "string") {
				edit.insert(editor.document.lineAt(editor.selection.end).range.end, " // @suppress(" + key + ")");
				served.triggerDscanner(editor.document.uri);
			}
			else
				doChange(key, mode);
		}
	}));

	subscriptions.push(vscode.commands.registerTextEditorCommand("code-d.addImport", (editor, edit, name, location) => {
		client.sendRequest<any>("served/addImport", {
			textDocument: {
				uri: editor.document.uri.toString()
			},
			name: name,
			location: location
		}).then((change) => {
			client.outputChannel.appendLine("Importer resolve: " + JSON.stringify(change));
			if (change.rename) // no renames from addImport command
				return;
			editor.edit((edit) => {
				for (var i = change.replacements.length - 1; i >= 0; i--) {
					var r = change.replacements[i];
					if (r.range[0] == r.range[1])
						edit.insert(editor.document.positionAt(r.range[0]), r.content);
					else if (r.content == "")
						edit.delete(new vscode.Range(editor.document.positionAt(r.range[0]), editor.document.positionAt(r.range[1])));
					else
						edit.replace(new vscode.Range(editor.document.positionAt(r.range[0]), editor.document.positionAt(r.range[1])), r.content);
				}
				client.outputChannel.appendLine("Done");
			});
		}, (err) => {
			vscode.window.showErrorMessage("Could not add import");
			client.outputChannel.appendLine(err.toString());
		});
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.killServer", () => {
		client.sendNotification("served/killServer");
		vscode.window.showInformationMessage("Killed DCD-Server", "Restart").then((pick) => {
			if (pick == "Restart")
				vscode.commands.executeCommand("code-d.restartServer");
		});
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.restartServer", () => {
		client.sendRequest<boolean>("served/restartServer").then((success) => {
			if (success)
				vscode.window.showInformationMessage("Restarted DCD-Server");
			else
				vscode.window.showErrorMessage("Failed to restart DCD-Server");
		});
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.reloadImports", () => {
		client.sendRequest<boolean>("served/updateImports").then((success) => {
			if (success)
				vscode.window.showInformationMessage("Successfully reloaded import paths");
			else
				vscode.window.showWarningMessage("Import paths are empty!");
		}, (err) => {
			client.outputChannel.appendLine(err.toString());
			vscode.window.showErrorMessage("Could not update imports. dub might not be initialized yet!");
		});
	}));

	subscriptions.push(vscode.commands.registerTextEditorCommand("code-d.convertDubRecipe", (editor, edit) => {
		if (editor.document.isDirty || editor.document.isUntitled) {
			vscode.window.showErrorMessage("Please save the file first");
			return;
		}
		var uri = editor.document.uri.toString();
		client.sendNotification("served/convertDubFormat", {
			textDocument: { uri: uri },
			newFormat: uri.toLowerCase().endsWith(".sdl") ? "json" : "sdl"
		});
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.addDependency", () => {
		vscode.window.showQuickPick(listPackageOptions(), {
			matchOnDescription: false,
			matchOnDetail: true,
			placeHolder: "Dependency Name"
		}).then(pkg => {
			if (pkg) {
				client.sendNotification("served/installDependency", {
					name: pkg.label,
					version: pkg.description
				});
			}
		});
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.updateDependency", (node: DubDependency) => {
		if (node.info)
			getLatestPackageInfo(node.info.name).then((info) => {
				if (node.info)
					client.sendNotification("served/updateDependency", {
						name: node.info.name,
						version: info.version
					});
			});
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.removeDependency", (node: DubDependency) => {
		if (node.info)
			client.sendNotification("served/uninstallDependency", {
				name: node.info.name
			});
	}));
}

export function registerCommands(context: vscode.ExtensionContext) {
	var subscriptions = context.subscriptions;

	{
		let editor = new DubEditor(context);
		subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("dubsettings", editor));
		subscriptions.push(vscode.commands.registerCommand("dub.openSettingsEditor", editor.open, editor));
		subscriptions.push(vscode.commands.registerCommand("dub.closeSettingsEditor", editor.close, editor));
	}

	let rdmdTerminal: vscode.Terminal;
	subscriptions.push(vscode.commands.registerCommand("code-d.rdmdCurrent", (file: vscode.Uri) => {
		var args = [];
		if (!vscode.window.activeTextEditor)
			return vscode.window.showErrorMessage("No text editor active");
		if (file)
			args = [file.fsPath];
		else if (!vscode.window.activeTextEditor.document.fileName)
			args = ["--eval=\"" + vscode.window.activeTextEditor.document.getText().replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\""];
		else
			args = [vscode.window.activeTextEditor.document.fileName];

		if (!rdmdTerminal)
			rdmdTerminal = vscode.window.createTerminal("rdmd Output");
		rdmdTerminal.show();
		rdmdTerminal.sendText("rdmd " + args.join(" "));
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.createProject", () => {
		showProjectCreator(context);
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.viewDubPackage", (root: string) => {
		if (root) {
			fs.readdir(root, (err, files) => {
				if (err)
					return;
				var mostLikely = "";
				files.forEach(file => {
					if (file.toLowerCase().startsWith("readme")) {
						mostLikely = file;
					}
				});
				if (!mostLikely)
					return;
				var readme = path.join(root, mostLikely);
				var uri = vscode.Uri.file(readme);
				var extension = path.extname(readme).toLowerCase();
				if (extension == ".md" || extension == ".markdown")
					vscode.commands.executeCommand("markdown.showPreview", uri);
				else if (extension == ".html" || extension == ".htm")
					vscode.commands.executeCommand("vscode.previewHtml", uri);
				else
					vscode.commands.executeCommand("vscode.open", uri);
			});
		}
	}));

	if (context.globalState.get("create-template", "")) {
		var id = context.globalState.get("create-template", "");
		context.globalState.update("create-template", undefined);
		fs.readFile(path.join(context.extensionPath, "templates", "info.json"), function (err, data) {
			if (err)
				return vscode.window.showErrorMessage("Failed to parse templates");
			var templates = JSON.parse(data.toString());
			for (var i = 0; i < templates.length; i++)
				if (templates[i].path == id) {
					var path = "";
					if (!vscode.workspace.workspaceFolders)
						return vscode.window.showErrorMessage("No workspace folder open");
					path = vscode.workspace.workspaceFolders[0].uri.path;
					fs.readdir(path, function (err: any, files: any) {
						if (files.length == 0)
							performTemplateCopy(context, id, templates[i].dub, path, function () {
								vscode.commands.executeCommand("workbench.action.reloadWindow");
							});
						else
							vscode.window.showWarningMessage("The current workspace is not empty!", "Select other Folder", "Merge into Folder").then(r => {
								if (r == "Select other Folder") {
									context.globalState.update("create-template", id);
									openFolderWithExtension(context);
								} else if (r == "Merge into Folder") {
									performTemplateCopy(context, id, templates[i].dub, path, function () {
										vscode.commands.executeCommand("workbench.action.reloadWindow");
									});
								}
							});
					});
					return undefined;
				}
			return undefined;
		});
	}

	subscriptions.push(vscode.commands.registerCommand("code-d.uploadSelection", () => {
		if (!vscode.window.activeTextEditor || vscode.window.activeTextEditor.selection.isEmpty)
			vscode.window.showErrorMessage("No code selected");
		else {
			let code = vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selection);
			let name = path.basename(vscode.window.activeTextEditor.document.fileName);
			let syntax = vscode.window.activeTextEditor.document.languageId;
			uploadCode(name, syntax, code).then((url) => {
				vscode.window.showInformationMessage("Code pasted on " + url);
			});
		}
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.searchDocs", () => {
		var query = "";
		if (vscode.window.activeTextEditor)
			query = vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selection);
		showDpldocsSearch(query);
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.insertDscanner", () => {
		if (!vscode.window.activeTextEditor)
			return vscode.window.showErrorMessage("No text editor active");
		vscode.window.activeTextEditor.edit((bld) => {
			if (!vscode.window.activeTextEditor)
				return;
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
}