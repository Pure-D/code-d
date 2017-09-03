import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LanguageClient, LanguageClientOptions, ServerOptions, DocumentFilter, NotificationType } from "vscode-languageclient";
import { setContext, downloadDub, compileServeD, getInstallOutput } from "./installer"
import { EventEmitter } from "events"
import * as ChildProcess from "child_process"

import * as mode from "./dmode";
import * as statusbar from "./statusbar";
import { CompileButtons } from "./compile-buttons";
import { addSDLProviders } from "./sdl/sdl-contributions";
import { addJSONProviders } from "./json-contributions";
import { GCProfiler } from "./gcprofiler";
import { CoverageAnalyzer } from "./coverage";
import { registerCommands, registerClientCommands } from "./commands";
import { DubDependency, DubDependencyInfo } from "./dub-view";

const opn = require('opn');

const isBeta = true;

export class ServeD extends EventEmitter implements vscode.TreeDataProvider<DubDependency> {
	constructor(public client: LanguageClient) {
		super();
	}

	private _onDidChangeTreeData: vscode.EventEmitter<DubDependency | undefined> = new vscode.EventEmitter<DubDependency | undefined>();
	readonly onDidChangeTreeData: vscode.Event<DubDependency | undefined> = this._onDidChangeTreeData.event;

	refreshDependencies(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: DubDependency): vscode.TreeItem {
		return element;
	}

	getChildren(element?: DubDependency): Thenable<DubDependency[]> {
		return new Promise(resolve => {
			var req = (element && element.info) ? element.info.name : "";
			var items: DubDependency[] = [];
			if (element) {
				if (element.info.description)
					items.push(new DubDependency(element.info.description, undefined, "description"));
				if (element.info.homepage)
					items.push(new DubDependency(element.info.homepage, {
						command: "open",
						title: "Open",
						arguments: [vscode.Uri.parse(element.info.homepage)]
					}, "web"));
				if (element.info.authors && element.info.authors.join("").trim())
					items.push(new DubDependency("Authors: " + element.info.authors.join(), undefined, "authors"));
				if (element.info.license)
					items.push(new DubDependency("License: " + element.info.license, undefined, "license"));
				if (element.info.copyright)
					items.push(new DubDependency(element.info.copyright));
			}
			if (!element || req)
				this.client.sendRequest<DubDependencyInfo[]>("served/listDependencies", req).then((deps) => {
					deps.forEach(dep => {
						items.push(new DubDependency(dep));
					});
					resolve(items);
				});
			else
				resolve(items);
		});
	}
}

function startClient(context: vscode.ExtensionContext) {
	let servedPath = config().get("servedPath", "serve-d");
	let executable: ServerOptions = {
		run: {
			command: servedPath,
			args: ["--require", "D", "--lang", vscode.env.language],
			options: {
				cwd: context.extensionPath
			}
		},
		debug: {
			command: "gdbserver",
			args: ["--once", ":2345", servedPath, "--require", "D", "--lang", vscode.env.language],
			options: {
				cwd: context.extensionPath
			}
		}
	};
	let clientOptions: LanguageClientOptions = {
		documentSelector: <DocumentFilter[]>[mode.D_MODE, mode.DUB_MODE, mode.DIET_MODE, mode.DSCANNER_INI_MODE],
		synchronize: {
			configurationSection: ["d", "dfmt", "editor", "git"],
			fileEvents: vscode.workspace.createFileSystemWatcher("**/*.d")
		}
	};
	let client = new LanguageClient("serve-d", "code-d & serve-d", executable, clientOptions);
	client.start();
	var served = new ServeD(client);

	context.subscriptions.push(statusbar.setup(served));
	context.subscriptions.push(new CompileButtons(served));

	client.onReady().then(() => {
		var updateSetting = new NotificationType<{ section: string, value: any, global: boolean }, void>("coded/updateSetting");
		client.onNotification(updateSetting, (arg: { section: string, value: any, global: boolean }) => {
			config().update(arg.section, arg.value, arg.global);
		});

		var logInstall = new NotificationType<string, void>("coded/logInstall");
		client.onNotification(logInstall, (message: string) => {
			getInstallOutput().appendLine(message);
		});

		client.onNotification("coded/initDubTree", function () {
			context.subscriptions.push(vscode.window.registerTreeDataProvider<DubDependency>("dubDependencies", served));
		});

		client.onNotification("coded/updateDubTree", function () {
			served.refreshDependencies();
		});
	});

	registerClientCommands(context, client, served);
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

	preStartup(context);

	context.subscriptions.push(addSDLProviders());
	context.subscriptions.push(addJSONProviders());

	registerCommands(context);

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
}

export function config(): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration("d");
}

function preStartup(context: vscode.ExtensionContext) {
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
					console.error(err.toString());
				});
			});
		});
	}
	{
		function checkProgram(configName: string, defaultPath: string, name: string, installFunc: Function, btn: string, done: Function = undefined) {
			var version = "";
			var errored = false;
			ChildProcess.spawn(config().get(configName, defaultPath), ["--version"], { cwd: vscode.workspace.rootPath, env: env }).on("error", function (err) {
				if (err && (<any>err).code == "ENOENT") {
					errored = true;
					if (config().get("aggressiveUpdate", true)) {
						installFunc(env, done);
					}
					else {
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
									installFunc(env, done);
							});
						}
					}
				}
			}).stdout.on("data", function (chunk) {
				version += chunk;
			}).on("end", function () {
				if (!errored && done)
					done(false);
			});
		}
		checkProgram("dubPath", "dub", "dub", downloadDub, "Download", () => {
			if (isBeta && !context.globalState.get("newestServed", false)) {
				context.globalState.update("newestServed", true).then(() => {
					compileServeD(env, () => {
						startClient(context);
					});
				});
			}
			else {
				checkProgram("servedPath", "serve-d", "serve-d", compileServeD, "Compile", () => {
					startClient(context);
				});
			}
		});
		function checkCompiler(compiler, callback) {
			ChildProcess.spawn(compiler, ["--version"]).on("error", function (err) {
				if (err && (<any>err).code == "ENOENT") {
					if (callback)
						callback(false);
					callback = undefined;
				}
				else console.error(err);
			}).on("exit", function () {
				if (callback)
					callback(true);
				callback = undefined;
			});
		}
		if (!context.globalState.get("checkedCompiler", false)) {
			function gotCompiler(compiler) {
				context.globalState.update("checkedCompiler", true);
				if (!compiler)
					opn("https://dlang.org/download.html").then(() => {
						vscode.window.showInformationMessage("Please install a D compiler from dlang.org and reload the window once done.");
					});
			}
			console.log("Checking if compiler is present");
			checkCompiler("dmd", (has) => {
				if (has)
					return gotCompiler("dmd");
				checkCompiler("ldc", (has) => {
					if (has)
						return gotCompiler("ldc");
					checkCompiler("ldc2", (has) => {
						if (has)
							return gotCompiler("ldc2");
						checkCompiler("gdc", (has) => {
							if (has)
								return gotCompiler("gdc");
							else
								return gotCompiler(false);
						});
					});
				});
			});
		}
	}
}
