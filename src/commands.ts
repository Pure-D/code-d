import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { DubEditor } from "./dub-editor";
import { LanguageClient, LanguageClientOptions, ServerOptions, DocumentFilter, NotificationType } from "vscode-languageclient";
import { ServeD } from "./extension";
import { showProjectCreator, performTemplateCopy, openFolderWithExtension } from "./project-creator";
import { uploadCode } from "./util";
import { listPackageOptions, getLatestPackageInfo } from "./dub-api"
import { DubDependency } from "./dub-view";

export function registerCommands(context: vscode.ExtensionContext, client: LanguageClient, served: ServeD) {
	var subscriptions = context.subscriptions;
	subscriptions.push(vscode.commands.registerCommand("code-d.switchConfiguration", () => {
		vscode.window.showQuickPick(client.sendRequest<string[]>("served/listConfigurations")).then((config) => {
			if (config)
				client.sendRequest<boolean>("served/switchConfig", config).then(success => {
					if (success)
						served.emit("config-change", config);
				});
		});
	}, (err) => {
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
	}, (err) => {
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
	}, (err) => {
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

	{
		let editor = new DubEditor(context);
		subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("dubsettings", editor));
		subscriptions.push(vscode.commands.registerCommand("dub.openSettingsEditor", editor.open, editor));
		subscriptions.push(vscode.commands.registerCommand("dub.closeSettingsEditor", editor.close, editor));
	}

	let rdmdTerminal: vscode.Terminal;
	subscriptions.push(vscode.commands.registerCommand("code-d.rdmdCurrent", (file: vscode.Uri) => {
		var args = [];
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
					fs.readdir(vscode.workspace.rootPath, function (err, files) {
						if (files.length == 0)
							performTemplateCopy(context, id, templates[i].dub, vscode.workspace.rootPath, function () {
								vscode.commands.executeCommand("workbench.action.reloadWindow");
							});
						else
							vscode.window.showWarningMessage("The current workspace is not empty!", "Select other Folder", "Merge into Folder").then(r => {
								if (r == "Select other Folder") {
									context.globalState.update("create-template", id);
									openFolderWithExtension(context);
								} else if (r == "Merge into Folder") {
									performTemplateCopy(context, id, templates[i].dub, vscode.workspace.rootPath, function () {
										vscode.commands.executeCommand("workbench.action.reloadWindow");
									});
								}
							});
					});
					return;
				}
		});
	}

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
		getLatestPackageInfo(node.info.name).then((info) => {
			client.sendNotification("served/updateDependency", {
				name: node.info.name,
				version: info.version
			});
		});
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.removeDependency", (node: DubDependency) => {
		client.sendNotification("served/uninstallDependency", {
			name: node.info.name
		});
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.uploadSelection", () => {
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
		client.outputChannel.appendLine(err);
		vscode.window.showErrorMessage("Failed to switch configuration. See extension output for details.");
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.insertDscanner", () => {
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
}