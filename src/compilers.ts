import * as vscode from 'vscode';
import * as which from "which";
import * as fs from "fs";
import * as path from "path";
import * as ChildProcess from "child_process";
import { config } from './extension';
import { determineOutputFolder, downloadFileInteractive } from './installer';

export interface DetectedCompiler {
	/** 
	 * `false` if not a valid executable compiler, set to the compiler name
	 * (dmd, ldc or gdc) otherwise.
	 */
	has: "dmd" | "ldc" | "gdc" | false;
	version?: string;
	frontendVersion?: string;
	path?: string;
	inPath?: boolean;
	importPaths?: string[];
};

let codedContext: vscode.ExtensionContext;
export function registerCompilerInstaller(context: vscode.ExtensionContext): vscode.Disposable {
	codedContext = context;
	return vscode.commands.registerCommand("code-d.setupCompiler", (args) => {
		setupCompilersUI();
	});
}

type UIQuickPickItem = vscode.QuickPickItem & { kind?: number, installInfo?: any, action?: Function };
export async function setupCompilersUI() {
	const introQuickPick = vscode.window.createQuickPick();
	introQuickPick.title = "Setup auto-detected compiler or manually configure compiler";
	const compilers: DetectedCompiler[] = await listCompilers();
	let items: UIQuickPickItem[] = [];
	for (let i = 0; i < compilers.length; i++) {
		if (i == 0) {
			items.push({
				label: "$(find-expanded) Detected installations",
				kind: 2, // proposed type for separators: https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.quickPickSeparators.d.ts
			});
		}

		const compiler = compilers[i];
		if (compiler.has && compiler.path) {
			let versionStrings: string[] = [];
			if (compiler.version) {
				if (compiler.has == "gdc")
					versionStrings.push("gcc " + compiler.version);
				else
					versionStrings.push(compiler.version);
			}
			if (compiler.frontendVersion && compiler.frontendVersion != compiler.version)
				versionStrings.push("spec version " + compiler.frontendVersion);
			items.push({
				label: compiler.has,
				description: versionStrings.length > 0 ? versionStrings.join(" ・ ") : undefined,
				installInfo: compiler
			});
		}
	}
	items.push({
		label: "$(find-expanded) Manual configuration",
		kind: 2,
	});
	let manualSelect: vscode.QuickPickItem;
	let dmdItem: vscode.QuickPickItem;
	let ldcItem: vscode.QuickPickItem;
	let gdcItem: vscode.QuickPickItem;
	items.push(dmdItem = {
		label: "DMD",
		description: "The reference D compiler ・ latest features, fast compilation"
	});
	if (compilers.length == 0)
		dmdItem.detail = "$(getting-started-beginner) Recommended for beginners";
	items.push(ldcItem = {
		label: "LDC",
		description: "LLVM-based D compiler ・ recent features, great optimization"
	});
	items.push(gdcItem = {
		label: "GDC",
		description: "GCC-based D compiler ・ stable, great optimization"
	});
	items.push(manualSelect = {
		label: "Select installation folder",
		description: "if you have already installed a D compiler that is not being picked up"
	});
	introQuickPick.items = items;
	introQuickPick.show();

	introQuickPick.onDidAccept((e) => {
		let selection = <UIQuickPickItem>introQuickPick.selectedItems[0];
		if (selection.kind === 2)
			return;

		introQuickPick.hide();
		if (selection.installInfo) {
			showDetectedCompilerInstallPrompt(selection.installInfo);
		} else {
			switch (selection) {
				case dmdItem:
					showCompilerInstallationPrompt("DMD", [
						{ label: "See releases", website: "https://dlang.org/download.html#dmd" },
						{ platform: "win32", label: "Run installer", downloadAndRun: "https://s3.us-west-2.amazonaws.com/downloads.dlang.org/releases/2021/dmd-2.098.0.exe" },
						{ label: "Portable install", installSh: "install dmd,dub", binTest: "bash" },
						{ platform: "linux", label: "System install", command: "pacman -S dlang-dmd", binTest: "pacman" },
						{ platform: "linux", label: "System install", command: "layman -a dlang", binTest: "layman" },
						{ platform: "darwin", label: "System install", command: "brew install dmd", binTest: "brew" },
						{ platform: "linux", label: "System install", command: "nix-env -iA nixpkgs.dmd", binTest: "nix-env" },
						{ platform: "linux", label: "System install", command: "zypper install dmd", binTest: "zypper" },
					]);
					break;
				case ldcItem:
					showCompilerInstallationPrompt("LDC", [
						{ label: "See releases", website: "https://github.com/ldc-developers/ldc/releases" },
						{ platform: "win32", label: "Run installer", downloadAndRun: "https://github.com/ldc-developers/ldc/releases/download/v1.28.0/ldc2-1.28.0-windows-multilib.exe" },
						{ label: "Portable install", installSh: "install ldc,dub", binTest: "bash" },
						{ label: "System install", command: "brew install ldc", binTest: "brew" },
						{ platform: "linux", label: "System install", command: "apk add ldc", binTest: "apk" },
						{ platform: "linux", label: "System install", command: "pacman -S dlang-ldc", binTest: "pacman" },
						{ platform: "win32", label: "System install", command: "choco install ldc", binTest: "choco" },
						{ platform: "linux", label: "System install", command: "apt install ldc", binTest: "apt" },
						{ platform: "linux", label: "System install", command: "dnf install ldc", binTest: "dnf" },
						{ platform: "freebsd", label: "System install", command: "pkg install ldc", binTest: "pkg" },
						{ platform: "linux", label: "System install", command: "layman -a ldc", binTest: "layman" },
						{ platform: "darwin", label: "System install", command: "brew install ldc", binTest: "brew" },
						{ platform: "linux", label: "System install", command: "nix-env -i ldc", binTest: "nix-env" },
					]);
					break;
				case gdcItem:
					showCompilerInstallationPrompt("GDC", [
						{ label: "View Project website", website: "https://gdcproject.org/downloads" },
						{ platform: "win32", label: "Install through WinLibs", website: "https://winlibs.com" },
						{ platform: "linux", label: "Portable install", installSh: "install gdc,dub" },
						{ platform: "linux", label: "System install", command: "pacman -S gcc-d", binTest: "pacman" },
						{ platform: "linux", label: "System install", command: "apt install gdc", binTest: "apt" },
					]);
					break;
				case manualSelect:
					break;
				default:
					console.error("invalid selection");
					introQuickPick.show();
					break;
			}
		}
	});
}

type LabelWebsiteButton = { label: string, platform?: NodeJS.Platform | Function, binTest?: string, website: string };
type LabelDownloadButton = { label: string, platform?: NodeJS.Platform | Function, binTest?: string, downloadAndRun: string };
type LabelCommandButton = { label: string, platform?: NodeJS.Platform | Function, binTest?: string, command: string };
type LabelInstallShButton = { label: string, platform?: NodeJS.Platform | Function, binTest?: string, installSh: string };

type InstallButtonType = LabelWebsiteButton | LabelDownloadButton | LabelCommandButton | LabelInstallShButton;
type InstallQuickPickItem = vscode.QuickPickItem & { button: InstallButtonType };

async function showCompilerInstallationPrompt(name: string, buttons: InstallButtonType[]) {
	const installPrompt = vscode.window.createQuickPick();
	installPrompt.title = "Install " + name + " compiler";
	let items: InstallQuickPickItem[] = [];
	for (let i = 0; i < buttons.length; i++) {
		const button = buttons[i];
		if (button.platform) {
			if (typeof button.platform == "function") {
				if (!button.platform())
					continue;
			} else if (process.platform != button.platform) {
				continue;
			}
		}
		if (button.binTest && !await testBinExists(button.binTest))
			continue;
		let detail: string | undefined;
		if ((<LabelWebsiteButton>button).website) {
			detail = "$(ports-open-browser-icon) " + (<LabelWebsiteButton>button).website;
		} else if ((<LabelDownloadButton>button).downloadAndRun) {
			detail = "$(cloud-download) " + (<LabelDownloadButton>button).downloadAndRun;
		} else if ((<LabelCommandButton>button).command) {
			detail = "$(terminal) " + (<LabelCommandButton>button).command;
		} else if ((<LabelInstallShButton>button).installSh) {
			detail = "$(terminal) install.sh " + (<LabelInstallShButton>button).installSh;
		}

		items.push({
			label: button.label,
			description: detail,
			button: button
		});
	}
	installPrompt.items = items;
	installPrompt.buttons = [vscode.QuickInputButtons.Back];
	installPrompt.show();

	installPrompt.onDidAccept(async (e) => {
		function runTerminal(shell: string) {
			let terminal = vscode.window.createTerminal("code-d compiler installation");
			terminal.show();
			terminal.sendText(shell, true);
		}

		let selection = (<InstallQuickPickItem>installPrompt.selectedItems[0])?.button;
		installPrompt.hide();
		if (selection) {
			if ((<LabelWebsiteButton>selection).website) {
				vscode.env.openExternal(vscode.Uri.parse((<LabelWebsiteButton>selection).website));
			} else if ((<LabelDownloadButton>selection).downloadAndRun) {
				let link = (<LabelDownloadButton>selection).downloadAndRun;
				let aborted = false;
				let outputFolder = determineOutputFolder();
				let fileLocation = link.lastIndexOf('/');
				let dstFile = path.join(outputFolder, fileLocation == -1 ? "compiler_dl.exe" : link.substr(fileLocation + 1));
				console.log("Downloading " + link + " to " + dstFile);
				downloadFileInteractive(link, "Downloading Compiler installer", () => {
					aborted = true;
				}).then(stream => stream.pipe(fs.createWriteStream(dstFile)).on("finish", () => {
					if (!aborted) {
						// note: if not using an information prompt, add a timeout so on windows it doesn't fail with EBUSY here
						let installBtn = "Run Installer";
						vscode.window.showInformationMessage("Executable is ready for install!", installBtn).then(btn => {
							if (btn == installBtn) {
								try {
									let spawnProc = dstFile;
									let args: string[] | undefined;
									if (process.platform != "win32") {
										fs.chmodSync(dstFile, 0o755);
									} else {
										spawnProc = "cmd.exe";
										args = ["/c", dstFile];
									}
		
									if (args?.length) {
										ChildProcess.spawn(spawnProc, args, {
											stdio: "ignore",
											windowsHide: false
										});
									} else {
										ChildProcess.spawn(spawnProc, {
											stdio: "ignore",
											windowsHide: false
										});
									}

									let reloadBtn = "Reload Window";
									vscode.window.showInformationMessage("When finished installing, reload the window and setup the compiler in the getting started guide.", reloadBtn)
										.then(async btn => {
											if (btn == reloadBtn) {
												await vscode.commands.executeCommand("workbench.action.openWalkthrough", "webfreak.code-d#welcome");
												vscode.commands.executeCommand("workbench.action.reloadWindow");
											}
										})
								} catch (e) {
									vscode.window.showErrorMessage("Installation failled " + e);
								}
							}
						})
					}
				}));
			} else if ((<LabelCommandButton>selection).command) {
				runTerminal((<LabelCommandButton>selection).command);
			} else if ((<LabelInstallShButton>selection).installSh) {
				let installSh = codedContext.asAbsolutePath("res/exe/install.sh").replace(/\\/g, '\\\\');
				runTerminal((await testBinExists("bash")) + " \"" + installSh + "\" " + (<LabelInstallShButton>selection).installSh);
			}
		}
	});
	installPrompt.onDidTriggerButton(async (e) => {
		if (e == vscode.QuickInputButtons.Back) {
			await setupCompilersUI();
			installPrompt.hide();
		}
	});
}

export async function showDetectedCompilerInstallPrompt(compiler: DetectedCompiler) {
	const installPrompt = vscode.window.createQuickPick();
	installPrompt.title = "Configure " + compiler.has + " compiler";

	let [items, checked] = makeCompilerInstallButtons(compiler);
	installPrompt.items = items;
	installPrompt.selectedItems = checked;
	installPrompt.canSelectMany = true;
	installPrompt.buttons = [vscode.QuickInputButtons.Back];
	installPrompt.show();

	installPrompt.onDidAccept((e) => {
		let selection = installPrompt.selectedItems;
		installPrompt.hide();
		for (let i = 0; i < selection.length; i++) {
			const btn = <UIQuickPickItem>selection[i];
			if (btn.action)
				btn.action();
		}
	});
	installPrompt.onDidTriggerButton(async (e) => {
		if (e == vscode.QuickInputButtons.Back) {
			await setupCompilersUI();
			installPrompt.hide();
		}
	});
}

export function makeCompilerInstallButtons(compiler: DetectedCompiler): [UIQuickPickItem[], UIQuickPickItem[]] {
	let items: UIQuickPickItem[] = [];
	let checked: UIQuickPickItem[] = [];

	if (!compiler.path)
		throw new Error("Missing compiler path");

	function makeSettingButton(label: string, settings: [string, any][], detail?: string): UIQuickPickItem {
		return {
			label: label,
			description: "$(settings) " + settings.map(setting => "\"d." + setting[0] + "\": " + JSON.stringify(setting[1])).join(", "),
			detail: detail,
			action: function () {
				settings.forEach(setting => {
					config(null).update(setting[0], setting[1], vscode.ConfigurationTarget.Global);
				});
			}
		};
	}
	function check(b: UIQuickPickItem): UIQuickPickItem {
		checked.push(b);
		return b;
	}

	items.push(check(makeSettingButton(
		"Configure for auto completion and tasks",
		[["dubCompiler", compiler.inPath ? path.basename(compiler.path) : compiler.path], ["stdlibPath", compiler.importPaths || "auto"]],
		"This setting is needed for auto completion and build and debug tasks"
	)));

	let dir = path.dirname(compiler.path);
	let dubExe = path.join(dir, process.platform == "win32" ? "dub.exe" : "dub");
	if (fs.existsSync(dubExe)) {
		items.push(check(makeSettingButton(
			"Use included DUB executable",
			[["dubPath", dubExe]],
			"DUB is used for building the project through build tasks and debugging"
		)));
	}

	if (compiler.has == "dmd") {
		items.push(makeSettingButton(
			"Enable import timing code lens",
			[["dmdPath", compiler.path], ["enableDMDImportTiming", true]],
			"[EXPERIMENTAL] This is an experimental feature to see how imports affect compilation speed"
		));
	}

	return [items, checked];
}

export async function checkCompilers(): Promise<DetectedCompiler> {
	const compilers = await listCompilers();
	let dmdIndex = -1;
	let ldcIndex = -1;
	let gdcIndex = -1;
	let fallbackPath: string | undefined = undefined;
	for (let i = 0; i < compilers.length; i++) {
		const compiler = compilers[i];
		if (compiler.has) {
			switch (compiler.has) {
				case "dmd": dmdIndex = i; break;
				case "ldc": ldcIndex = i; break;
				case "gdc": gdcIndex = i; break;
				default: console.error("unexpected state in code-d?!"); break;
			}
		}
		fallbackPath = fallbackPath || compiler.path;
	}
	if (dmdIndex != -1)
		return compilers[dmdIndex];
	else if (ldcIndex != -1)
		return compilers[ldcIndex];
	else if (gdcIndex != -1)
		return compilers[gdcIndex];
	else
		return { has: false, path: fallbackPath };
}

let listCompilersCache: DetectedCompiler[] | undefined = undefined;
export async function listCompilers(): Promise<DetectedCompiler[]> {
	if (listCompilersCache !== undefined)
		return listCompilersCache;
	else
		return listCompilersCache = await listCompilersImpl();
}

export async function listCompilersImpl(): Promise<DetectedCompiler[]> {
	const compilers = ["dmd", "ldc2", "ldc", "gdc", "gcc"];
	let ret: DetectedCompiler[] = [];
	let fallbackPath: string | undefined = undefined;
	for (let i = 0; i < compilers.length; i++) {
		const check = compilers[i];
		let result = await checkCompiler(<any>check);
		fallbackPath = fallbackPath || result.path;
		if (result && result.has) {
			result.has = check == "ldc2" ? "ldc" : <any>check;
			ret.push(result);
			if (check == "ldc2" || check == "gdc")
				i++; // skip ldc / gcc
		}
	}
	if (ret.length == 0 && fallbackPath)
		ret.push({ has: false, path: fallbackPath });
	return ret;
}

const gdcVersionRegex = /^gcc version\s+v?(\d+(?:\.\d+)+)/gm;
const gdcFeVersionRegex = /^version\s+v?(\d+(?:\.\d+)+)/gm;
const gdcImportPathRegex = /^import path\s*\[\d+\]\s*=\s*(.+)/gm;
const ldcVersionRegex = /^LDC - the LLVM D compiler \(v?(\d+(?:\.\d+)+).*\)/gim;
const ldcFeVersionRegex = /based on DMD v?(\d+(?:\.\d+)+)/gim;
const dmdVersionRegex = /^DMD(?:32|64) D Compiler v?(\d+(?:\.\d+)+)/gim;
async function checkCompiler(compiler: "dmd" | "ldc" | "ldc2" | "gdc" | "gcc", compilerPath?: string): Promise<DetectedCompiler> {
	const isGDC = compiler == "gdc" || compiler == "gcc";
	let inPath = false;
	try {
		if (!compilerPath) {
			compilerPath = await which(compiler);
			inPath = true;
		}
	} catch (e) {
		return { has: false };
	}

	if (!compilerPath || !fs.existsSync(compilerPath))
		return { has: false };

	let versionArgs = ["--version"];
	if (isGDC)
		versionArgs = ["-xd", "-fsyntax-only", "-v", "-"];

	let proc: ChildProcess.ChildProcess;
	try {
		proc = ChildProcess.spawn(compilerPath, versionArgs, {
			stdio: [isGDC ? "pipe" : "ignore", "pipe", isGDC ? "pipe" : "ignore"]
		});
	} catch (err) {
		return { has: false, path: compilerPath };
	}

	return await new Promise((resolve) => {
		let stdout: string = "";
		proc.stdout!.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		if (isGDC) {
			proc.stderr!.on("data", (chunk) => {
				stdout += chunk.toString();
			});
			proc.stdin!.end();
		}
		proc.on("error", function () {
			resolve({ has: false, path: compilerPath });
		}).on("exit", function () {
			let beVersionRegex: RegExp | undefined;
			let feVersionRegex: RegExp | undefined;
			let importRegex: RegExp | undefined;
			let has: string | boolean;
			switch (compiler) {
				case "dmd":
					beVersionRegex = feVersionRegex = dmdVersionRegex;
					has = "dmd";
					break;
				case "gdc":
				case "gcc":
					beVersionRegex = gdcVersionRegex;
					feVersionRegex = gdcFeVersionRegex;
					importRegex = gdcImportPathRegex;
					has = "gdc";
					break;
				case "ldc":
				case "ldc2":
					feVersionRegex = ldcFeVersionRegex;
					beVersionRegex = ldcVersionRegex;
					has = "ldc";
					break;
				default:
					has = true;
					break;
			}
			let ret: DetectedCompiler = {
				has: <any>has,
				path: compilerPath,
				inPath: inPath
			};
			let m: RegExpMatchArray | null | undefined;
			if (beVersionRegex) beVersionRegex.lastIndex = 0;
			if (m = beVersionRegex?.exec(stdout)) {
				ret.version = m[1];
			}
			if (feVersionRegex) feVersionRegex.lastIndex = 0;
			if (m = feVersionRegex?.exec(stdout)) {
				ret.frontendVersion = m[1];
			}
			if (importRegex) {
				importRegex.lastIndex = 0;
				let imports: string[] = [];
				let importMatch: RegExpExecArray | null;
				while ((importMatch = importRegex.exec(stdout)) != null) {
					imports.push(importMatch[1]);
				}
				if (imports.length > 0)
					ret.importPaths = imports;
			}
			resolve(ret);
		});
	});
}

let binExistsCache: { [index: string]: string | false } = {};
async function testBinExists(binary: string): Promise<string | false> {
	if (binExistsCache[binary] !== undefined)
		return binExistsCache[binary];

	try {
		let founds = await which(binary, {
			all: true
		});
		for (let i = 0; i < founds.length; i++) {
			const found = founds[i];

			if (process.platform == "win32" && found.toUpperCase() == "C:\\WINDOWS\\SYSTEM32\\BASH.EXE")
				continue; // this is WSL bash - not what we want!

			return binExistsCache[binary] = found;
		}
	} catch (e) {
	}
	return binExistsCache[binary] = false;
}

