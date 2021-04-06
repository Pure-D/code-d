import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LanguageClient, LanguageClientOptions, ServerOptions, DocumentFilter, NotificationType, CloseAction, ErrorAction, ErrorHandler, Message, State, MessageType, RevealOutputChannelOn } from "vscode-languageclient";
import { setContext, installServeD, compileServeD, getInstallOutput, downloadFileInteractive, findLatestServeD, cmpSemver, extractServedBuiltDate, Release, updateAndInstallServeD } from "./installer";
import { EventEmitter } from "events";
import * as ChildProcess from "child_process";
import * as which from "which";
import { TestHub, testExplorerExtensionId, TestController, TestAdapter } from 'vscode-test-adapter-api';

import * as mode from "./dmode";
import * as statusbar from "./statusbar";
import { addSDLProviders } from "./sdl/sdl-contributions";
import { addJSONProviders } from "./json-contributions";
import { GCProfiler } from "./gcprofiler";
import { CoverageAnalyzer } from "./coverage";
import { registerCommands, registerClientCommands } from "./commands";
import { DubDependency, DubDependencyInfo } from "./dub-view";

import expandTilde = require("expand-tilde");
import { CodedAPI, Snippet } from "code-d-api";
import { builtinPlugins } from "./builtin_plugins";
import { CodedAPIServedImpl } from "./api_impl";
import { restoreCreateProjectPackageBackup } from "./project-creator";
import { TestAdapterGenerator, UnittestProject } from "./testprovider";
import { registerDebuggers, linkDebuggersWithServed } from "./debug";
import { DubTasksProvider } from "./dub-tasks";

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

export type DScannerIniFeature = { description: string, name: string, enabled: "disabled" | "enabled" | "skip-unittest" };
export type DScannerIniSection = { description: string, name: string, features: DScannerIniFeature[] };
export interface ActiveDubConfig {
	packagePath: string;
	packageName: string;
	recipePath: string;
	targetPath: string;
	targetName: string;
	workingDirectory: string;
	mainSourceFile: string;

	dflags: string[];
	lflags: string[];
	libs: string[];
	linkerFiles: string[];
	sourceFiles: string[];
	copyFiles: string[];
	versions: string[];
	debugVersions: string[];
	importPaths: string[];
	stringImportPaths: string[];
	importFiles: string[];
	stringImportFiles: string[];
	preGenerateCommands: string[];
	postGenerateCommands: string[];
	preBuildCommands: string[];
	postBuildCommands: string[];
	preRunCommands: string[];
	postRunCommands: string[];
	buildOptions: string[];
	buildRequirements: string[];
	[unstableExtras: string]: any
};

export class ServeD extends EventEmitter implements vscode.TreeDataProvider<DubDependency> {
	constructor(public client: LanguageClient, public outputChannel: vscode.OutputChannel) {
		super();
	}

	private _onDidChangeTreeData: vscode.EventEmitter<DubDependency | undefined> = new vscode.EventEmitter<DubDependency | undefined>();
	readonly onDidChangeTreeData: vscode.Event<DubDependency | undefined> = this._onDidChangeTreeData.event;

	public tasksProvider?: DubTasksProvider;

	refreshDependencies(): void {
		this._onDidChangeTreeData.fire(undefined);
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
		this.client.sendNotification("served/doDscanner", {
			textDocument: {
				uri: uri.toString()
			}
		});
	}

	listDScannerConfig(uri?: vscode.Uri): Thenable<DScannerIniSection[]> {
		return this.client.sendRequest("served/getDscannerConfig", uri ? {
			textDocument: {
				uri: uri.toString()
			}
		} : {});
	}

	findFiles(query: string): Thenable<string[]> {
		return this.client.sendRequest("served/searchFile", query);
	}

	findFilesByModule(query: string): Thenable<string[]> {
		return this.client.sendRequest("served/findFilesByModule", query);
	}

	addDependencySnippet(params: { requiredDependencies: string[], snippet: Snippet }): Thenable<boolean> {
		return this.client.sendRequest("served/addDependencySnippet", params);
	}

	getActiveDubConfig(): Thenable<ActiveDubConfig> {
		return this.client.sendRequest("served/getActiveDubConfig");
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

	// for integration with test explorer
	const testExplorerExtension = vscode.extensions.getExtension<TestHub>(testExplorerExtensionId);
	if (testExplorerExtension)
		args.push("--provide", "test-runner");

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
			fileEvents: [
				vscode.workspace.createFileSystemWatcher("**/*.d"),
				vscode.workspace.createFileSystemWatcher("**/dub.json"),
				vscode.workspace.createFileSystemWatcher("**/dub.sdl")
			]
		},
		revealOutputChannelOn: RevealOutputChannelOn.Never,
		outputChannel: outputChannel,
		errorHandler: new CustomErrorHandler(outputChannel)
	};
	let client = new LanguageClient("serve-d", "code-d & serve-d", executable, clientOptions);
	client.start();
	served = new ServeD(client, outputChannel);

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

		if (testExplorerExtension) {
			const testHub = testExplorerExtension.exports;

			const generator = new TestAdapterGenerator(served, testHub);
			context.subscriptions.push(generator);
			client.onNotification("coded/pushProjectTests", function (tests: UnittestProject) {
				generator.updateTests(tests);
			});
		}

		const startupProgress = new statusbar.StartupProgress();
		client.onNotification("window/logMessage", function (info: { type: MessageType, message: string }) {
			if (info.type == MessageType.Log && info.message.startsWith("[progress]")) {
				let m = /^\[progress\] \[(\d+\.\d+)\] \[(\w+)\](?:\s*(\d+)?\s*(?:\/\s*(\d+))?:\s)?(.*)/.exec(info.message);
				if (!m) return;
				const time = parseFloat(m[1]);
				const type = m[2];
				const step = m[3] ? parseInt(m[3]) : undefined;
				const max = m[4] ? parseInt(m[4]) : undefined;
				const args = m[5] || undefined;

				if (type == "configLoad") {
					startupProgress.startGlobal();
					const p = vscode.Uri.parse(args || "").fsPath;
					startupProgress.setWorkspace(shortenPath(p));
				}
				else if (type == "configFinish") {
					startupProgress.finishGlobal();
				}
				else if (type == "workspaceStartup" && step !== undefined && max) {
					startupProgress.workspaceStep(step * 0.5, max, "updating");
				}
				else if (type == "completionStartup" && step !== undefined && max) {
					startupProgress.workspaceStep(step * 0.5 + max * 0.5, max, "indexing");
				}
				else if ((type == "dubReload" || type == "importReload" || type == "importUpgrades") && step !== undefined && max) {
					if (step == max)
						startupProgress.finishGlobal();
					else {
						startupProgress.startGlobal();
						const p = vscode.Uri.parse(args || "").fsPath;
						let label: string;
						switch (type) {
							case "dubReload":
								label = "updating";
								break;
							case "importReload":
								label = "indexing";
								break;
							case "importUpgrades":
								label = "downloading dependencies";
								break;
							default:
								label = "loading";
								break;
						}
						startupProgress.globalStep(step, max, shortenPath(p), label)
					}
				}

				// console.log("progress:", time, type, step, max, args);
			}
		});

		client.onRequest<boolean, { url: string, title?: string, output: string }>("coded/interactiveDownload", function (e, token): Thenable<boolean> {
			return new Promise((resolve, reject) => {
				let aborted = false;
				downloadFileInteractive(e.url, e.title || "Dependency Download", () => {
					aborted = true;
					resolve(false);
				}).then(stream => stream.pipe(fs.createWriteStream(e.output)).on("finish", () => {
					if (!aborted)
						resolve(true);
				}));
			});
		});

		// this code is run on every restart too
		CodedAPIServedImpl.getInstance().started(served);
		client.onDidChangeState((event) => {
			if (event.newState == State.Starting) {
				client.onReady().then(() => {
					CodedAPIServedImpl.getInstance().started(served);
				});
			}
		});
	});

	registerClientCommands(context, client, served);
	linkDebuggersWithServed(served);
}

export var currentVersion: string | undefined;

export function activate(context: vscode.ExtensionContext): CodedAPI {
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

	fs.readFile(context.asAbsolutePath("package.json"), (err, data) => {
		if (err) {
			console.error("Failed reading current code-d version from package manifest: ", err);
			return;
		}
		currentVersion = JSON.parse(data.toString()).version;

		greetNewUsers(context);
	});

	preStartup(context);

	context.subscriptions.push(addSDLProviders());
	context.subscriptions.push(addJSONProviders());

	registerCommands(context);

	registerDebuggers(context);

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

	const instance = CodedAPIServedImpl.getInstance();
	builtinPlugins(instance);
	return instance;
}

export function config(resource: vscode.Uri | null): vscode.WorkspaceConfiguration {
	return vscode.workspace.getConfiguration("d", resource);
}

async function preStartup(context: vscode.ExtensionContext) {
	const userConfig = "Open User Settings";

	setContext(context);
	let proxy = vscode.workspace.getConfiguration("http").get("proxy", "");
	if (proxy)
		process.env["http_proxy"] = proxy;

	await restoreCreateProjectPackageBackup(context);

	let presentCompiler: { has: string | false, path?: string } | undefined;
	if (!context.globalState.get("checkedCompiler", false)) {
		console.log("Checking if compiler is present");
		presentCompiler = await checkCompilers();
		context.globalState.update("checkedCompiler", true);
		if (!presentCompiler.has)
			vscode.env.openExternal(vscode.Uri.parse("https://dlang.org/download.html")).then(() => {
				vscode.window.showInformationMessage("Please install a D compiler from dlang.org and reload the window once done.");
			});
	}

	async function checkDub(dubPath: string | undefined, updateSetting: boolean = false): Promise<boolean> {
		let tryCompiler = !!dubPath;
		if (!dubPath)
			dubPath = <string>expandTilde(config(null).get("dubPath", "dub"));

		try {
			await spawnOneShotCheck(dubPath, ["--version"], false, { cwd: vscode.workspace.rootPath });
		} catch (e) {
			// for example invalid executable error
			if (!tryCompiler)
				return false;

			if (!presentCompiler)
				presentCompiler = await checkCompilers();

			if (!presentCompiler.has || !presentCompiler.path)
				return false;
			else {
				let ext = process.platform == "win32" ? ".exe" : "";
				return await checkDub(path.join(path.dirname(presentCompiler.path), "dub" + ext), true);
			}
		}

		if (updateSetting)
			await config(null).update("dubPath", path);
		return true;
	}

	async function checkProgram(configName: string, defaultPath: string, name: string, installFunc: (env: NodeJS.ProcessEnv) => Thenable<boolean | undefined>, btn: string, outdatedCheck?: (log: string) => (boolean | [boolean, string])): Promise<boolean | undefined> {
		var version = "";

		try {
			version = await spawnOneShotCheck(expandTilde(config(null).get(configName, defaultPath)), ["--version"], true, { cwd: vscode.workspace.rootPath });
		} catch (err) {
			// for example invalid executable error
			console.error(err);
			const fullConfigName = "d." + configName;
			if (btn == "Install" || btn == "Download") btn = "Reinstall";
			const reinstallBtn = btn + " " + name;
			const userSettingsBtn = "Open User Settings";

			let defaultHandler = (s: string | undefined) => {
				if (s == userSettingsBtn)
					vscode.commands.executeCommand("workbench.action.openGlobalSettings");
				else if (s == reinstallBtn)
					return installFunc(process.env);
				return Promise.resolve(undefined);
			};

			if (err && err.code == "ENOENT") {
				if (config(null).get("aggressiveUpdate", true)) {
					return installFunc(process.env);
				}
				else {
					var isDirectory = false;
					try {
						var testPath = config(null).get(configName, "");
						isDirectory = path.isAbsolute(testPath) && fs.statSync(testPath).isDirectory();
					} catch (e) { }
					if (isDirectory) {
						return await vscode.window.showErrorMessage(name + " from setting " + fullConfigName + " points to a directory", reinstallBtn, userSettingsBtn).then(defaultHandler);
					} else {
						return await vscode.window.showErrorMessage(name + " from setting " + fullConfigName + " is not installed or couldn't be found", reinstallBtn, userSettingsBtn).then(defaultHandler);
					}
				}
			} else if (err && err.code == "EACCES") {
				return await vscode.window.showErrorMessage(name + " from setting " + fullConfigName + " is not marked as executable or is in a non-executable directory.", reinstallBtn, userSettingsBtn).then(defaultHandler);
			} else if (err && err.code) {
				return await vscode.window.showErrorMessage(name + " from setting " + fullConfigName + " failed executing: " + err.code, reinstallBtn, userSettingsBtn).then(defaultHandler);
			} else if (err) {
				return await vscode.window.showErrorMessage(name + " from setting " + fullConfigName + " failed executing: " + err, reinstallBtn, userSettingsBtn).then(defaultHandler);
			}
			return false;
		}

		let outdatedResult = outdatedCheck && outdatedCheck(version);
		let isOutdated: boolean = false;
		let msg: string | undefined;
		if (typeof outdatedResult == "boolean")
			isOutdated = outdatedResult;
		else if (Array.isArray(outdatedResult))
			[isOutdated, msg] = outdatedResult;

		if (isOutdated) {
			if (config(null).get("aggressiveUpdate", true)) {
				return await installFunc(process.env);
			}
			else {
				let s = await vscode.window.showErrorMessage(name + " is outdated. " + (msg || ""), btn + " " + name, "Continue Anyway");
				if (s == "Continue Anyway")
					return false;
				else if (s == btn + " " + name)
					return await installFunc(process.env);
				return undefined;
			}
		}
		return false;
	}

	// disable dub checks for now because precompiled dub binaries on windows are broken
	if (!await checkDub(undefined)) {
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

				return [installed < date, `(target from ${date.toDateString()}, installed ${installed.toDateString()})`];
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

	let version = await findLatestServeD(force, channelString);
	let upToDate = await checkProgram("servedPath", "serve-d", "serve-d",
		version ? (version.asset
			? installServeD([{ url: version.asset.browser_download_url, title: "Serve-D" }], version.name)
			: compileServeD((version && version.name != "nightly") ? version.name : undefined))
			: updateAndInstallServeD,
		version ? (version.asset ? "Download" : "Compile") : "Install", isServedOutdated(version));
	if (upToDate === undefined)
		return; /* user dismissed install dialogs, don't continue startup */

	await context.globalState.update("serve-d-downloaded-release-channel", channelString);

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
}

async function checkCompiler(compiler: string): Promise<{ has: boolean, path?: string }> {
	let compilerPath: string;
	try {
		compilerPath = await which(compiler);
	} catch (e) {
		return { has: false };
	}

	if (!compilerPath)
		return { has: false };

	let proc: ChildProcess.ChildProcessWithoutNullStreams;
	try {
		proc = ChildProcess.spawn(compilerPath, ["--version"]);
	} catch (err) {
		return { has: false, path: compilerPath };
	}

	return await new Promise((resolve) => {
		proc.on("error", function () {
			resolve({ has: false, path: compilerPath });
		}).on("exit", function () {
			resolve({ has: true, path: compilerPath });
		});
	});
}

async function checkCompilers(): Promise<{ has: string | false, path?: string }> {
	const compilers = ["dmd", "ldc", "ldc2", "gdc"];
	let fallbackPath: string | undefined = undefined;
	for (let i = 0; i < compilers.length; i++) {
		const check = compilers[i];
		let result = await checkCompiler(check);
		fallbackPath = fallbackPath || result.path;
		if (result && result.has)
			return { has: check, path: result.path };
	}
	return { has: false, path: fallbackPath };
}

function spawnOneShotCheck(program: string, args: string[], captureOutput: boolean = false, options: any = undefined): Promise<string> {
	let proc: ChildProcess.ChildProcessWithoutNullStreams;
	try {
		proc = ChildProcess.spawn(program, args, options);
	} catch (err) {
		return Promise.reject(err);
	}

	let result = "";
	if (captureOutput) {
		if (proc.stderr)
			proc.stderr.on("data", (chunk) => result += chunk);
		if (proc.stdout)
			proc.stdout.on("data", (chunk) => result += chunk);
	}

	return new Promise((resolve, reject) => {
		let returned = false;
		proc.on("error", function (e) {
			if (returned) return;
			returned = true;
			reject(e);
		}).on("exit", function () {
			if (returned) return;
			returned = true;
			resolve(result);
		});
	});
}

function greetNewUsers(context: vscode.ExtensionContext) {
	if (!context.globalState.get("greetedNewCodeDUser", false)) {
		context.globalState.update("greetedNewCodeDUser", true);
		context.globalState.update("lastCheckedCodedVersion", currentVersion);

		vscode.commands.executeCommand("code-d.viewUserGuide");
	} else if (currentVersion) {
		let oldVersion = context.globalState.get("lastCheckedCodedVersion", "");
		if (oldVersion != currentVersion) {
			context.globalState.update("lastCheckedCodedVersion", currentVersion);

			if (config(null).get("showUpdateChangelogs", true)) {
				vscode.commands.executeCommand("markdown.showPreview", vscode.Uri.file(context.asAbsolutePath("CHANGELOG.md")), { locked: true });
				let disableChangelog = "Never show changelog";
				let close = "Close";
				vscode.window.showInformationMessage("Welcome to code-d " + currentVersion + "! See what has changed since " + (oldVersion || "last version") + "...", disableChangelog, close).then(action => {
					if (action == disableChangelog) {
						config(null).update("showUpdateChangelogs", false, vscode.ConfigurationTarget.Global);
					}
				});
			}
		}
	}
}

function shortenPath(p: string) {
	let short: string = p;
	if (short.endsWith("serve-d-dummy-workspace"))
		return "[dummy workspace]";
	if (vscode.workspace.workspaceFolders)
		vscode.workspace.workspaceFolders.forEach(element => {
			const dir = element.uri.fsPath;
			if (dir.startsWith(p)) {
				short = path.relative(path.dirname(dir), p);
			}
		});
	return short;
}
