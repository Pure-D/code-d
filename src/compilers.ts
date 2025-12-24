import * as vscode from "vscode";
import * as which from "which";
import * as fs from "fs";
import * as path from "path";
import * as ChildProcess from "child_process";
import { config, hideNextPotentialConfigUpdateWarning } from "./extension";
import { determineOutputFolder, downloadFileInteractive } from "./installer";
import { reqText } from "./util";

export interface DetectedCompiler {
	/**
	 * `false` if not a valid executable compiler, set to the compiler name
	 * (dmd, ldc or gdc) otherwise.
	 */
	has: "dmd" | "ldc" | "gdc" | boolean;
	version?: string;
	frontendVersion?: string;
	path?: string;
	inPath?: boolean;
	importPaths?: string[];
}

let codedContext: vscode.ExtensionContext;
export function registerCompilerInstaller(context: vscode.ExtensionContext): vscode.Disposable {
	codedContext = context;
	return vscode.commands.registerCommand("code-d.setupCompiler", () => {
		setupCompilersUI();
	});
}

type UIQuickPickItem = vscode.QuickPickItem & { kind?: number; installInfo?: DetectedCompiler; action?: () => void };
export async function setupCompilersUI() {
	const introQuickPick = vscode.window.createQuickPick();
	introQuickPick.title = "Setup auto-detected compiler or manually configure compiler";
	introQuickPick.busy = true;
	introQuickPick.items = [{ label: "Detecting compilers..." }];
	introQuickPick.show();
	const compilers: DetectedCompiler[] = await listCompilers();
	const items: UIQuickPickItem[] = [];
	for (let i = 0; i < compilers.length; i++) {
		if (i == 0) {
			items.push({
				label: "$(find-expanded) Detected installations",
				kind: vscode.QuickPickItemKind.Separator,
			});
		}

		const compiler = compilers[i];
		if (compiler.has && compiler.path) {
			items.push({
				label: compiler.has + "",
				description: makeCompilerDescription(compiler),
				installInfo: compiler,
			});
		}
	}
	items.push({
		label: "$(find-expanded) Manual configuration",
		kind: vscode.QuickPickItemKind.Separator,
	});
	let manualSelect: vscode.QuickPickItem;
	let dmdItem: vscode.QuickPickItem;
	let ldcItem: vscode.QuickPickItem;
	let gdcItem: vscode.QuickPickItem;
	items.push(
		(dmdItem = {
			label: "DMD",
			description: "The reference D compiler ・ latest features, fast compilation",
		}),
	);
	if (compilers.length == 0) dmdItem.detail = "$(getting-started-beginner) Recommended for beginners";
	items.push(
		(ldcItem = {
			label: "LDC",
			description: "LLVM-based D compiler ・ recent features, great optimization",
		}),
	);
	items.push(
		(gdcItem = {
			label: "GDC",
			description: "GCC-based D compiler ・ stable, great optimization",
		}),
	);
	items.push(
		(manualSelect = {
			label: "Select installed executable",
			description: "if you have already installed a D compiler that is not being picked up",
		}),
	);
	introQuickPick.items = items;
	introQuickPick.busy = false;

	introQuickPick.onDidAccept(async () => {
		const selection = <UIQuickPickItem>introQuickPick.selectedItems[0];
		if (selection.kind === vscode.QuickPickItemKind.Separator) return;

		introQuickPick.hide();
		if (selection.installInfo) {
			showDetectedCompilerInstallPrompt(selection.installInfo);
		} else {
			function isGlobalInstallSh() {
				const dir = getDefaultInstallShDir();
				return dir ? fs.existsSync(dir) : false;
			}
			let latest;
			switch (selection) {
				case dmdItem:
					latest =
						process.platform == "win32" && (await readHTTP("http://downloads.dlang.org/releases/LATEST"));
					showCompilerInstallationPrompt("DMD", [
						{ label: "See releases", website: "https://dlang.org/download.html#dmd" },
						latest && {
							platform: "win32",
							label: "Run installer",
							downloadAndRun:
								"http://downloads.dlang.org/releases/2.x/" + latest + "/dmd-" + latest + ".exe",
						},
						{
							label: "Portable install (in existing ~/dlang)",
							installSh: "install dmd,dub",
							binTest: "bash",
							global: true,
							platform: isGlobalInstallSh,
						},
						{ label: "Portable install", installSh: "install dmd,dub", binTest: "bash" },
						{
							platform: "linux",
							label: "System install",
							command: "pacman -S dlang-dmd dub",
							binTest: "pacman",
						},
						{ platform: "linux", label: "System install", command: "layman -a dlang", binTest: "layman" },
						{ platform: "darwin", label: "Brew install", command: "brew install dmd dub", binTest: "brew" },
						{
							platform: "linux",
							label: "System install",
							command: "nix-env -iA nixpkgs.dmd",
							binTest: "nix-env",
						},
						{
							platform: "linux",
							label: "System install",
							command: "zypper install dmd",
							binTest: "zypper",
						},
						{
							platform: "linux",
							label: "System install",
							command: "xbps-install -S dmd",
							binTest: "xbps-install",
						},
					]);
					break;
				case ldcItem:
					latest = process.platform == "win32" && (await readHTTP("http://ldc-developers.github.io/LATEST"));
					showCompilerInstallationPrompt("LDC", [
						{ label: "See releases", website: "https://github.com/ldc-developers/ldc/releases" },
						latest && {
							platform: "win32",
							label: "Run installer",
							downloadAndRun:
								"https://github.com/ldc-developers/ldc/releases/download/v" +
								latest +
								"/ldc2-" +
								latest +
								"-windows-multilib.exe",
						},
						{
							label: "Portable install (in existing ~/dlang)",
							installSh: "install ldc,dub",
							binTest: "bash",
							global: true,
							platform: isGlobalInstallSh,
						},
						{ label: "Portable install", installSh: "install ldc,dub", binTest: "bash" },
						{ platform: "linux", label: "System install", command: "apk add ldc", binTest: "apk" },
						{
							platform: "linux",
							label: "System install",
							command: "pacman -S dlang-ldc dub",
							binTest: "pacman",
						},
						{ platform: "win32", label: "System install", command: "choco install ldc", binTest: "choco" },
						{ platform: "linux", label: "System install", command: "apt install ldc", binTest: "apt" },
						{ platform: "linux", label: "System install", command: "dnf install ldc", binTest: "dnf" },
						{ platform: "freebsd", label: "System install", command: "pkg install ldc", binTest: "pkg" },
						{ platform: "linux", label: "System install", command: "layman -a ldc", binTest: "layman" },
						{ platform: "darwin", label: "Brew install", command: "brew install ldc dub", binTest: "brew" },
						{ platform: "linux", label: "System install", command: "nix-env -i ldc", binTest: "nix-env" },
						{
							platform: "linux",
							label: "System install",
							command: "xbps-install -S ldc",
							binTest: "xbps-install",
						},
					]);
					break;
				case gdcItem:
					showCompilerInstallationPrompt("GDC", [
						{ label: "View Project website", website: "https://gdcproject.org/downloads" },
						{ platform: "win32", label: "Install through WinLibs", website: "https://winlibs.com" },
						// no install.sh for GDC because the version is ancient! (installing gcc 4.8.5, FE 2.068.2)
						// { platform: () => isGlobalInstallSh() && process.platform == "linux", label: "Portable install (in existing ~/dlang)", installSh: "install gdc,dub", global: true },
						// { platform: "linux", label: "Portable install", installSh: "install gdc,dub" },
						{
							platform: "linux",
							label: "System install",
							command: "pacman -S gcc-d dub",
							binTest: "pacman",
						},
						{ platform: "linux", label: "System install", command: "apt install gdc", binTest: "apt" },
					]);
					break;
				case manualSelect:
					doManualSelect();
					break;
				default:
					console.error("invalid selection");
					introQuickPick.show();
					break;
			}
		}
	});
}

export function makeCompilerDescription(compiler: DetectedCompiler): string | undefined {
	const versionStrings: string[] = [];
	if (compiler.version) {
		if (compiler.has == "gdc") versionStrings.push("gcc " + compiler.version);
		else versionStrings.push(compiler.version);
	}
	if (compiler.frontendVersion && compiler.frontendVersion != compiler.version)
		versionStrings.push("spec version " + compiler.frontendVersion);
	if (!compiler.inPath && compiler.path) versionStrings.push(compiler.path);
	return versionStrings.length > 0 ? versionStrings.join(" ・ ") : undefined;
}

async function readHTTP(uri: string): Promise<string | undefined> {
	try {
		return (await reqText(undefined, 3000).get(uri)).data;
	} catch (e) {
		console.log("could not fetch", uri, e);
		return undefined;
	}
}

async function doManualSelect(): Promise<void> {
	const files = await vscode.window.showOpenDialog({
		title: "Select compiler executable",
	});
	if (files && files.length > 0) {
		if (files.length > 1) {
			vscode.window.showWarningMessage("ignoring more than 1 file");
		}
		const selectedPath = files[0].fsPath;
		const filename = path.basename(selectedPath);
		const type = getCompilerTypeFromPrefix(filename);
		if (!type) {
			const tryAgain = "Try Again";
			vscode.window
				.showErrorMessage(
					"Could not detect compiler type from executable name (tested for DMD, LDC and GDC) - make sure you open the compiler executable and name it correctly!",
					tryAgain,
				)
				.then((b) => {
					if (b == tryAgain) doManualSelect();
				});
		} else {
			const result = await checkCompiler(type, selectedPath);
			if (!result.has) {
				const tryAgain = "Try Again";
				vscode.window
					.showErrorMessage(
						"The selected file was not executable or did not work with. Is the selected file a DMD, LDC or GDB executable?",
						tryAgain,
					)
					.then((b) => {
						if (b == tryAgain) doManualSelect();
					});
				return;
			}

			if (!result.version && !result.frontendVersion) {
				const tryAgain = "Try Again";
				const ignore = "Ignore";
				const choice = await vscode.window.showWarningMessage(
					"Could not detect the compiler version from the executable. Is the selected file a DMD, LDC or GDB executable?",
					tryAgain,
				);
				if (choice == tryAgain) return doManualSelect();
				else if (choice != ignore) return;
			}

			await showDetectedCompilerInstallPrompt(result);
		}
	}
}

type LabelWebsiteButton = {
	label: string;
	platform?: NodeJS.Platform | (() => boolean);
	binTest?: string;
	website: string;
};
type LabelDownloadButton = {
	label: string;
	platform?: NodeJS.Platform | (() => boolean);
	binTest?: string;
	downloadAndRun: string;
};
type LabelCommandButton = {
	label: string;
	platform?: NodeJS.Platform | (() => boolean);
	binTest?: string;
	command: string;
};
type LabelInstallShButton = {
	label: string;
	platform?: NodeJS.Platform | (() => boolean);
	binTest?: string;
	installSh: string;
	global?: boolean;
};

type InstallButtonType = LabelWebsiteButton | LabelDownloadButton | LabelCommandButton | LabelInstallShButton;
type InstallQuickPickItem = vscode.QuickPickItem & { button: InstallButtonType };

async function showCompilerInstallationPrompt(
	name: string,
	buttons: (InstallButtonType | false | null | undefined | "")[],
) {
	const installPrompt = vscode.window.createQuickPick();
	installPrompt.title = "Install " + name + " compiler";
	const items: InstallQuickPickItem[] = [];
	for (let i = 0; i < buttons.length; i++) {
		const button = buttons[i];
		if (!button) continue;
		if (button.platform) {
			if (typeof button.platform == "function") {
				if (!button.platform()) continue;
			} else if (process.platform != button.platform) {
				continue;
			}
		}
		if (button.binTest && !(await testBinExists(button.binTest))) continue;
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
			button: button,
		});
	}
	installPrompt.items = items;
	installPrompt.buttons = [vscode.QuickInputButtons.Back];
	installPrompt.show();

	installPrompt.onDidAccept(async () => {
		function runTerminal(shell: string) {
			const terminal = vscode.window.createTerminal("code-d compiler installation");
			terminal.show();
			terminal.sendText(shell, true);
		}

		const selection = (<InstallQuickPickItem>installPrompt.selectedItems[0])?.button;
		installPrompt.hide();
		if (selection) {
			if ((<LabelWebsiteButton>selection).website) {
				vscode.env.openExternal(vscode.Uri.parse((<LabelWebsiteButton>selection).website));
			} else if ((<LabelDownloadButton>selection).downloadAndRun) {
				const link = (<LabelDownloadButton>selection).downloadAndRun;
				let aborted = false;
				const outputFolder = determineOutputFolder();
				const fileLocation = link.lastIndexOf("/");
				const dstFile = path.join(
					outputFolder,
					fileLocation == -1 ? "compiler_dl.exe" : link.substr(fileLocation + 1),
				);
				console.log("Downloading " + link + " to " + dstFile);
				downloadFileInteractive(link, "Downloading Compiler installer", () => {
					aborted = true;
				}).then((stream) =>
					stream.pipe(fs.createWriteStream(dstFile)).on("finish", () => {
						if (!aborted) {
							// note: if not using an information prompt, add a timeout so on windows it doesn't fail with EBUSY here
							const installBtn = "Run Installer";
							vscode.window
								.showInformationMessage("Executable is ready for install!", installBtn)
								.then((btn) => {
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
													windowsHide: false,
												});
											} else {
												ChildProcess.spawn(spawnProc, {
													stdio: "ignore",
													windowsHide: false,
												});
											}

											listCompilersCache = undefined; // clear cache for next list
											const reloadBtn = "Reload Window";
											vscode.window
												.showInformationMessage(
													"When finished installing, reload the window and setup the compiler in the getting started guide.",
													reloadBtn,
												)
												.then(async (btn) => {
													if (btn == reloadBtn) {
														await vscode.commands.executeCommand(
															"workbench.action.openWalkthrough",
															"webfreak.code-d#welcome",
														);
														vscode.commands.executeCommand(
															"workbench.action.restartExtensionHost",
														);
													}
												});
										} catch (e) {
											vscode.window.showErrorMessage("Installation failled " + e);
										}
									}
								});
						}
					}),
				);
			} else if ((<LabelCommandButton>selection).command) {
				runTerminal((<LabelCommandButton>selection).command);
			} else if ((<LabelInstallShButton>selection).installSh) {
				const installSh = codedContext.asAbsolutePath("res/exe/install.sh").replace(/\\/g, "\\\\");
				const installDir = getLocalCompilersDir().replace(/\\/g, "\\\\");
				runTerminal(
					`${await testBinExists("bash")} "${installSh}" -p "${installDir}" ${(<LabelInstallShButton>selection).installSh}`,
				);
				listCompilersCache = undefined; // clear cache for next list
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

	const [items, checked] = makeCompilerInstallButtons(compiler);
	installPrompt.items = items;
	installPrompt.selectedItems = checked;
	installPrompt.canSelectMany = true;
	installPrompt.buttons = [vscode.QuickInputButtons.Back];
	installPrompt.show();

	installPrompt.onDidAccept(() => {
		const selection = installPrompt.selectedItems;
		installPrompt.hide();
		for (let i = 0; i < selection.length; i++) {
			const btn = <UIQuickPickItem>selection[i];
			if (btn.action) btn.action();
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
	const items: UIQuickPickItem[] = [];
	const checked: UIQuickPickItem[] = [];

	if (!compiler.path) throw new Error("Missing compiler path");

	function makeSettingButton(label: string, settings: [string, unknown][], detail?: string): UIQuickPickItem {
		return {
			label: label,
			description:
				"$(settings) " +
				settings.map((setting) => '"d.' + setting[0] + '": ' + JSON.stringify(setting[1])).join(", "),
			detail: detail,
			action: function () {
				settings.forEach((setting) => {
					hideNextPotentialConfigUpdateWarning();
					config(null).update(setting[0], setting[1], vscode.ConfigurationTarget.Global);
				});
			},
		};
	}
	function check(b: UIQuickPickItem): UIQuickPickItem {
		checked.push(b);
		return b;
	}

	items.push(
		check(
			makeSettingButton(
				"Configure for auto completion and tasks",
				[
					["dubCompiler", compiler.inPath ? path.basename(compiler.path) : compiler.path],
					["stdlibPath", compiler.importPaths || "auto"],
				],
				"This setting is needed for auto completion and build and debug tasks",
			),
		),
	);

	const dir = path.dirname(compiler.path);
	const dubExe = path.join(dir, process.platform == "win32" ? "dub.exe" : "dub");
	if (fs.existsSync(dubExe)) {
		items.push(
			check(
				makeSettingButton(
					"Use included DUB executable",
					[["dubPath", dubExe]],
					"DUB is used for building the project through build tasks and debugging",
				),
			),
		);
	}

	if (compiler.has == "dmd") {
		items.push(
			makeSettingButton(
				"Enable import timing code lens",
				[
					["dmdPath", compiler.path],
					["enableDMDImportTiming", true],
				],
				"[EXPERIMENTAL] This is an experimental feature to see how imports affect compilation speed",
			),
		);
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
			function isBetterVer(vs: number) {
				if (vs == -1) return true;
				const a = compilers[i].frontendVersion || compilers[i].version || "0";
				const b = compilers[vs].frontendVersion || compilers[vs].version || "0";
				return cmpVerGeneric(a, b) > 0;
			}
			switch (compiler.has) {
				case "dmd":
					if (isBetterVer(dmdIndex)) dmdIndex = i;
					break;
				case "ldc":
					if (isBetterVer(ldcIndex)) ldcIndex = i;
					break;
				case "gdc":
					if (isBetterVer(gdcIndex)) gdcIndex = i;
					break;
				default:
					console.error("unexpected state in code-d?!");
					break;
			}
		}
		fallbackPath = fallbackPath || compiler.path;
	}
	if (dmdIndex != -1) return compilers[dmdIndex];
	else if (ldcIndex != -1) return compilers[ldcIndex];
	else if (gdcIndex != -1) return compilers[gdcIndex];
	else return { has: false, path: fallbackPath };
}

function cmpVerGeneric(a: string, b: string): number {
	const as = a
		.split(/[\s.-]+/g)
		.map((i) => parseInt(i))
		.filter((n) => isFinite(n));
	const bs = b
		.split(/[\s.-]+/g)
		.map((i) => parseInt(i))
		.filter((n) => isFinite(n));
	return as < bs ? -1 : as > bs ? 1 : 0;
}

function getDefaultInstallShDir(): string | undefined {
	if (process.platform == "win32") {
		return process.env.USERPROFILE;
	} else if (process.env.HOME) {
		return path.join(process.env.HOME, "dlang");
	} else {
		return undefined;
	}
}

function getLocalCompilersDir(): string {
	return path.join(determineOutputFolder(), "compilers");
}

let listCompilersCache: DetectedCompiler[] | undefined = undefined;
export async function listCompilers(): Promise<DetectedCompiler[]> {
	if (listCompilersCache !== undefined) return listCompilersCache;
	else return (listCompilersCache = await listCompilersImpl());
}

export async function listCompilersImpl(): Promise<DetectedCompiler[]> {
	const ret: DetectedCompiler[] = [];
	let fallbackPath: string | undefined = undefined;
	let defaultDir: string | undefined;

	async function testInstallShPath(dir: string, type: "dmd" | "ldc" | "gdc") {
		const activateFile = process.platform == "win32" ? "activate.bat" : "activate";
		const activateContent: string | undefined = await new Promise((resolve) => {
			fs.readFile(path.join(dir, activateFile), { encoding: "utf8" }, (err, data) => {
				if (err) return resolve(undefined);
				resolve(data);
			});
		});

		if (!activateContent) return;

		const foundPaths: string[] = [];
		activatePathEnvironmentRegex.lastIndex = 0;
		let m: RegExpMatchArray | null | undefined;
		while ((m = activatePathEnvironmentRegex.exec(activateContent))) {
			// unshift because the scripts are prepending and we want 0 to be most specific
			// at least on windows this will prefer the bin64 over bin folder
			foundPaths.unshift(...m[1].split(process.platform == "win32" ? /;/g : /:/g));
		}

		for (let i = 0; i < foundPaths.length; i++) {
			let exeName: string = type;
			if (type == "ldc") exeName += "2"; // ldc2.exe
			if (process.platform == "win32") exeName += ".exe";
			const exePath = path.join(foundPaths[i], exeName);

			if (!fs.existsSync(exePath)) continue;

			const result = await checkCompiler(type, exePath);
			fallbackPath = fallbackPath || result.path;
			if (result && result.has) {
				result.has = type;
				ret.push(result);
				break;
			}
		}
	}

	// test code-d install.sh based D compilers
	await new Promise((resolve) => {
		fs.readdir((defaultDir = getLocalCompilersDir()), async (err, files) => {
			try {
				if (err) return;
				for (let i = 0; i < files.length; i++) {
					const file = files[i];
					const type = getCompilerTypeFromPrefix(file);
					if (type) await testInstallShPath(path.join(defaultDir!, file), type);
				}
			} finally {
				resolve(undefined);
			}
		});
	});

	// test compilers in $PATH
	const compilers = ["dmd", "ldc2", "ldc", "gdc", "gcc"] as const;
	for (let i = 0; i < compilers.length; i++) {
		const check = compilers[i];
		const result = await checkCompiler(check);
		fallbackPath = fallbackPath || result.path;
		if (result && result.has) {
			result.has = check == "ldc2" ? "ldc" : check == "gcc" ? "gdc" : check;
			ret.push(result);
			if (check == "ldc2" || check == "gdc") i++; // skip ldc / gcc
		}
	}

	// test global install.sh based D compilers
	defaultDir = getDefaultInstallShDir();
	if (defaultDir) {
		await new Promise((resolve) => {
			fs.readdir(defaultDir!, async (err, files) => {
				try {
					if (err) return;
					for (let i = 0; i < files.length; i++) {
						const file = files[i];
						const type = getCompilerTypeFromPrefix(file);
						if (type) await testInstallShPath(path.join(defaultDir!, file), type);
					}
				} finally {
					resolve(undefined);
				}
			});
		});
	}

	if (ret.length == 0 && fallbackPath) ret.push({ has: false, path: fallbackPath });
	return ret;
}

// compiler type by checking if the file/foldername starts with ldc/dmd/gdc
function getCompilerTypeFromPrefix(folderName: string): "ldc" | "dmd" | "gdc" | null {
	if (folderName.startsWith("dmd")) return "dmd";
	else if (folderName.startsWith("gdc") || folderName.startsWith("gcc")) return "gdc";
	else if (folderName.startsWith("ldc")) return "ldc";
	else return null;
}

const activatePathEnvironmentRegex =
	process.platform == "win32" ? /^set\s+PATH="?([^%"]+)"?/gim : /^(?:export\s+)?PATH="?([^$"]+)"?/gm;
const gdcVersionRegex = /^gcc version\s+v?(\d+(?:\.\d+)+)/gm;
const gdcFeVersionRegex = /^version\s+v?(\d+(?:\.\d+)+)/gm;
const gdcImportPathRegex = /^import path\s*\[\d+\]\s*=\s*(.+)/gm;
const ldcVersionRegex = /^LDC - the LLVM D compiler \(v?(\d+(?:\.\d+)+).*\)/gim;
const ldcFeVersionRegex = /based on DMD v?(\d+(?:\.\d+)+)/gim;
const dmdVersionRegex = /^DMD(?:32|64) D Compiler v?(\d+(?:\.\d+)+)/gim;
async function checkCompiler(
	compiler: "dmd" | "ldc" | "ldc2" | "gdc" | "gcc",
	compilerPath?: string,
): Promise<DetectedCompiler> {
	const isGDC = compiler == "gdc" || compiler == "gcc";
	let inPath = false;
	try {
		if (!compilerPath) {
			compilerPath = await which(compiler);
			inPath = true;
		}
	} catch {
		return { has: false };
	}

	if (!compilerPath || !fs.existsSync(compilerPath)) return { has: false };

	let versionArgs = ["--version"];
	if (isGDC) versionArgs = ["-xd", "-fsyntax-only", "-v", "-"];

	let proc: ChildProcess.ChildProcess;
	try {
		proc = ChildProcess.spawn(compilerPath, versionArgs, {
			stdio: [isGDC ? "pipe" : "ignore", "pipe", isGDC ? "pipe" : "ignore"],
		});
	} catch {
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
			let has: "dmd" | "gdc" | "ldc" | true;
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
			const ret: DetectedCompiler = {
				has: has,
				path: compilerPath,
				inPath: inPath,
			};
			let m: RegExpMatchArray | null | undefined;
			if (beVersionRegex) beVersionRegex.lastIndex = 0;
			if ((m = beVersionRegex?.exec(stdout))) {
				ret.version = m[1];
			}
			if (feVersionRegex) feVersionRegex.lastIndex = 0;
			if ((m = feVersionRegex?.exec(stdout))) {
				ret.frontendVersion = m[1];
			}
			if (importRegex) {
				importRegex.lastIndex = 0;
				const imports: string[] = [];
				let importMatch: RegExpExecArray | null;
				while ((importMatch = importRegex.exec(stdout)) != null) {
					imports.push(importMatch[1]);
				}
				if (imports.length > 0) ret.importPaths = imports;
			}
			resolve(ret);
		});
	});
}

const binExistsCache: { [index: string]: string | false } = {};
async function testBinExists(binary: string): Promise<string | false> {
	// common bash install case for windows users
	const win32GitBashPath = "C:\\Program Files\\Git\\usr\\bin\\bash.exe";
	if (binExistsCache[binary] !== undefined) return binExistsCache[binary];

	try {
		const founds = await which(binary, {
			all: true,
		});
		if (process.platform == "win32" && (binary.toUpperCase() == "BASH" || binary.toUpperCase() == "BASH.EXE")) {
			if (fs.existsSync(win32GitBashPath)) return (binExistsCache[binary] = win32GitBashPath);
		}
		for (let i = 0; i < founds.length; i++) {
			const found = founds[i];

			if (process.platform == "win32" && found.toUpperCase() == "C:\\WINDOWS\\SYSTEM32\\BASH.EXE") continue; // this is WSL bash - not what we want!

			return (binExistsCache[binary] = found);
		}
	} catch (e) {
		console.warn("Failed checking if binary exists ", binary, e);
	}
	return (binExistsCache[binary] = false);
}
