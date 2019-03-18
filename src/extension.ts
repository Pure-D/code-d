import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LanguageClient, LanguageClientOptions, ServerOptions, DocumentFilter, NotificationType, CloseAction, ErrorAction, ErrorHandler, Message } from "vscode-languageclient";
import { setContext, downloadDub, installServeD, compileServeD, getInstallOutput, checkBetaServeD, TARGET_SERVED_VERSION } from "./installer"
import { EventEmitter } from "events"
import * as ChildProcess from "child_process"

import * as mode from "./dmode";
import * as statusbar from "./statusbar";
import { addSDLProviders } from "./sdl/sdl-contributions";
import { addJSONProviders } from "./json-contributions";
import { GCProfiler } from "./gcprofiler";
import { CoverageAnalyzer } from "./coverage";
import { registerCommands, registerClientCommands } from "./commands";
import { DubDependency, DubDependencyInfo } from "./dub-view";

const expandTilde = require("expand-tilde");

class CustomErrorHandler implements ErrorHandler {
	private restarts: number[];

	constructor(private output: vscode.OutputChannel) {
		this.restarts = [];
	}

	public error(error: Error, message: Message, count: number): ErrorAction {
		return ErrorAction.Continue;
	}
	public closed(): CloseAction {
		this.restarts.push(Date.now());
		if (this.restarts.length < 20) {
			return CloseAction.Restart;
		} else {
			let diff = this.restarts[this.restarts.length - 1] - this.restarts[0];
			if (diff <= 60 * 1000) {
				// TODO: run automated diagnostics about current code file here
				this.output.appendLine(`Server crashed 20 times in the last minute. The server will not be restarted.`);
				return CloseAction.DoNotRestart;
			} else {
				this.restarts.shift();
				return CloseAction.Restart;
			}
		}
	}
}

export var served: ServeD;

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
			if (element && element.info) {
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

	triggerDscanner(uri: vscode.Uri) {
		this.client.sendNotification("coded/doDscanner", {
			textDocument: {
				uri: uri.toString()
			}
		});
	}

	findFiles(query: string): Thenable<string[]> {
		return this.client.sendRequest("served/searchFile", query);
	}

	findFilesByModule(query: string): Thenable<string[]> {
		return this.client.sendRequest("served/findFilesByModule", query);
	}

	private static taskGroups: vscode.TaskGroup[] = [
		vscode.TaskGroup.Build,
		vscode.TaskGroup.Clean,
		vscode.TaskGroup.Rebuild,
		vscode.TaskGroup.Test,
	];
}

function startClient(context: vscode.ExtensionContext) {
	let servedPath = expandTilde(config(null).get("servedPath", "serve-d"));
	let executable: ServerOptions = {
		run: {
			command: servedPath,
			args: ["--require", "D", "--lang", vscode.env.language],
			options: {
				cwd: context.extensionPath
			}
		},
		debug: {
			//command: "gdbserver",
			//args: ["--once", ":2345", servedPath, "--require", "D", "--lang", vscode.env.language],
			command: servedPath,
			args: ["--require", "D", "--lang", vscode.env.language, "--wait"],
			options: {
				cwd: context.extensionPath
			}
		}
	};
	var outputChannel = vscode.window.createOutputChannel("code-d & serve-d");
	let clientOptions: LanguageClientOptions = {
		documentSelector: <DocumentFilter[]>[mode.D_MODE, mode.DUB_MODE, mode.DIET_MODE, mode.DML_MODE, mode.DSCANNER_INI_MODE],
		synchronize: {
			configurationSection: ["d", "dfmt", "dscanner", "editor", "git"],
			fileEvents: vscode.workspace.createFileSystemWatcher("**/*.d")
		},
		outputChannel: outputChannel,
		errorHandler: new CustomErrorHandler(outputChannel)
	};
	let client = new LanguageClient("serve-d", "code-d & serve-d", executable, clientOptions);
	client.start();
	served = new ServeD(client);

	context.subscriptions.push({
		dispose() {
			client.stop();
		}
	});

	client.onReady().then(() => {
		var updateSetting = new NotificationType<{ section: string, value: any, global: boolean }, void>("coded/updateSetting");
		client.onNotification(updateSetting, (arg: { section: string, value: any, global: boolean }) => {
			config(null).update(arg.section, arg.value, arg.global);
		});

		var logInstall = new NotificationType<string, void>("coded/logInstall");
		client.onNotification(logInstall, (message: string) => {
			getInstallOutput().appendLine(message);
		});

		client.onNotification("coded/initDubTree", function () {
			context.subscriptions.push(statusbar.setupDub(served));
			context.subscriptions.push(vscode.window.registerTreeDataProvider<DubDependency>("dubDependencies", served));
		});

		client.onNotification("coded/updateDubTree", function () {
			served.refreshDependencies();
		});

		client.onNotification("coded/changedSelectedWorkspace", function () {
			served.emit("workspace-change");
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

	if (vscode.workspace.workspaceFolders) {
		{
			let gcprofiler = new GCProfiler();
			vscode.languages.registerCodeLensProvider(mode.D_MODE, gcprofiler);

			let watcher = vscode.workspace.createFileSystemWatcher("**/profilegc.log", false, false, false);

			watcher.onDidCreate(gcprofiler.updateProfileCache, gcprofiler, context.subscriptions);
			watcher.onDidChange(gcprofiler.updateProfileCache, gcprofiler, context.subscriptions);
			watcher.onDidDelete(gcprofiler.clearProfileCache, gcprofiler, context.subscriptions);
			context.subscriptions.push(watcher);

			let profileGCPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, "profilegc.log");
			if (fs.existsSync(profileGCPath))
				gcprofiler.updateProfileCache(vscode.Uri.file(profileGCPath));

			context.subscriptions.push(vscode.commands.registerCommand("code-d.showGCCalls", gcprofiler.listProfileCache, gcprofiler));
		}
		{
			let coverageanal = new CoverageAnalyzer();
			context.subscriptions.push(coverageanal);
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

export function config(resource: vscode.Uri | null): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration("d", resource);
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
			return fs.writeFile(pkgPath, data, function (err) {
				if (err)
					return vscode.window.showErrorMessage("Failed to restore after reload! Please reinstall code-d if problems occur before reporting!");
				return fs.unlink(pkgPath + ".bak", function (err: any) {
					console.error(err.toString());
				});
			});
		});
	}
	{
		function checkProgram(configName: string, defaultPath: string, name: string, installFunc: (env: NodeJS.ProcessEnv, done: (installed: boolean) => void) => any, btn: string, done?: (installed: boolean) => void, outdatedCheck?: (log: string) => boolean) {
			var version = "";
			var errored = false;
			var proc = ChildProcess.spawn(expandTilde(config(null).get(configName, defaultPath)), ["--version"], { cwd: vscode.workspace.rootPath, env: env });
			proc.stderr.on("data", function (chunk) {
				version += chunk;
			});
			proc.stdout.on("data", function (chunk) {
				version += chunk;
			});
			proc.on("error", function (err) {
				if (err && (<any>err).code == "ENOENT") {
					errored = true;
					if (config(null).get("aggressiveUpdate", true)) {
						installFunc(env, done || (() => { }));
					}
					else {
						var isDirectory = false;
						try {
							var testPath = config(null).get(configName, "");
							isDirectory = path.isAbsolute(testPath) && fs.statSync(testPath).isDirectory();
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
									installFunc(env, done || (() => { }));
							});
						}
					}
				}
			}).on("exit", function () {
				if (outdatedCheck && outdatedCheck(version)) {
					if (config(null).get("aggressiveUpdate", true)) {
						installFunc(env, done || (() => { }));
					}
					else {
						vscode.window.showErrorMessage(name + " is outdated.", btn + " " + name, "Continue Anyway").then(s => {
							if (s == "Continue Anyway") {
								if (done)
									done(false);
							}
							else if (s == btn + " " + name)
								installFunc(env, done || (() => { }));
						});
					}
					return;
				}
				if (!errored && done)
					done(false);
			});
		}
		checkProgram("dubPath", "dub", "dub", downloadDub, "Download", () => {
			var isBeta = config(null).get("betaStream", false);
			if (isBeta) {
				checkBetaServeD((newest: boolean) => {
					if (newest)
						startClient(context);
					else
						compileServeD(env, () => {
							setTimeout(() => {
								// make sure settings get updated
								startClient(context);
							}, 500);
						});
				})
			}
			else {
				checkProgram("servedPath", "serve-d", "serve-d", installServeD, "Download", () => {
					// make sure settings get updated
					setTimeout(() => {
						startClient(context);
					}, 500);
				}, (log) => {
					var m = /serve-d v(\d+)\.(\d+)\.(\d+)/.exec(log);
					if (m) {
						var major = parseInt(m[1]);
						var minor = parseInt(m[2]);
						var patch = parseInt(m[3]);
						if (major < TARGET_SERVED_VERSION[0])
							return true;
						if (major == TARGET_SERVED_VERSION[0] && minor < TARGET_SERVED_VERSION[1])
							return true;
						if (major == TARGET_SERVED_VERSION[0] && minor == TARGET_SERVED_VERSION[1] && patch < TARGET_SERVED_VERSION[2])
							return true;
					}
					return false;
				});
			}
		});
		function checkCompiler(compiler: string, callback: Function | undefined) {
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
			function gotCompiler(compiler: string | false) {
				context.globalState.update("checkedCompiler", true);
				if (!compiler)
					vscode.env.openExternal(vscode.Uri.parse("https://dlang.org/download.html")).then(() => {
						vscode.window.showInformationMessage("Please install a D compiler from dlang.org and reload the window once done.");
					});
			}
			console.log("Checking if compiler is present");
			checkCompiler("dmd", (has: boolean) => {
				if (has)
					return gotCompiler("dmd");
				checkCompiler("ldc", (has: boolean) => {
					if (has)
						return gotCompiler("ldc");
					checkCompiler("ldc2", (has: boolean) => {
						if (has)
							return gotCompiler("ldc2");
						checkCompiler("gdc", (has: boolean) => {
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
