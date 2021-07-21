import * as ChildProcess from "child_process"
import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import { reqJson, reqType } from "./util"
import { config } from "./extension"
import expandTilde = require("expand-tilde");
import { AxiosResponse } from "axios"
import { Readable } from "stream"

var rimraf = require("rimraf");
var AdmZip = require("adm-zip");
var async = require("async");
var rmdir = require("rmdir");
var mkdirp = require("mkdirp");

var extensionContext: vscode.ExtensionContext;

function gitPath() {
	return vscode.workspace.getConfiguration("git").get("path", "git") || "git";
}

export function setContext(context: vscode.ExtensionContext) {
	extensionContext = context;
}

function determineOutputFolder(): string {
	if (process.platform == "linux") {
		if (fs.existsSync(path.join(process.env.HOME!, ".local", "share")))
			return path.join(process.env.HOME!, ".local", "share", "code-d", "bin");
		else
			return path.join(process.env.HOME!, ".code-d", "bin");
	}
	else if (process.platform == "win32") {
		return path.join(process.env.APPDATA!, "code-d", "bin");
	}
	else {
		return path.join(extensionContext.extensionPath, "bin");
	}
}

var installationLog: vscode.OutputChannel;
const installationTitle = "code-d/serve-d installation progress";

export function getInstallOutput(): vscode.OutputChannel {
	if (!installationLog) {
		installationLog = vscode.window.createOutputChannel(installationTitle);
		extensionContext.subscriptions.push(installationLog);
		installationLog.show(true);
	}
	return installationLog;
}

export function downloadFileInteractive(url: string, title: string, aborted: Function): Thenable<Readable> {
	let progress: vscode.Progress<any> | undefined;
	let cancel: vscode.CancellationToken | undefined;
	let done: Function | false | undefined;

	let stream = reqType("stream").get<Readable>(url).then((body): Readable => {
		// manually aborting request object because we are consuming a stream, otherwise it would try to "reject" an already resolved promise
		if (cancel) {
			cancel.onCancellationRequested(() => {
				if (body.request.aborted) return;
				body.request.abort();
				aborted();
			});
		} else {
			console.error("failed registering cancel token");
		}

		let len = parseInt(body.headers["Content-Length"] || body.headers["content-length"] || 0);
		if (len == 0)
			return body.data;

		let totalPercent: number = 0;
		console.log(typeof (body.data));
		console.log(body.data.constructor.name);
		console.log(body.data);
		return body.data.on("data", (chunk) => {
			let increment = chunk.length / len;
			totalPercent += increment;
			if (progress)
				progress.report({
					message: `Downloaded ${(totalPercent * 100).toFixed(2)}%`,
					increment: increment * 100
				});
		}).on("end", () => {
			if (done)
				done();
			else
				done = false;

			installationLog.appendLine("Finished downloading");
		});
	});

	vscode.window.withProgress({
		cancellable: true,
		location: vscode.ProgressLocation.Notification,
		title: title
	}, (_progress, _cancel) => {
		progress = _progress;
		cancel = _cancel;
		return new Promise((resolve) => {
			if (done === false)
				return resolve(undefined);
			done = resolve;
		});
	});

	return stream;
}

export interface ReleaseAsset {
	id: number;
	name: string;
	size: number;
	download_count: number;
	browser_download_url: string;
	created_at: string;
}

export interface Release {
	name: string;
	asset?: ReleaseAsset;
}

const nightlyReleaseId = 20717582;
let servedVersionCache = {
	release: <Release | undefined>undefined,
	channel: ""
};

export function findLatestServeD(force: boolean = false, channel?: string): Thenable<Release | undefined> {
	if (!channel)
		channel = config(null).get("servedReleaseChannel", "stable");

	if (channel == "frozen" && force)
		channel = "stable";

	if (channel == "frozen")
		return Promise.resolve(undefined);

	if (servedVersionCache.channel == channel)
		return Promise.resolve(servedVersionCache.release);

	let randomUpdateReduction = config(null).get("smartServedUpdates", true);
	if (randomUpdateReduction && channel == "stable" && !force) {
		if (Math.floor(Math.random() * 4) == 0) {
			// only update approximately every 4th user/time running on stable.
			// Lowers bandwidth and startup delay to check not-so-frequent stable releases
			return Promise.resolve(undefined);
		}

		if ((new Date()).getDay() == 5
			&& Math.floor(Math.random() * 3) == 0) {
			// furthermore reduce updates on fridays
			// avoids breaking peoples workflow right at the end of their work week
			return Promise.resolve(undefined);
		}
	}
	let timeout = force ? 8000 : 3000;

	if (channel == "nightly") {
		return fetchNightlyRelease(timeout);
	} else if (channel == "stable" || channel == "beta") {
		return fetchLatestTaggedRelease(channel, timeout);
	} else {
		return Promise.resolve(undefined);
	}
}

async function fetchNightlyRelease(timeout: number): Promise<Release | undefined> {
	let res: AxiosResponse;
	try {
		res = await reqJson().get("https://api.github.com/repos/Pure-D/serve-d/releases/" + nightlyReleaseId, {
			headers: {
				"User-Agent": "https://github.com/Pure-D/code-d"
			},
			timeout: timeout
		});
	} catch (e) {
		console.error("Error fetching nightly code-d release: ", e);
		return undefined;
	}

	let body = res.data;

	if (typeof body != "object")
		return undefined;

	var assets = <ReleaseAsset[]>body.assets;
	// reverse sort (largest date first)
	assets.sort((a, b) => b.name.localeCompare(a.name));

	let targetAsset = findFirstMatchingAsset("nightly", assets);
	let ret: Release = {
		name: "nightly",
		asset: targetAsset
	};

	servedVersionCache.release = ret;
	servedVersionCache.channel = "nightly";
	return ret;
}

async function fetchLatestTaggedRelease(channel: "stable" | "beta", timeout: number): Promise<Release | undefined> {
	let res: AxiosResponse;
	try {
		res = await reqJson().get("https://api.github.com/repos/Pure-D/serve-d/releases", {
			headers: {
				"User-Agent": "https://github.com/Pure-D/code-d"
			},
			timeout: timeout
		});
	} catch (e) {
		console.error("Error fetching nightly code-d release: ", e);
		return undefined;
	}

	let body = res.data;

	if (!Array.isArray(body))
		return undefined;

	let numMatching = 0;

	let ret: Release = {
		name: "master"
	};

	for (let i = 0; i < body.length; i++) {
		const release = body[i];
		if (release.id == nightlyReleaseId)
			continue;

		if (channel == "stable" && release.prerelease)
			continue;

		let targetAsset = findFirstMatchingAsset(release.name, release.assets);
		if (!targetAsset) {
			if (ret.name == "master") {
				ret.name = release.tag_name;
			}
		} else {
			ret.name = release.tag_name;
			ret.asset = targetAsset;
			break;
		}

		// search last 3 releases for binaries
		if (numMatching++ >= 3)
			break;
	}

	servedVersionCache.release = ret;
	servedVersionCache.channel = channel!;
	return ret;
}

function findFirstMatchingAsset(name: string | "nightly", assets: ReleaseAsset[]): ReleaseAsset | undefined {
	let os = <string>process.platform;
	let arch = process.arch == "x64" ? "x86_64" : process.arch == "ia32" ? "x86" : process.arch;

	if (os == "win32") {
		os = "windows";
	}
	else if (os == "darwin") {
		os = "osx";
	}

	if (name == "nightly") {
		for (let i = 0; i < assets.length; i++) {
			const asset = assets[i];
			let test = asset.name;
			if (test.startsWith("serve-d"))
				test = test.substr("serve-d".length);
			if (test.startsWith("-") || test.startsWith("_"))
				test = test.substr(1);

			if (!test.startsWith(os))
				continue;
			test = test.substr(os.length);
			if (test.startsWith("-") || test.startsWith("_"))
				test = test.substr(1);
			if (test.startsWith("nightly"))
				test = test.substr("nightly".length);
			if (test.startsWith("-") || test.startsWith("_"))
				test = test.substr(1);

			// remaining:
			// either x86_64-20191017-4b5427.tar.xz
			// or (platformless) 20191017-4b5427.tar.xz
			if (test.startsWith(arch) || test.startsWith("2")) // 2 for 2019 and the next 980 years of support, indicating no architecture (windows)
				return asset;
		}
		return undefined;
	} else {
		if (name.startsWith("v"))
			name = name.substr(1);

		for (let i = 0; i < assets.length; i++) {
			const asset = assets[i];
			let test = asset.name;
			if (test.startsWith("serve-d"))
				test = test.substr("serve-d".length);
			if (test.startsWith("-") || test.startsWith("_"))
				test = test.substr(1);
			if (test.startsWith(name))
				test = test.substr(name.length);
			if (test.startsWith("-") || test.startsWith("_"))
				test = test.substr(1);

			const dot = test.indexOf('.');
			if (dot != -1)
				test = test.substr(0, dot);

			if (test == `${os}-${arch}` || test == os)
				return asset;
		}
		return undefined;
	}
}

export function updateAndInstallServeD(env: any): Thenable<boolean | undefined> {
	return vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Searching for updates..."
	}, (progress, token) => {
		return findLatestServeD(true).then((version): Thenable<boolean | undefined> => {
			if (version === undefined) {
				const compile = "Compile";
				const userSettings = "Open User Settings";
				return vscode.window.showInformationMessage("Updates can currently not be determined. Would you like "
					+ "to try and compile serve-d from source or specify a path to the serve-d executable in your user settings?",
					compile, userSettings).then(option => {
						if (option == compile)
							return compileServeD("master")(env);
						else if (userSettings)
							vscode.commands.executeCommand("workbench.action.openGlobalSettings");
						return Promise.resolve(undefined);
					});
			} else if (!version.asset) {
				return compileServeD("master")(env);
			} else {
				return installServeD([{ url: version.asset.browser_download_url, title: "Serve-D" }], version.name)(env);
			}
		});
	});
}

export function installServeD(urls: { url: string, title: string }[], ref: string): (env: NodeJS.ProcessEnv) => Thenable<boolean | undefined> {
	if (urls.length == 0)
		return (env: any) => {
			return vscode.window.showErrorMessage("No precompiled serve-d binary for this platform/architecture", "Compile from source").then((r?: string) => {
				if (r == "Compile from source")
					return compileServeD(ref)(env);
				else
					return Promise.resolve(undefined);
			});
		};

	// add DCD binaries here as well
	if (process.platform == "linux" && process.arch == "x64") {
		urls.push({ url: "https://github.com/dlang-community/DCD/releases/download/v0.13.6/dcd-v0.13.6-linux-x86_64.tar.gz", title: "DCD" });
	}
	else if (process.platform == "darwin" && process.arch == "x64") {
		urls.push({ url: "https://github.com/dlang-community/DCD/releases/download/v0.13.6/dcd-v0.13.6-osx-x86_64.tar.gz", title: "DCD" });
	}
	else if (process.platform == "win32") {
		if (process.arch == "x64")
			urls.push({ url: "https://github.com/dlang-community/DCD/releases/download/v0.13.6/dcd-v0.13.6-windows-x86_64.zip", title: "DCD" });
		else
			urls.push({ url: "https://github.com/dlang-community/DCD/releases/download/v0.13.6/dcd-v0.13.6-windows-x86.zip", title: "DCD" });
	}

	return (env: any) => new Promise((done) => {
		getInstallOutput().show(true);
		var outputFolder = determineOutputFolder();
		mkdirp.sync(outputFolder);
		var finalDestination = path.join(outputFolder, "serve-d" + (process.platform == "win32" ? ".exe" : ""));
		installationLog.appendLine("Installing into " + outputFolder);
		fs.exists(outputFolder, function (exists) {
			if (!exists)
				fs.mkdirSync(outputFolder);
			if (fs.existsSync(finalDestination))
				rimraf.sync(finalDestination);
			async.each(urls, installServeDEntry(outputFolder), async function (err: any) {
				if (err) {
					let r: string | undefined = await vscode.window.showErrorMessage("Failed to download release", "Compile from source");
					if (r == "Compile from source")
						return done(compileServeD(ref)(env));
					else
						return done(undefined);
				}
				else {
					await config(null).update("servedPath", finalDestination, true);
					installationLog.appendLine("Finished installing into " + finalDestination);
					done(true);
				}
			});
		});
	});
}

function installServeDEntry(outputFolder: string): (data: { url: string, title: string }, cb: Function) => any {
	return async ({ url, title }, cb: Function) => {
		installationLog.appendLine("Downloading from " + url + " into " + outputFolder);
		var ext = url.endsWith(".tar.xz") ? ".tar.xz" : url.endsWith(".tar.gz") ? ".tar.gz" : path.extname(url);
		var fileName = path.basename(url);
		var outputPath = path.join(outputFolder, fileName);
		let aborted = false;
		let stream = await downloadFileInteractive(url, title + " Download", () => {
			aborted = true;
			installationLog.appendLine("Aborted download");
			fs.unlink(outputPath, function () { });
		});

		stream.pipe(fs.createWriteStream(outputPath)).on("finish", () => {
			if (aborted) return;
			installationLog.appendLine("Extracting " + fileName);
			if (ext == ".zip") {
				try {
					new AdmZip(outputPath).extractAllTo(outputFolder);
					try {
						installationLog.appendLine("Deleting " + outputPath);
						fs.unlink(outputPath, (err) => {
							if (err)
								installationLog.appendLine("Failed to delete " + outputPath);
						});
					}
					catch (e) {
						vscode.window.showErrorMessage("Failed to delete temporary file: " + outputPath);
					}
					cb();
				}
				catch (e) {
					return cb(e);
				}
			}
			else if (ext == ".tar.xz" || ext == ".tar.gz") {
				var mod = ext == ".tar.xz" ? "J" : "z";
				installationLog.appendLine("> tar xvf" + mod + " " + fileName);
				ChildProcess.spawn("tar", ["xvf" + mod, fileName], {
					cwd: outputFolder
				}).on("exit", function (code) {
					if (code != 0) {
						return cb(code);
					}
					try {
						installationLog.appendLine("Deleting " + outputPath);
						fs.unlink(outputPath, (err) => {
							if (err)
								installationLog.appendLine("Failed to delete " + outputPath);
						});
					}
					catch (e) {
						vscode.window.showErrorMessage("Failed to delete temporary file: " + outputPath);
					}
					return cb();
				});
			}
		});
	};
}

export function extractServedBuiltDate(log: string): Date | false {
	var parsed = /Built: \w+\s+(\w+)\s+(\d+)\s+(\d+:\d+:\d+)\s+(\d+)/.exec(log);
	console.log("built serve-d: ", parsed);
	if (!parsed)
		return false;
	var month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(parsed[1].toLowerCase());
	if (month < 0)
		return false;
	var date = parseInt(parsed[2]);
	var parts = parsed[3].split(':');
	var year = parseInt(parsed[4]);
	var hour = parseInt(parts[0]);
	var minute = parseInt(parts[1]);
	var second = parseInt(parts[2]);
	if (isNaN(year) || isNaN(date) || isNaN(hour) || isNaN(minute) || isNaN(second))
		return false;
	return new Date(Date.UTC(year, month, date, hour, minute, second));
}

export function compileServeD(ref?: string): (env: NodeJS.ProcessEnv) => Promise<boolean | undefined> {
	return (env: any) => new Promise<boolean | undefined>((resolve) => {
		var outputFolder = determineOutputFolder();
		mkdirp.sync(outputFolder);
		fs.exists(outputFolder, async function (exists) {
			const dubPath = config(null).get("dubPath", "dub");
			const dmdPath = config(null).get("dmdPath", undefined);
			if (!exists)
				fs.mkdirSync(outputFolder);
			env["DFLAGS"] = "-O -release";
			let buildArgs = ["build"];
			if (process.platform == "win32") {
				env["DFLAGS"] = "-release";
				buildArgs.push("--arch=x86_mscoff");
			}
			if (dubPath != "dub" && dmdPath) {
				// explicit dub path specified, it won't automatically find dmd if it's not in the same folder so we just pass the path if we have it
				buildArgs.push("--compiler=" + dmdPath);
			}
			await compileDependency(outputFolder, "serve-d", "https://github.com/Pure-D/serve-d.git", [
				[dubPath, ["upgrade"]],
				[dubPath, buildArgs]
			], env, ref);
			var finalDestination = path.join(outputFolder, "serve-d", "serve-d" + (process.platform == "win32" ? ".exe" : ""));

			await config(null).update("servedPath", finalDestination, true);
			resolve(true);
		});
	});
}

function spawnCommand(cmd: string, args: string[], options: ChildProcess.SpawnOptions, cb: Function, onLog?: Function) {
	function log(chunk: any) {
		var dat = chunk.toString() || "null";
		installationLog.append(dat);
		if (typeof onLog === "function")
			onLog(dat);
	}

	installationLog.appendLine("> " + cmd + " " + args.join(" "));
	try {
		var proc = ChildProcess.spawn(cmd, args, options);
		if (proc.stdout)
			proc.stdout.on("data", log);
		if (proc.stderr)
			proc.stderr.on("data", log);

		proc.on("error", function (error: any) {
			if (((error ? error.message : "").toString()).endsWith("ENOENT")) {
				installationLog.appendLine("The program '" + cmd + "' could not be found! Did you perhaps not install it or misconfigure some path?");
			} else {
				installationLog.appendLine("An internal error occured while running the command: " + error);
			}
			cb(-1);
		});
		proc.on("exit", function (d: any) {
			return cb(typeof d == "number" ? d : (d.code || -1));
		});
	} catch (e) {
		installationLog.appendLine("An internal error occured while running the command: " + e);
		cb(-2);
	}
}

export function compileDependency(cwd: string, name: string, gitURI: string, commands: [string, string[]][], env: any, ref?: string): Promise<any> {
	return new Promise<any>((callback) => {
		if (!installationLog) {
			installationLog = vscode.window.createOutputChannel(installationTitle);
			extensionContext.subscriptions.push(installationLog);
		}
		installationLog.show(true);
		installationLog.appendLine("Installing into " + cwd);
		var error = function (err: any) {
			installationLog.appendLine("Failed to install " + name + " (Error code " + err + ")");
		};
		var newCwd = path.join(cwd, name);
		var startCompile = () => {
			const git = gitPath();
			spawnCommand(git, ["clone", "--recursive", gitURI, name], { cwd: cwd, env: env }, (err: any) => {
				if (err !== 0)
					return error(err);
				if (ref)
					commands.unshift([git, ["checkout", ref]]);
				async.eachSeries(commands, function (command: [string, string[]], cb: Function) {
					var failedArch = false;
					var prevLog = "";
					spawnCommand(command[0], command[1], {
						cwd: newCwd
					}, function (err: any) {
						var index = command[1].indexOf("--arch=x86_mscoff"); // must be this format for it to work
						if (err && failedArch && command[0] == "dub" && index != -1) {
							// failed because we tried to build with x86_mscoff but it wasn't available (LDC was probably used)
							// try again with x86
							command[1][index] = "--arch=x86";
							installationLog.appendLine("Retrying with --arch=x86...");
							spawnCommand(command[0], command[1], {
								cwd: newCwd
							}, function (err: any) {
								cb(err);
							});
						}
						else
							cb(err);
					}, function (log: string) {
						// concat with previous log just to make it very unlikely to split in middle because of buffering
						if ((prevLog + log).toLowerCase().indexOf("unsupported architecture: x86_mscoff") != -1) {
							failedArch = true;
						}
						prevLog = log;
					});
				}, function (err: any) {
					if (err)
						return error(err);
					installationLog.appendLine("Done compiling");
					callback(undefined);
				});
			});
		};
		if (fs.existsSync(newCwd)) {
			installationLog.appendLine("Removing old version");
			rmdir(newCwd, function (err: Error, dirs: any, files: any) {
				if (err)
					installationLog.appendLine(err.toString());
				installationLog.appendLine("Removed old version");
				startCompile();
			});
		}
		else startCompile();
	});
}

export function parseSimpleSemver(a: string): [number, number, number, (string | number)[]] {
	if (a.startsWith("~")) return [0, 0, 0, [a]];
	if (a.startsWith("v")) a = a.substr(1);

	const plus = a.indexOf('+');
	if (plus != -1) a = a.substr(0, plus);

	const hyphen = a.indexOf('-');
	let preRelease: (string | number)[] = [];
	if (hyphen != -1) {
		let part = a.substr(hyphen + 1);
		a = a.substr(0, hyphen);

		preRelease = part.split('.');
		for (let i = 0; i < preRelease.length; i++) {
			const n = parseInt(<string>preRelease[i]);
			if (isFinite(n))
				preRelease[i] = n;
		}
	}

	const parts = a.split('.');
	if (parts.length != 3)
		throw new Error("Version specification '" + a + "' not parsable by simple semver rules");
	return [parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]), preRelease];
}

export function cmpSemver(as: string, bs: string): number {
	const a = parseSimpleSemver(as);
	const b = parseSimpleSemver(bs);

	for (let i = 0; i < 3; i++) {
		if (a[i] < b[i]) return -1;
		else if (a[i] > b[i]) return 1;
	}

	// pre-release on a but not on b
	if (a[3].length > 0 && b[3].length == 0) return -1;
	// pre-release on b but not on a
	else if (a[3].length == 0 && b[3].length > 0) return 1;

	const min = Math.min(a[3].length, b[3].length);
	for (let i = 0; i < min; i++) {
		if (a[3][i] < b[3][i])
			return -1;
		else if (a[3][i] > b[3][i])
			return 1;
	}

	if (a[3].length == b[3].length) return 0;
	else if (a[3].length < b[3].length) return -1;
	else return 1;
}
