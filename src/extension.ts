import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LanguageClient, LanguageClientOptions, ServerOptions, DocumentFilter } from "vscode-languageclient";
import { setContext, compileDScanner, compileDfmt, compileDCD, downloadDub, compileServeD } from "./installer"
import { EventEmitter } from "events"
import * as ChildProcess from "child_process"

import * as mode from "./dmode";
import * as statusbar from "./statusbar";
import { CompileButtons } from "./compile-buttons";
import { addSDLProviders } from "./sdl/sdl-contributions";
import { addJSONProviders } from "./json-contributions";
import { GCProfiler } from "./gcprofiler";
import { CoverageAnalyzer } from "./coverage";
import { DubEditor } from "./dub-editor";
import { showProjectCreator, performTemplateCopy, openFolderWithExtension } from "./project-creator";
import { uploadCode } from "./util";

export class ServeD extends EventEmitter {
	constructor(public client: LanguageClient) {
		super();
	}
}

export function activate(context: vscode.ExtensionContext) {
	// TODO: Port to serve-d
	/*{
		var phobosPath = config().getStdlibPath();
		var foundCore = false;
		var foundStd = false;
		var someError = false;
		var userSettings = (r) => {
			if (r == "Open User Settings")
				vscode.commands.executeCommand("workbench.action.openGlobalSettings");
		};
		var i = 0;
		var fn = function () {
			if (typeof phobosPath[i] == "string")
				fs.exists(phobosPath[i], function (exists) {
					if (exists) {
						fs.readdir(phobosPath[i], function (err, files) {
							if (files.indexOf("std") != -1)
								foundStd = true;
							if (files.indexOf("core") != -1)
								foundCore = true;
							if (++i < phobosPath.length)
								fn();
							else {
								if (!foundStd && !foundCore)
									vscode.window.showWarningMessage("Your d.stdlibPath setting doesn't contain a path to phobos or druntime. Auto completion might lack some symbols!", "Open User Settings").then(userSettings);
								else if (!foundStd)
									vscode.window.showWarningMessage("Your d.stdlibPath setting doesn't contain a path to phobos. Auto completion might lack some symbols!", "Open User Settings").then(userSettings);
								else if (!foundCore)
									vscode.window.showWarningMessage("Your d.stdlibPath setting doesn't contain a path to druntime. Auto completion might lack some symbols!", "Open User Settings").then(userSettings);
							}
						});
					}
					else
						vscode.window.showWarningMessage("A path in your d.stdlibPath setting doesn't exist. Auto completion might lack some symbols!", "Open User Settings").then(userSettings);
				});
		};
		fn();
	}*/

	let servedPath = config().get("servedPath", "serve-d");
	let executable: ServerOptions = {
		run: {
			command: servedPath,
			args: ["--require", "D", "--lang", vscode.env.language],
			options: {
				cwd: context.asAbsolutePath("bin")
			}
		},
		debug: {
			command: "gdbserver",
			args: ["--once", ":2345", servedPath, "--require", "D", "--lang", vscode.env.language],
			options: {
				cwd: context.asAbsolutePath("bin")
			}
		}
	};
	let clientOptions: LanguageClientOptions = {
		documentSelector: <DocumentFilter[]>[mode.D_MODE, mode.DUB_MODE, mode.DIET_MODE, { pattern: "test.txt", scheme: "file" }],
		synchronize: {
			configurationSection: ["d", "dfmt", "editor"],
			fileEvents: vscode.workspace.createFileSystemWatcher("**/*.d")
		}
	};
	let client = new LanguageClient("serve-d", "code-d & serve-d", executable, clientOptions);
	preStartup(client, context);
	context.subscriptions.push(client.start());
	var served = new ServeD(client);

	context.subscriptions.push(statusbar.setup(served));
	context.subscriptions.push(new CompileButtons(served));

	context.subscriptions.push(addSDLProviders());
	context.subscriptions.push(addJSONProviders());

	context.subscriptions.push(vscode.commands.registerCommand("code-d.switchConfiguration", () => {
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

	context.subscriptions.push(vscode.commands.registerCommand("code-d.switchArchType", () => {
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

	context.subscriptions.push(vscode.commands.registerCommand("code-d.switchBuildType", () => {
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

	context.subscriptions.push(vscode.commands.registerCommand("code-d.switchCompiler", () => {
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

	context.subscriptions.push(vscode.commands.registerTextEditorCommand("code-d.addImport", (editor, edit, name, location) => {
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

	context.subscriptions.push(vscode.commands.registerCommand("code-d.killServer", () => {
		client.sendNotification("served/killServer");
		vscode.window.showInformationMessage("Killed DCD-Server", "Restart").then((pick) => {
			if (pick == "Restart")
				vscode.commands.executeCommand("code-d.restartServer");
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand("code-d.restartServer", () => {
		client.sendRequest<boolean>("served/restartServer").then((success) => {
			if (success)
				vscode.window.showInformationMessage("Restarted DCD-Server");
			else
				vscode.window.showErrorMessage("Failed to restart DCD-Server");
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand("code-d.reloadImports", () => {
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

	if (vscode.workspace.rootPath) {
		{
			let gcprofiler = new GCProfiler();
			vscode.languages.registerCodeLensProvider(mode.D_MODE, gcprofiler);

			let watcher = vscode.workspace.createFileSystemWatcher("**/profilegc.log", false, false, false);

			watcher.onDidCreate(gcprofiler.updateProfileCache, gcprofiler, context.subscriptions);
			watcher.onDidChange(gcprofiler.updateProfileCache, gcprofiler, context.subscriptions);
			watcher.onDidDelete(gcprofiler.clearProfileCache, gcprofiler, context.subscriptions);
			context.subscriptions.push(watcher);

			let profileGCPath = path.join(vscode.workspace.rootPath, "profilegc.log");
			if (fs.existsSync(profileGCPath))
				gcprofiler.updateProfileCache(vscode.Uri.file(profileGCPath));

			context.subscriptions.push(vscode.commands.registerCommand("code-d.showGCCalls", gcprofiler.listProfileCache, gcprofiler));
		}
		{
			let coverageanal = new CoverageAnalyzer();
			context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("dcoveragereport", coverageanal));

			let watcher = vscode.workspace.createFileSystemWatcher("**/*.lst", false, false, false);

			watcher.onDidCreate(coverageanal.updateCache, coverageanal, context.subscriptions);
			watcher.onDidChange(coverageanal.updateCache, coverageanal, context.subscriptions);
			watcher.onDidDelete(coverageanal.removeCache, coverageanal, context.subscriptions);
			context.subscriptions.push(watcher);

			vscode.workspace.onDidOpenTextDocument(coverageanal.populateCurrent, coverageanal, context.subscriptions);

			vscode.workspace.findFiles("*.lst", "").then(files => {
				files.forEach(file => {
					coverageanal.updateCache(file);
				});
			});

			vscode.commands.registerCommand("code-d.generateCoverageReport", () => {
				vscode.commands.executeCommand("vscode.previewHtml", vscode.Uri.parse("dcoveragereport://null"));
			});
		}
	}
	{
		let editor = new DubEditor(context);
		context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("dubsettings", editor));
		context.subscriptions.push(vscode.commands.registerCommand("dub.openSettingsEditor", editor.open, editor));
		context.subscriptions.push(vscode.commands.registerCommand("dub.closeSettingsEditor", editor.close, editor));
	}

	let rdmdTerminal: vscode.Terminal;
	context.subscriptions.push(vscode.commands.registerCommand("code-d.rdmdCurrent", (file: vscode.Uri) => {
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

	context.subscriptions.push(vscode.commands.registerCommand("code-d.createProject", () => {
		showProjectCreator(context);
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
		client.outputChannel.appendLine(err);
		vscode.window.showErrorMessage("Failed to switch configuration. See extension output for details.");
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
}

export function config(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration("d");
}

function preStartup(client: any, context: vscode.ExtensionContext) {
	var manualOutput = false, outputChannel: vscode.OutputChannel;
	if (!client.outputChannel) {
		client.outputChannel = outputChannel = vscode.window.createOutputChannel("code-d startup log");
		manualOutput = true;
	}
	setContext(context);
	let env = process.env;
	let proxy = vscode.workspace.getConfiguration("http").get("proxy", "");
	if (proxy)
		env["http_proxy"] = proxy;

	if (context.globalState.get("restorePackageBackup", false)) {
		context.globalState.update("restorePackageBackup", false);
		var pkgPath = path.join(context.extensionPath, "package.json");
		fs.readFile(pkgPath + ".bak", function (err, data) {
			if (err)
				return vscode.window.showErrorMessage("Failed to restore after reload! Please reinstall code-d if problems occur before reporting!");
			fs.writeFile(pkgPath, data, function (err) {
				if (err)
					return vscode.window.showErrorMessage("Failed to restore after reload! Please reinstall code-d if problems occur before reporting!");
				fs.unlink(pkgPath + ".bak", function (err) {
					client.outputChannel.appendLine(err.toString());
				});
			});
		});
	}
	{
		/* Erase paths for old version */
		var invalid = /webfreak.code-d-(\d+\.\d+\.\d+)/;
		var curVersion = vscode.extensions.getExtension("webfreak.code-d").packageJSON.version;
		function fixOldCodeD(name: string) {
			var path = config().get(name, "");
			var m;
			if (m = invalid.exec(path)) {
				if (m[1] != curVersion) {
					client.outputChannel.appendLine("Erasing old code-d config value from " + name);
					config().update(name, undefined, true)
				}
			}
		}

		function checkProgram(configName, defaultPath, name, installFunc, btn = "Compile") {
			var version = "";
			ChildProcess.spawn(config().get(configName, defaultPath), ["--version"], { cwd: vscode.workspace.rootPath, env: env }).on("error", function (err) {
				if (err && (<any>err).code == "ENOENT") {
					var isDirectory = false;
					try {
						isDirectory = fs.statSync(config().get(configName, "")).isDirectory();
					} catch (e) { }
					if (isDirectory) {
						vscode.window.showErrorMessage(name + " points to a directory", "Open User Settings").then(s => {
							if (s == "Open User Settings")
								vscode.commands.executeCommand("workbench.action.openGlobalSettings");
						});
					} else {
						vscode.window.showErrorMessage(name + " is not installed or couldn't be found", btn + " " + name, "Open User Settings").then(s => {
							if (s == "Open User Settings")
								vscode.commands.executeCommand("workbench.action.openGlobalSettings");
							else if (s == btn + " " + name)
								installFunc(env);
						});
					}
				}
			}).stdout.on("data", function (chunk) {
				version += chunk;
			}).on("end", function () {
				client.outputChannel.appendLine(name + " version: " + version);
			});
		}
		checkProgram("dscannerPath", "dscanner", "dscanner", compileDScanner);
		checkProgram("dfmtPath", "dfmt", "dfmt", compileDfmt);
		// client is good enough
		checkProgram("dcdClientPath", "dcd-client", "DCD", compileDCD);
		checkProgram("dubPath", "dub", "dub", downloadDub, "Download");
		checkProgram("servedPath", "serve-d", "serve-d", compileServeD);
	}
	if (manualOutput) {
		setTimeout(() => {
			outputChannel.clear();
			outputChannel.hide();
			outputChannel.dispose();
		}, 1000);
	}
}
