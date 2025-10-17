import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LanguageClient, LanguageClientOptions, ServerOptions, DocumentFilter, NotificationType, CloseAction, ErrorAction, ErrorHandler, Message, State, MessageType, RevealOutputChannelOn, ErrorHandlerResult, CloseHandlerResult } from "vscode-languageclient/node";
import { installServeD, compileServeD, getInstallOutput, downloadFileInteractive, findLatestServeD, cmpSemver, extractServedBuiltDate, Release, updateAndInstallServeD } from "./installer";
import { EventEmitter } from "events";
import * as ChildProcess from "child_process";

import * as mode from "./dmode";
import * as statusbar from "./statusbar";
import { GCProfiler } from "./gcprofiler";
import { CoverageAnalyzer } from "./coverage";
import { registerCommands, registerClientCommands } from "./commands";
import { DubDependency, DubDependencyInfo } from "./dub-view";

import { CodedAPI, Snippet } from "code-d-api";
import { builtinPlugins } from "./builtin_plugins";
import { CodedAPIServedImpl } from "./api_impl";
import { restoreCreateProjectPackageBackup } from "./project-creator";
import { registerDebuggers, linkDebuggersWithServed } from "./debug";
import { DubTasksProvider } from "./dub-tasks";
import { checkCompilers, DetectedCompiler, makeCompilerInstallButtons, registerCompilerInstaller } from "./compilers";
import { homedir } from "os";

class CustomErrorHandler implements ErrorHandler {
	private restarts: number[];

	constructor(private output: vscode.OutputChannel) {
		this.restarts = [];
	}

	public error(error: Error, message: Message, count: number): ErrorHandlerResult {
		return { action: ErrorAction.Continue };
	}

	public closed(): CloseHandlerResult {
		this.restarts.push(Date.now());
		if (this.restarts.length < 10) {
			return { action: CloseAction.Restart };
		} else {
			let diff = this.restarts[this.restarts.length - 1] - this.restarts[0];
			if (diff <= 60 * 1000) {
				// TODO: run automated diagnostics about current code file here
				this.output.appendLine(`Server crashed 10 times in the last minute. The server will not be restarted.`);
				return { action: CloseAction.DoNotRestart };
			} else {
				this.restarts.shift();
				return { action: CloseAction.Restart };
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

	getDependencies(parent?: DubDependency): Thenable<DubDependency[]> {
		return this.getChildren(parent);
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

	forceLoadProjects(roots: string[]): Thenable<boolean[]> {
		return this.client.sendRequest("served/forceLoadProjects", roots);
	}

	private static taskGroups: vscode.TaskGroup[] = [
		vscode.TaskGroup.Build,
		vscode.TaskGroup.Clean,
		vscode.TaskGroup.Rebuild,
		vscode.TaskGroup.Test,
	];
}

async function startClient(context: vscode.ExtensionContext) {
	let servedPath = expandTilde(config(null).get("servedPath", "serve-d"));
	let args = [
		"--require", "D",
		"--lang", vscode.env.language,
		"--provide", "http",
		"--provide", "implement-snippets",
		"--provide", "context-snippets",
		"--provide", "default-snippets",
		"--provide", "tasks-current",
		"--provide", "async-ask-load",
	];

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
		documentSelector: <DocumentFilter[]>[mode.D_MODE, mode.SDL_MODE, mode.DUB_MODE, mode.DIET_MODE, mode.DML_MODE, mode.DSCANNER_INI_MODE, mode.PROFILEGC_MODE],
		synchronize: {
			configurationSection: ["d", "dfmt", "dscanner", "sdl", "editor", "git"],
			fileEvents: [
				vscode.workspace.createFileSystemWatcher("**/*.d"),
				vscode.workspace.createFileSystemWatcher("**/dub.json"),
				vscode.workspace.createFileSystemWatcher("**/dub.sdl"),
				vscode.workspace.createFileSystemWatcher("**/profilegc.log"),
				vscode.workspace.createFileSystemWatcher("**/compile_commands.json"),
			]
		},
		revealOutputChannelOn: RevealOutputChannelOn.Never,
		outputChannel: outputChannel,
		errorHandler: new CustomErrorHandler(outputChannel),
		markdown: {
			isTrusted: true,
			supportHtml: true
		}
	};
	let client = new LanguageClient("serve-d", "code-d & serve-d", executable, clientOptions);
	await client.start();
	served = new ServeD(client, outputChannel);

	context.subscriptions.push({
		dispose() {
			client.stop();
		}
	});

	registerClientCommands(context, client, served);
	linkDebuggersWithServed(served);

	var updateSetting = new NotificationType<{ section: string, value: any, global: boolean }>("coded/updateSetting");
	client.onNotification(updateSetting, (arg: { section: string, value: any, global: boolean }) => {
		hideNextPotentialConfigUpdateWarning();
		config(null).update(arg.section, arg.value, arg.global);
	});

	var logInstall = new NotificationType<string>("coded/logInstall");
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

	client.onNotification("coded/skippedLoads", async function (roots: string[]) {
		if (typeof(roots) === "object" && !Array.isArray(roots))
			roots = (<any>roots).roots;

		if (typeof(roots) === "string")
			roots = <string[]>[roots];
		else if (!Array.isArray(roots))
			throw new Error("Unexpected roots with coded/skippedLoads: " + JSON.stringify(roots));

		var allowList = config(null).get<string[]>("manyProjectsAllowList") || [];
		var denyList = config(null).get<string[]>("manyProjectsDenyList") || [];
		var decisions = new Array(roots.length);
		let decidedNum = 0;
		for (let i = 0; i < roots.length; i++) {
			const root = roots[i];
			if (allowList.includes(root))
				decisions[i] = true;
			else if (denyList.includes(root))
				decisions[i] = false;
			else
				continue;
			decidedNum++;
		}

		console.log("Asking for late init for projects ", roots, " (allowlist: ", allowList, ", denylist: ", denyList, ")");

		let btnLoadAll = decidedNum > 0
			? "Load Remaining (" + (roots.length - decidedNum) + ")"
			: roots.length == 1
				? "Load"
				: "Load All (" + roots.length + ")";
		let btnSkipAll = decidedNum > 0
			? "Skip Remaining"
			: roots.length == 1
				? "Skip"
				: "Skip All";
		let btnInteractive = "More Options...";
		let msg = "There are too many subprojects in this project according to d.manyProjectsThreshold. Load "
			+ (roots.length == 1 ? "1 extra project?" : roots.length + " extra projects?")
			+ (decidedNum > 0 ? ("\n" + (decidedNum == 1 ? "1 project has" : decidedNum + " projects have")
			+ " been decided on based on d.manyProjects{Allow/Deny}List already.") : "");
		let result = await vscode.window.showInformationMessage(msg,
				btnLoadAll, btnSkipAll, btnInteractive);

		function setRemaining(b: boolean) {
			for (let i = 0; i < decisions.length; i++)
				if (decisions[i] === undefined)
					decisions[i] = b;
		}

		switch (result)
		{
		case btnLoadAll:
			setRemaining(true);
			break;
		case btnInteractive:
			let result = await vscode.window.showQuickPick<vscode.QuickPickItem>(roots.map((r, i) => <vscode.QuickPickItem>{
				_root: r,
				_id: i,
				label: r,
				picked: decisions[i],
			}).concat([
				{
					kind: vscode.QuickPickItemKind.Separator,
					label: "Options",
					alwaysShow: true,
				},
				<any>{
					_id: "remember",
					label: "Remember Selection (workspace settings)",
					alwaysShow: true
				}
			]), {
				canPickMany: true,
				ignoreFocusOut: true,
				title: "Select projects to load"
			});
			
			result?.forEach(r => {
				let root = <string>(<any>r)._root;
				let id = <number>(<any>r)._id;
				if (!root)
					return;

				if (!allowList.includes(root))
					allowList.push(root);
				let denyIndex = denyList.indexOf(root);
				if (denyIndex != -1)
					denyList.splice(denyIndex, 1);

				decisions[id] = true;
			});

			for (let i = 0; i < decisions.length; i++) {
				if (decisions[i] === undefined) {
					let root = roots[i];
					if (!denyList.includes(root))
						denyList.push(root);
					let allowIndex = allowList.indexOf(root);
					if (allowIndex != -1)
						allowList.splice(allowIndex, 1);
					decisions[i] = false;
				}
			}

			let save = (result?.findIndex(r => (<any>r)._id == "remember") ?? -1) >= 0;
			if (save)
			{
				config(null).update("manyProjectsAllowList", allowList, vscode.ConfigurationTarget.Workspace);
				config(null).update("manyProjectsDenyList", denyList, vscode.ConfigurationTarget.Workspace);
			}
			return;
		case btnSkipAll:
		default:
			setRemaining(false);
			break;
		}

		let toLoad = roots.filter((_, i) => decisions[i] === true);
		served.forceLoadProjects(toLoad);
	});

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
			CodedAPIServedImpl.getInstance().started(served);
		}
	});
}

export var currentVersion: string | undefined;
export var extensionContext: vscode.ExtensionContext;
export function activate(context: vscode.ExtensionContext): CodedAPI {
	extensionContext = context;

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

	context.subscriptions.push(createConfigUpdateWatcher());

	context.subscriptions.push(registerCompilerInstaller(context));

	registerCommands(context);

	registerDebuggers(context);

	{
		context.subscriptions.push(vscode.commands.registerCommand("code-d.showGCCalls", GCProfiler.listProfileCache));
	}

	if (vscode.workspace.workspaceFolders) {
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

			vscode.workspace.findFiles("**/*.lst", "").then(files => {
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

	let proxy = vscode.workspace.getConfiguration("http").get("proxy", "");
	if (proxy)
		process.env["http_proxy"] = proxy;

	await restoreCreateProjectPackageBackup(context);

	let presentCompiler: DetectedCompiler | undefined;
	if (context.globalState.get<number>("checkedCompiler", 0) != 2) {
		console.log("Checking if compiler is present");
		presentCompiler = await checkCompilers();
		context.globalState.update("checkedCompiler", 2);
		let setupDCompiler = "Change D Compiler";
		let gettingStarted = "Getting Started";
		if (presentCompiler && presentCompiler.has) {
			let compilerSpec = presentCompiler.has;
			if (presentCompiler.version)
				compilerSpec += " " + presentCompiler.version;
			let [_, checked] = makeCompilerInstallButtons(presentCompiler);
			for (let i = 0; i < checked.length; i++) {
				let action = checked[i].action;
				if (action !== undefined)
					action();
			}
			vscode.window.showInformationMessage("code-d has auto-detected " + compilerSpec + " and preconfigured it. "
				+ "If you would like to use another compiler, please click the button below.",
				setupDCompiler, gettingStarted)
				.then(btn => {
					if (btn == setupDCompiler) {
						vscode.commands.executeCommand("code-d.setupCompiler");
					} else if (btn == gettingStarted) {
						vscode.commands.executeCommand("workbench.action.openWalkthrough", "webfreak.code-d#welcome");
					}
				});
		} else {
			gettingStarted = "First time setup";
			vscode.window.showWarningMessage(
				"code-d has not detected any compatible D compiler. Please click the button below to install and configure "
				+ "a D compiler on your system or just for code-d. Auto completion will not contain any standard "
				+ "library symbols and building projects will not work until then.",
				gettingStarted)
				.then(btn => {
					if (btn == gettingStarted) {
						vscode.commands.executeCommand("workbench.action.openWalkthrough", "webfreak.code-d#welcome");
					}
				});
		}
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

		if (updateSetting) {
			hideNextPotentialConfigUpdateWarning();
			await config(null).update("dubPath", path);
		}
		return true;
	}

	async function checkProgram(
		forced: boolean,
		configName: string,
		defaultPath: string,
		name: string,
		installFunc: (env: NodeJS.ProcessEnv) => Thenable<boolean | undefined | "retry">,
		btn: string,
		outdatedCheck?: (log: string) => (boolean | [boolean, string])
	): Promise<boolean | undefined | "retry"> {
		var version = "";

		try {
			version = await spawnOneShotCheck(expandTilde(config(null).get(configName, defaultPath)), ["--version"], true, { cwd: vscode.workspace.rootPath });
		} catch (err: any) {
			// for example invalid executable error
			if (err && err.code != "ENOENT")
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
				if (config(null).get("aggressiveUpdate", true) && !forced) {
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

	function isServedOutdated(current: Release | undefined): (log: string) => (false | [boolean, string]) {
		return (log: string) => {
			if (config(null).get("forceUpdateServeD", false))
				return [true, "(forced by d.forceUpdateServeD)"];
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
				} catch (e: any) {
					getInstallOutput().show(true);
					getInstallOutput().appendLine("ERROR: could not compare current serve-d version with release");
					getInstallOutput().appendLine(e.toString());
				}
			}
			return false;
		};
	}

	if (isLegacyBeta && servedReleaseChannel && !servedReleaseChannel.globalValue) {
		hideNextPotentialConfigUpdateWarning();
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
					hideNextPotentialConfigUpdateWarning();
					let done = config(null).update("servedReleaseChannel", "stable", vscode.ConfigurationTarget.Global);
					didChangeReleaseChannel(done);
				} else if (item == beta) {
					hideNextPotentialConfigUpdateWarning();
					let done = config(null).update("servedReleaseChannel", "beta", vscode.ConfigurationTarget.Global);
					didChangeReleaseChannel(done);
				}
			});
	}

	let firstTimeUser = true; // force release lookup before first install
	let force = false;
	const currentCodedServedIteration = 1; // bump on new code-d releases that want new serve-d
	if (context.globalState.get("serve-d-downloaded-release-channel"))
		firstTimeUser = false;
	if (context.globalState.get<number>("serve-d-wanted-download-iteration", 0) != currentCodedServedIteration)
		force = true;

	let version = await findLatestServeD(firstTimeUser || force, channelString);
	async function doUpdate(): Promise<boolean> {
		let origUpdateFun = version ? (version.asset
			? installServeD([{ url: version.asset.browser_download_url, title: "Serve-D" }], version.name)
			: compileServeD((version && version.name != "nightly") ? version.name : undefined))
			: updateAndInstallServeD;
		let updateFun = origUpdateFun;

		updateFun = async function(env: NodeJS.ProcessEnv): Promise<boolean | undefined | "retry"> {
			let [isBlocked, lock] = await acquireInstallLock("serve-d", context);
			try {
				context.subscriptions.push(lock);
				if (isBlocked) {
					return await waitForOtherInstanceInstall("serve-d", context, force)
						.then((doUpdate) => doUpdate ? origUpdateFun(env) : "retry");
				}
				return await origUpdateFun(env);
			}
			finally {
				let i = context.subscriptions.indexOf(lock);
				context.subscriptions.splice(i, 1);
				lock.dispose();
			}
		};

		let upToDate = await checkProgram(force, "servedPath", "serve-d", "serve-d",
			updateFun,
			version ? (version.asset ? "Download" : "Compile") : "Install", isServedOutdated(version));
		if (upToDate === undefined)
			return false; /* user dismissed install dialogs, don't continue startup */
		else if (upToDate === "retry")
			return doUpdate();

		return true;
	}

	if (!await doUpdate())
		return;

	await context.globalState.update("serve-d-downloaded-release-channel", channelString);
	await context.globalState.update("serve-d-wanted-download-iteration", currentCodedServedIteration);

	if (outdated) {
		if (!reloading) {
			reloading = true;
			// just to be absolutely sure all settings have been written
			setTimeout(() => {
				vscode.commands.executeCommand("workbench.action.reloadWindow");
			}, 500);
		}
	} else {
		await startClient(context);
		started = true;
	}
}

function lockIsStillAcquired(lock: any): boolean {
	return lock && isFinite(parseInt(lock)) && new Date().getTime() - parseInt(lock) < 10000;
}

async function acquireInstallLock(depName: string, context: vscode.ExtensionContext): Promise<[boolean, vscode.Disposable]> {
	const installInProgress = "installInProgress-" + depName;
	let existingLock = context.globalState.get(installInProgress, undefined);
	if (lockIsStillAcquired(existingLock)) {
		return [false, new vscode.Disposable(() => {})];
	} else {
		context.globalState.update(installInProgress, new Date().getTime());
		let timer = setInterval(function() {
			context.globalState.update(installInProgress, new Date().getTime());
		}, 2000);
		return [true, new vscode.Disposable(() => {
			clearInterval(timer);
			context.globalState.update(installInProgress, false);
		})];
	}
}

async function waitForOtherInstanceInstall(depName: string, context: vscode.ExtensionContext, forced: boolean, showProgress: boolean = true): Promise<boolean> {
	// XXX: horrible polling code here because there is no other IPC API for vscode extensions
	const installInProgress = "installInProgress-" + depName;
	var lock = context.globalState.get(installInProgress, undefined);
	if (lockIsStillAcquired(lock)) {
		if (forced) {
			let ret = new Promise<boolean>((resolve) => {
				setTimeout(function() {
					resolve(waitForOtherInstanceInstall(depName, context, true, false));
				}, 1000);
			});

			if (showProgress)
				return vscode.window.withProgress<boolean>({
					location: vscode.ProgressLocation.Window,
					title: "Waiting for other VSCode window installing " + depName + "..."
				}, (progress, token) => ret);
			else
				return ret;
		} else {
			let continueAnyway = "Continue Anyway";
			let wait = "Wait";
			let btn = await vscode.window.showWarningMessage("It looks like there is another vscode instance already installing "
				+ depName + ". Click '" + continueAnyway + "' if you are sure there is no other vscode instance installing "
				+ depName + " right now.",
				continueAnyway,
				wait);
			if (!btn || btn == wait) {
				return waitForOtherInstanceInstall(depName, context, true);
			} else if (btn == continueAnyway) {
				return true;
			} else {
				throw new Error("unexpected button");
			}
		}
	}
	return false;
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

		vscode.commands.executeCommand("workbench.action.openWalkthrough", "webfreak.code-d#welcome");
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

function getOwnerWorkspace(p: string): vscode.WorkspaceFolder | null {
	if (p.endsWith("serve-d-dummy-workspace"))
		return null;
	let best: vscode.WorkspaceFolder | null = null;
	if (vscode.workspace.workspaceFolders)
		vscode.workspace.workspaceFolders.forEach(element => {
			const dir = element.uri.fsPath;
			if (dir.length >= (best?.uri?.fsPath?.length ?? 0) && dir.startsWith(p)) {
				best = element;
			}
		});
	return best;
}

/**
 * Watches for config updates that need a vscode window reload to be effective
 * and shows a hint to the user in these cases.
 */
function createConfigUpdateWatcher(): vscode.Disposable {
	return vscode.workspace.onDidChangeConfiguration((e) => {
		const needReloadSettings = [
			"d.servedPath",
			"d.servedReleaseChannel",
			"d.dcdServerPath",
			"d.dcdClientPath",
			"d.scanAllFolders",
			"d.neverUseDub",
			"d.disabledRootGlobs",
			"d.extraRoots",
		];

		if (lastConfigUpdateWasInternal && new Date().getTime() - lastConfigUpdateWasInternal < 1000)
			return; // ignore config updates that come from code-d or serve-d

		var changed: string | null = null;
		needReloadSettings.forEach(setting => {
			if (!changed && e.affectsConfiguration(setting))
				changed = setting;
		});

		let reloadBtn = "Reload VSCode";
		let ignoreBtn = "Ignore";

		if (changed)
			vscode.window.showInformationMessage("You have changed code-d's `"
				+ changed + "` setting. To apply the new value, you need to reload VSCode.",
				reloadBtn, ignoreBtn)
				.then(btn => {
					if (btn == reloadBtn)
						vscode.commands.executeCommand("workbench.action.reloadWindow");
				});
	});
}

var lastConfigUpdateWasInternal: number | null;
export function hideNextPotentialConfigUpdateWarning() {
	lastConfigUpdateWasInternal = new Date().getTime();
}

function expandTilde(filepath: string): string {
	var home = homedir();

	if (filepath.charCodeAt(0) === 126 /* ~ */) {
		if (filepath.charCodeAt(1) === 43 /* + */) {
		return path.join(process.cwd(), filepath.slice(2));
		}
		return home ? path.join(home, filepath.slice(1)) : filepath;
	}

	return filepath;
};
