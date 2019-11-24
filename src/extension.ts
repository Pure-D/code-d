import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LanguageClient, LanguageClientOptions, ServerOptions, DocumentFilter, NotificationType, CloseAction, ErrorAction, ErrorHandler, Message } from "vscode-languageclient";
import { setContext, installServeD, compileServeD, getInstallOutput, downloadFileInteractive, findLatestServeD, cmpSemver, extractServedBuiltDate, Release, updateAndInstallServeD } from "./installer"
import { EventEmitter } from "events"
import * as ChildProcess from "child_process"
import * as which from "which"

import * as mode from "./dmode";
import * as statusbar from "./statusbar";
import { addSDLProviders } from "./sdl/sdl-contributions";
import { addJSONProviders } from "./json-contributions";
import { GCProfiler } from "./gcprofiler";
import { CoverageAnalyzer } from "./coverage";
import { registerCommands, registerClientCommands } from "./commands";
import { DubDependency, DubDependencyInfo } from "./dub-view";

import expandTilde = require("expand-tilde");

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
		if (this.restarts.length < 10) {
			return CloseAction.Restart;
		} else {
			let diff = this.restarts[this.restarts.length - 1] - this.restarts[0];
			if (diff <= 60 * 1000) {
				// TODO: run automated diagnostics about current code file here
				this.output.appendLine(`Server crashed 10 times in the last minute. The server will not be restarted.`);
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
	let args = ["--require", "D", "--lang", vscode.env.language, "--provide", "http", "--provide", "implement-snippets", "--provide", "context-snippets"];
	let executable: ServerOptions = {
		run: {
			command: servedPath,
			args: args,
			options: {
				cwd: context.extensionPath
			}
		},
		debug: {
			//command: "gdbserver",
			//args: ["--once", ":2345", servedPath, "--require", "D", "--lang", vscode.env.language],
			command: servedPath,
			args: args.concat("--wait"),
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
			vscode.commands.executeCommand("setContext", "d.hasDubProject", true);
			context.subscriptions.push(vscode.window.registerTreeDataProvider<DubDependency>("dubDependencies", served));
		});

		client.onNotification("coded/updateDubTree", function () {
			served.refreshDependencies();
		});

		client.onNotification("coded/changedSelectedWorkspace", function () {
			served.emit("workspace-change");
			served.refreshDependencies();
		});

		client.onRequest<boolean, { url: string, title?: string, output: string }>("coded/interactiveDownload", function (e, token): Thenable<boolean> {
			return new Promise((resolve, reject) => {
				downloadFileInteractive(e.url, e.title || "Dependency Download", () => {
					resolve(false);
				}).pipe(fs.createWriteStream(e.output)).on("finish", () => {
					resolve(true);
				});
			});
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
				vscode.workspace.openTextDocument(vscode.Uri.parse("dcoveragereport://null"));
			});
		}
	}
}

export function config(resource: vscode.Uri | null): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration("d", resource);
}

function preStartup(context: vscode.ExtensionContext) {
	const userConfig = "Open User Settings";

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
		function checkDub(dubPath: string | undefined, done: (available: boolean) => any, updateSetting: boolean = false) {
			let tryCompiler = !!dubPath;
			if (!dubPath)
				dubPath = <string>expandTilde(config(null).get("dubPath", "dub"));
			let errored = false;
			let exited = false;

			function errorCallback(err: any) {
				console.error(err);
				errored = true;
				if (!exited) {
					if (!tryCompiler)
						return done(false);
					checkCompilers((has, dmdPath) => {
						if (!has || !dmdPath)
							return done(false);
						else {
							let ext = process.platform == "win32" ? ".exe" : "";
							checkDub(path.join(path.dirname(dmdPath), "dub" + ext), done, true);
						}
					});
				}
			}

			let proc: ChildProcess.ChildProcessWithoutNullStreams;
			try {
				proc = ChildProcess.spawn(dubPath, ["--version"], { cwd: vscode.workspace.rootPath, env: env });
			} catch (e) {
				// for example invalid executable error
				return errorCallback(e);
			}
			proc.on("error", errorCallback).on("exit", function () {
				exited = true;
				if (!errored) {
					if (updateSetting)
						config(null).update("dubPath", path).then(() => done(true));
					else
						done(true);
				}
			});
		}
		function checkProgram(configName: string, defaultPath: string, name: string, installFunc: (env: NodeJS.ProcessEnv, done: (installed: boolean) => void) => any, btn: string, done?: (installed: boolean) => void, outdatedCheck?: (log: string) => (boolean | [boolean, string])) {
			var version = "";
			var errored = false;

			function errorCallback(err: any) {
				console.error(err);
				const fullConfigName = "d." + configName;
				if (btn == "Install" || btn == "Download") btn = "Reinstall";
				const reinstallBtn = btn + " " + name;
				const userSettingsBtn = "Open User Settings";

				let defaultHandler = (s: string | undefined) => {
					if (s == userSettingsBtn)
						vscode.commands.executeCommand("workbench.action.openGlobalSettings");
					else if (s == reinstallBtn)
						installFunc(env, done || (() => { }));
				};

				errored = true;
				if (err && err.code == "ENOENT") {
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
							vscode.window.showErrorMessage(name + " from setting " + fullConfigName + " points to a directory", reinstallBtn, userSettingsBtn).then(defaultHandler);
						} else {
							vscode.window.showErrorMessage(name + " from setting " + fullConfigName + " is not installed or couldn't be found", reinstallBtn, userSettingsBtn).then(defaultHandler);
						}
					}
				} else if (err && err.code == "EACCES") {
					vscode.window.showErrorMessage(name + " from setting " + fullConfigName + " is not marked as executable or is in a non-executable directory.", reinstallBtn, userSettingsBtn).then(defaultHandler);
				} else if (err && err.code) {
					vscode.window.showErrorMessage(name + " from setting " + fullConfigName + " failed executing: " + err.code, reinstallBtn, userSettingsBtn).then(defaultHandler);
				} else if (err) {
					vscode.window.showErrorMessage(name + " from setting " + fullConfigName + " failed executing: " + err, reinstallBtn, userSettingsBtn).then(defaultHandler);
				}
			}

			try {
				var proc = ChildProcess.spawn(expandTilde(config(null).get(configName, defaultPath)), ["--version"], { cwd: vscode.workspace.rootPath, env: env });
			} catch (e) {
				// for example invalid executable error
				return errorCallback(e);
			}
			if (proc.stderr)
				proc.stderr.on("data", function (chunk) {
					version += chunk;
				});
			if (proc.stdout)
				proc.stdout.on("data", function (chunk) {
					version += chunk;
				});
			proc.on("error", errorCallback).on("exit", function () {
				let outdatedResult = outdatedCheck && outdatedCheck(version);
				let isOutdated = typeof outdatedResult == "boolean" ? outdatedResult
					: typeof outdatedResult == "object" && Array.isArray(outdatedResult) ? outdatedResult[0]
						: false;
				let msg = typeof outdatedResult == "object" && Array.isArray(outdatedResult) ? outdatedResult[1] : undefined;
				if (isOutdated) {
					if (config(null).get("aggressiveUpdate", true)) {
						installFunc(env, done || (() => { }));
					}
					else {
						vscode.window.showErrorMessage(name + " is outdated. " + (msg || ""), btn + " " + name, "Continue Anyway").then(s => {
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

		// disable dub checks for now because precompiled dub binaries on windows are broken
		checkDub(undefined, (available) => {
			if (!available) {
				console.error("Failed to automatically find dub or execute it! Please set d.dubPath properly.");

				if (config(null).get("dubPath", "dub") != "dub")
					vscode.window.showErrorMessage("The dub path specified in your user settings via d.dubPath is not a"
						+ " valid dub executable. Please unset it to automatically find it through your compiler or manually"
						+ " point it to a valid executable file.\n\nIssues building projects might occur.",
						userConfig).then((item) => {
							if (item == userConfig)
								vscode.commands.executeCommand("workbench.action.openGlobalSettings");
						});
			}

			let isLegacyBeta = config(null).get("betaStream", false);
			let servedReleaseChannel = config(null).inspect("servedReleaseChannel");
			let channelString = config(null).get("servedReleaseChannel", "stable");

			let reloading = false;
			let started = false;
			let outdated = false;

			function didChangeReleaseChannel(updated: Thenable<any>) {
				if (started && !reloading) {
					reloading = true;
					// make sure settings get updated
					updated.then(() => {
						vscode.commands.executeCommand("workbench.action.reloadWindow");
					});
				} else
					outdated = true;
			}

			function isServedOutdated(current: Release | undefined): (log: string) => (boolean | [boolean, string]) {
				return (log: string) => {
					if (!current || !current.asset)
						return false; // network failure or frozen release channel, let's not bother the user
					else if (current.name == "nightly") {
						let date = new Date(current.asset.created_at);
						let installed = extractServedBuiltDate(log);
						if (!installed)
							return [true, "(target=nightly, installed=none)"];

						date.setUTCHours(0);
						date.setUTCMinutes(0);
						date.setUTCSeconds(0);

						installed.setUTCHours(12);
						installed.setUTCMinutes(0);
						installed.setUTCSeconds(0);

						return installed < date;
					}

					let installedChannel = context.globalState.get("serve-d-downloaded-release-channel");
					if (installedChannel && channelString != installedChannel)
						return [true, "(target channel=" + channelString + ", installed channel=" + installedChannel + ")"];

					var m = /serve-d v(\d+\.\d+\.\d+(?:-[-.a-zA-Z0-9]+)?)/.exec(log);
					var target = current.name;
					if (target.startsWith("v")) target = target.substr(1);

					if (m) {
						try {
							return [cmpSemver(m[1], target) < 0, "(target=" + target + ", installed=" + m[1] + ")"];
						} catch (e) {
							getInstallOutput().show(true);
							getInstallOutput().appendLine("ERROR: could not compare current serve-d version with release");
							getInstallOutput().appendLine(e.toString());
						}
					}
					return false;
				};
			}

			if (isLegacyBeta && servedReleaseChannel && !servedReleaseChannel.globalValue) {
				config(null).update("servedReleaseChannel", "nightly", vscode.ConfigurationTarget.Global);
				channelString = "nightly";

				let stable = "Switch to Stable";
				let beta = "Switch to Beta";
				vscode.window.showInformationMessage("Hey! The setting 'd.betaStream' no longer exists and has been replaced with "
					+ "'d.servedReleaseChannel'. Your settings have been automatically updated to fetch nightly builds, but you "
					+ "probably want to remove the old setting.\n\n"
					+ "Stable and beta releases are planned more frequently now, so they might be a better option for you.",
					stable, beta, userConfig).then(item => {
						if (item == userConfig) {
							vscode.commands.executeCommand("workbench.action.openGlobalSettings");
						} else if (item == stable) {
							let done = config(null).update("servedReleaseChannel", "stable", vscode.ConfigurationTarget.Global);
							didChangeReleaseChannel(done);
						} else if (item == beta) {
							let done = config(null).update("servedReleaseChannel", "beta", vscode.ConfigurationTarget.Global);
							didChangeReleaseChannel(done);
						}
					});
			}

			let force = true; // force release lookup before first install
			if (context.globalState.get("serve-d-downloaded-release-channel"))
				force = false;

			let targetRelease = findLatestServeD(version => {
				checkProgram("servedPath", "serve-d", "serve-d",
					version ? (version.asset
						? installServeD([version.asset.browser_download_url], version.name)
						: compileServeD(version ? version.name : undefined))
						: updateAndInstallServeD,
					version ? (version.asset ? "Download" : "Compile") : "Install", () => {
						context.globalState.update("serve-d-downloaded-release-channel", channelString).then(() => {
							if (outdated) {
								if (!reloading) {
									reloading = true;
									// just to be absolutely sure all settings have been written
									setTimeout(() => {
										vscode.commands.executeCommand("workbench.action.reloadWindow");
									}, 500);
								}
							} else {
								startClient(context);
								started = true;
							}
						});
					}, isServedOutdated(version));
			}, force, channelString);
		});
		function checkCompiler(compiler: string, callback: Function | undefined) {
			which(compiler, function (err: any, compilerPath: string | undefined) {
				if (err || !compilerPath) {
					if (callback)
						callback(false);
				} else {
					function errorCallback(err: any) {
						if (err && err.code == "ENOENT") {
							if (callback)
								callback(false, compilerPath);
							callback = undefined;
						}
						else console.error(err);
					}

					let proc: ChildProcess.ChildProcessWithoutNullStreams;
					try {
						proc = ChildProcess.spawn(compilerPath, ["--version"]);
					} catch (e) {
						return errorCallback(e);
					}
					proc.on("error", errorCallback).on("exit", function () {
						if (callback)
							callback(true, compilerPath);
						callback = undefined;
					});
				}
			});
		}
		function checkCompilers(done: (has: string | false, path: string | undefined) => any) {
			checkCompiler("dmd", (has: boolean, path: string | undefined) => {
				if (has)
					return done("dmd", path);
				checkCompiler("ldc", (has: boolean, path: string | undefined) => {
					if (has)
						return done("ldc", path);
					checkCompiler("ldc2", (has: boolean, path: string | undefined) => {
						if (has)
							return done("ldc2", path);
						checkCompiler("gdc", (has: boolean, path: string | undefined) => {
							if (has)
								return done("gdc", path);
							else
								return done(false, path);
						});
					});
				});
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
			checkCompilers(gotCompiler);
		}
	}
}
