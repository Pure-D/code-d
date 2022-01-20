import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { DubEditor } from "./dub-editor";
import { LanguageClient, TextEdit } from "vscode-languageclient/node";
import { config, served, ServeD } from "./extension";
import { showProjectCreator, performTemplateCopy, openFolderWithExtension } from "./project-creator";
import { listPackageOptions, getLatestPackageInfo } from "./dub-api"
import { DubDependency } from "./dub-view";
import { DubTasksProvider } from "./dub-tasks";
import { showDpldocsSearch } from "./dpldocs";
import { simpleBytesToString } from "./util";

const multiTokenWordPattern = /[^\`\~\!\@\#\%\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+(?:\.[^\`\~\!\@\#\%\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)*/;

var gClient: LanguageClient;

export function registerClientCommands(context: vscode.ExtensionContext, client: LanguageClient, served: ServeD) {
	var subscriptions = context.subscriptions;

	served.tasksProvider = new DubTasksProvider(client);
	subscriptions.push(vscode.tasks.registerTaskProvider("dub", served.tasksProvider));

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
			var s = change[0].range.start;
			var start = new vscode.Position(s.line, s.character);
			editor.insertSnippet(new vscode.SnippetString(change[0].newText), start);
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

	subscriptions.push(vscode.commands.registerCommand("code-d.insertDscanner", () => {
		const defaultDscannerIni = "[analysis.config.StaticAnalysisConfig]\nstyle_check=\"enabled\"\n";

		if (!vscode.window.activeTextEditor)
			return vscode.window.showErrorMessage("No text editor active");
		served.listDScannerConfig(vscode.window.activeTextEditor.document.uri).then((ini) => {
			var text = "";
			ini.forEach(section => {
				text += "; " + section.description + "\n";
				text += "[" + section.name + "]\n";
				section.features.forEach(feature => {
					text += "; " + feature.description + "\n";
					text += feature.name + "=\"" + feature.enabled + "\"\n";
				});
				text += "\n";
			});
			return text || defaultDscannerIni;
		}, (err) => {
			return defaultDscannerIni;
		}).then((text) => {
			if (!vscode.window.activeTextEditor)
				return;

			vscode.window.activeTextEditor.edit((bld) => {
				if (!vscode.window.activeTextEditor)
					return;
				bld.insert(vscode.window.activeTextEditor.selection.start, text);
			});
		});
	}));
}

export function registerCommands(context: vscode.ExtensionContext) {
	var subscriptions = context.subscriptions;

	vscode.commands.executeCommand("setContext", "d.isActive", true);

	subscriptions.push(DubEditor.register(context));

	subscriptions.push(vscode.commands.registerCommand("code-d.rdmdCurrent", async (file: vscode.Uri) => {
		var args: vscode.ShellQuotedString[] = [];
		if (!vscode.window.activeTextEditor)
			return vscode.window.showErrorMessage("No text editor active");

		const doc = vscode.window.activeTextEditor.document;
		if (!file && doc.isDirty && !doc.isUntitled) {
			const btnSave = "Save file";
			const btnDisk = "Run from disk";
			const btnCancel = "Abort";

			const choice = await vscode.window.showWarningMessage("The file is not saved, do you want to proceed?", btnSave, btnDisk, btnCancel);
			switch (choice) {
				case btnSave:
					if (!await vscode.window.activeTextEditor.document.save()) {
						vscode.window.showErrorMessage("Aborting RDMD run because save failed");
						return;
					}
					break;
				case btnDisk:
					break;
				case btnCancel:
				default:
					return;
			}
		}

		file = file || (doc.isUntitled ? undefined : doc.uri);

		var cwd = file ? path.dirname(file.fsPath) : vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : undefined;
		if (file)
			args = [{ value: file.fsPath, quoting: vscode.ShellQuoting.Strong }];
		else
			args = [{
				value: "--eval=" + doc.getText(),
				quoting: vscode.ShellQuoting.Strong
			}];

		const shell = new vscode.ShellExecution({ value: "rdmd", quoting: vscode.ShellQuoting.Strong }, args, { cwd: cwd });
		var evalCounter = 0;
		const task = new vscode.Task({ type: "rdmd" }, vscode.TaskScope.Workspace, "RDMD " + (file || ("eval code " + (++evalCounter))), "code-d", shell);

		task.isBackground = false;
		task.presentationOptions = { echo: !!file };

		vscode.tasks.executeTask(task);
	}));

	function withProject(fn: (...args: any[]) => any) {
		return async function(this: any, config: any) {
			if (!served)
				throw new Error("serve-d is not yet started, can't read DUB config");
			const project = await served.getActiveDubConfig();
			return fn.apply(this, [config, project]);
		};
	}

	subscriptions.push(vscode.commands.registerCommand("code-d.getActiveDubPackageName", withProject((config, project) => {
		return project.packageName;
	})));

	subscriptions.push(vscode.commands.registerCommand("code-d.getActiveDubPackagePath", withProject((config, project) => {
		return project.packagePath;
	})));

	subscriptions.push(vscode.commands.registerCommand("code-d.getActiveDubWorkingDirectory", withProject((config, project) => {
		return path.join(project.packagePath, project.workingDirectory);
	})));

	subscriptions.push(vscode.commands.registerCommand("code-d.getActiveDubTarget", withProject((config, project) => {
		return path.join(project.targetPath, project.targetName);
	})));

	subscriptions.push(vscode.commands.registerCommand("code-d.getActiveDubTargetPath", withProject((config, project) => {
		return project.targetPath;
	})));

	subscriptions.push(vscode.commands.registerCommand("code-d.getActiveDubTargetName", withProject((config, project) => {
		return project.targetName;
	})));

	subscriptions.push(vscode.commands.registerCommand("code-d.createProject", () => {
		showProjectCreator(context);
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.viewDubPackage", (root: string, packageName?: string) => {
		const dependencyClickBehavior = config(null).get("dependencyClickBehavior");
		switch (dependencyClickBehavior) {
		case "listDocumentsPreview":
		case "listDocumentsSource":
		case "listDocumentsBoth":
			vscode.commands.executeCommand("code-d.listDubPackageDocuments", dependencyClickBehavior, root, packageName);
			break;
		case "openRecipe":
			vscode.commands.executeCommand("code-d.openDubRecipe", root);
			break;
		case "openDpldocs":
			vscode.commands.executeCommand("code-d.openDubOnDpldocs", root);
			break;
		case "doNothing":
			break;
		case "openFileDialog":
			vscode.commands.executeCommand("code-d.openDependencyFile", root);
			break;
		default:
			vscode.window.showErrorMessage("Unknown d.dependencyClickBehavior setting: " + JSON.stringify(dependencyClickBehavior));
			break;
		}
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.openDependencyFile", (root: string | DubDependency) => {
		if (typeof root != "string")
			root = root.info?.path!;
		if (!root)
			return;

		vscode.window.showOpenDialog({
			defaultUri: vscode.Uri.file(root),
			canSelectMany: true
		}).then(uris => {
			if (uris)
				uris.forEach(uri => {
					vscode.window.showTextDocument(uri);
				});
		})
	}));
	subscriptions.push(vscode.commands.registerCommand("code-d.openDubRecipe", (root: string | DubDependency) => {
		let explicit = root instanceof DubDependency;
		let showError = function() {
			if (explicit)
				vscode.window.showErrorMessage("No recipe found");
		};
		if (typeof root != "string")
			root = root.info?.path!;
		if (!root)
			return showError();

		const recipeFilenames = [
			"dub.sdl",
			"dub.json",
			"package.json"
		];
		for (let i = 0; i < recipeFilenames.length; i++) {
			const recipe = path.join(root, recipeFilenames[i]);
			if (fs.existsSync(recipe)) {
				vscode.commands.executeCommand("vscode.open", vscode.Uri.file(recipe));
				return;
			}
		}
		showError();
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.openDubOnDpldocs", (root: DubDependency) => {
		let explicit = root instanceof DubDependency;
		let showError = function() {
			if (explicit)
				vscode.window.showErrorMessage("Could not determine package name");
		};
		let name = root?.info?.name;
		let version = root?.info?.version;
		if (!name)
			return showError();

		let colon = name.indexOf(':');
		if (colon >= 0) {
			name = name.substr(0, colon); // strip subpackage
			version = undefined; // versions are invalid for subpackages
		}

		if (version)
			vscode.env.openExternal(vscode.Uri.parse(`https://${name}.dpldocs.info/v${version}/`))
		else
			vscode.env.openExternal(vscode.Uri.parse(`https://${name}.dpldocs.info/`))
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.listDubPackageDocuments", (
		behavior: DubDependency | "listDocumentsPreview" | "listDocumentsSource" | "listDocumentsBoth",
		root?: string,
		packageName?: string
	) => {
		let explicit = behavior instanceof DubDependency;
		let showError = function(force?: boolean) {
			if (explicit || force) {
				if (root) {
					let browseBtn = "Browse Files";
					let openRecipe = "Open Recipe";
					vscode.window.showErrorMessage("No viewable files found.", browseBtn, openRecipe).then(btn => {
						if (btn == browseBtn)
							vscode.commands.executeCommand("code-d.openDependencyFile", root);
						else if (btn == openRecipe)
							vscode.commands.executeCommand("code-d.openDubRecipe", root);
					});
				} else {
					vscode.window.showErrorMessage("No viewable files found.");
				}
			}
		};

		if (behavior instanceof DubDependency) {
			root = behavior.info?.path!;
			packageName = behavior.info?.name;
			behavior = "listDocumentsBoth";

			if (!root)
				return showError();
		}

		// preview + view source if behavior is invalid value
		const doPreview = behavior != "listDocumentsSource";
		const doViewSource = behavior != "listDocumentsPreview";

		if (root) {
			fs.readdir(root, async (err, files) => {
				if (err)
					return showError(true);
				function isInterestingFilename(f: string): boolean {
					f = f.toLowerCase();
					let filter = <string[]>config(null).get("dependencyTextDocumentFilter");
					for (let i = 0; i < filter.length; i++) {
						if (new RegExp(filter[i], "i").exec(f))
							return true;
					}
					return false;
				}
				let readmes = files.filter(isInterestingFilename);
				if (!readmes.length)
					return showError(true);
				readmes.sort();
				readmes.reverse(); // README > LICENSE > CHANGELOG

				let items: (vscode.QuickPickItem & { args: [string, boolean] })[] = [];

				for (let i = 0; i < readmes.length; i++) {
					let previewable = isDubReadmePreviewable(readmes[i]);
					if (doPreview || !previewable)
						items.push({
							label: readmes[i],
							description: getDubPreviewDescription(readmes[i]),
							args: [readmes[i], true]
				});

					if (!(doPreview || !previewable) || doViewSource && previewable) {
						items.push({
							label: readmes[i],
							description: "$(file-code) source",
							args: [readmes[i], false]
						});
					}
				}

				let args: [string, boolean] | undefined;
				if (items.length == 1) {
					args = items[0].args;
				} else {
					args = (await vscode.window.showQuickPick(items, {
						placeHolder: "Select file to show",
					}))?.args;
				}

				if (!args)
					return;

				let readme = path.join(root!, args[0]);
				let uri = vscode.Uri.file(readme);
				previewDubReadme(vscode.Uri.file(root!), uri, args[1], packageName);
			});
		} else {
			showError();
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

	subscriptions.push(vscode.commands.registerCommand("code-d.searchDocs", () => {
		var query = "";
		if (vscode.window.activeTextEditor)
			query = vscode.window.activeTextEditor.document.getText(vscode.window.activeTextEditor.selection);
		showDpldocsSearch(query);
	}));

	subscriptions.push(vscode.commands.registerTextEditorCommand("code-d.openDocsAtCursor", (editor, edit) => {
		// TODO: we can probably add local ddoc rendering if we can jump to the symbol anyway
		var query = "";
		if (editor.selection.isEmpty) {
			const range = editor.document.getWordRangeAtPosition(editor.selection.active, multiTokenWordPattern);
			if (range)
				showDpldocsSearch(editor.document.getText(range), true);
			else
				showDpldocsSearch("");
		}
		else
			showDpldocsSearch(editor.document.getText(editor.selection), true);
	}));

	subscriptions.push(vscode.commands.registerCommand("code-d.viewUserGuide", () => {
		vscode.commands.executeCommand("markdown.showPreview", vscode.Uri.file(context.asAbsolutePath("docs/index.md")), { locked: true });
	}));
}

async function previewDubReadme(dir: vscode.Uri, uri: vscode.Uri, useRichPreview: boolean, packageName?: string) {
	/*
	README breakdown from 2022-01-08 out of all dub packages on dub registry:
	filename               packages on dub
	README.md              1958
	README                 31
	README.rst             16
	README.markdown        13
	readme.org             11
	readme.txt             7
	README.html            7
	readme.adoc            3
	README.EN              3
	README.ja.md           3
	README.RU              3
	README-ja.md           2
	readme-resources       2
	Readme_APILookup       1
	readme_screenshot.png  1
	README_zh_CN.md        1
	README-SDL.txt         1
	README-SDL2_Image.txt  1
	README-SDL2_ttf.txt    1
	README.cn.md           1
	readme.drawio.svg      1
	README.md.dj           1
	README.testing.md      1

	Based on that I'm currently supporting:
	- Markdown preview (builtin vscode extension)
	- HTML (vscode web view)
	- rst (needs lextudio.restructuredtext or tht13.rst-vscode installed)
	- fallback (default vscode editor)
	*/

	if (!useRichPreview)
		return openReadableTextFile(uri);

	var extension = path.extname(uri.path).toLowerCase();
	if (extension == ".md" || extension == ".markdown") {
		// most packages have markdown or plaintext README
		vscode.commands.executeCommand("markdown.showPreview", uri, { locked: true });
	} else if (extension == ".html" || extension == ".htm") {
		// some packages (e.g. tinyendian) have HTML READMEs
		let panel = vscode.window.createWebviewPanel(
			"dubReadme",
			(packageName ? packageName + " " : "") + path.basename(uri.path),
			vscode.ViewColumn.Active,
			{
				enableCommandUris: false,
				enableFindWidget: true,
				enableScripts: false,
				localResourceRoots: [dir],
				retainContextWhenHidden: false
			}
		);
		let bytes = await vscode.workspace.fs.readFile(uri);
		panel.webview.html = simpleBytesToString(bytes);
	} else if (extension == ".rst") {
		if (vscode.extensions.getExtension("lextudio.restructuredtext")) {
			vscode.commands.executeCommand("restructuredtext.showPreview", uri);
		} else if (vscode.extensions.getExtension("tht13.rst-vscode")) {
			vscode.commands.executeCommand("rst.showPreview", uri);
		} else {
			openReadableTextFile(uri);
		}
	} else {
		openReadableTextFile(uri);
	}
}

function openReadableTextFile(uri: vscode.Uri) {
	// TODO: might wanna force word wrap here
	return vscode.window.showTextDocument(uri);
}

function getDubPreviewDescription(filename: string): string | undefined {
	let extension = path.extname(filename).toLowerCase();
	switch (extension) {
	case ".md":
	case ".markdown":
		return "$(markdown) preview";
	case ".html":
	case ".htm":
		return "$(preview) preview";
	case ".rst":
		if (vscode.extensions.getExtension("lextudio.restructuredtext")
		 || vscode.extensions.getExtension("tht13.rst-vscode"))
			return "$(preview) preview";
		else
			return "(plain text, missing RST extension)";
	default:
		return undefined;
	}
}

function isDubReadmePreviewable(filename: string): boolean {
	let extension = path.extname(filename).toLowerCase();
	switch (extension) {
	case ".md":
	case ".markdown":
	case ".html":
	case ".htm":
		return true;
	case ".rst":
		if (vscode.extensions.getExtension("lextudio.restructuredtext")
		 || vscode.extensions.getExtension("tht13.rst-vscode"))
			return true;
		else
			return false;
	default:
		return false;
	}
}
