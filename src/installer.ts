import * as ChildProcess from "child_process"
import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import { req } from "./util"
import { config } from "./extension"
import { platform } from "os";
var rimraf = require("rimraf");
var AdmZip = require("adm-zip");
var progress = require("request-progress");
var async = require("async");
var rmdir = require("rmdir");
var mkdirp = require("mkdirp");

export const TARGET_SERVED_VERSION: [number, number, number] = [0, 4, 1];

var extensionContext: vscode.ExtensionContext;

function gitPath() {
	return vscode.workspace.getConfiguration("git").get("path", "git") || "git";
}

export function setContext(context: vscode.ExtensionContext) {
	extensionContext = context;
}

function determineOutputFolder() {
	if (process.platform == "linux") {
		if (fs.existsSync(path.join((<any>process.env).HOME, ".local", "share")))
			return path.join((<any>process.env).HOME, ".local", "share", "code-d", "bin");
		else
			return path.join((<any>process.env).HOME, ".code-d", "bin");
	}
	else if (process.platform == "win32") {
		return path.join((<any>process.env).APPDATA, "code-d", "bin");
	}
	else {
		return path.join(extensionContext.extensionPath, "bin");
	}
}

var installationLog: vscode.OutputChannel;
const installationTitle = "code-d/serve-d installation progress";

export function getInstallOutput() {
	if (!installationLog) {
		installationLog = vscode.window.createOutputChannel(installationTitle);
		extensionContext.subscriptions.push(installationLog);
		installationLog.show(true);
	}
	return installationLog;
}

export function downloadFileInteractive(url: string, title: string, aborted: Function): any {
	var ret = progress(req()(url), {
		throttle: 100,
		delay: 100
	});
	var lastProgress = 0;
	vscode.window.withProgress({
		cancellable: true,
		location: vscode.ProgressLocation.Notification,
		title: title
	}, (progress, cancel) => {
		cancel.onCancellationRequested(() => {
			ret.abort();
			aborted();
		});
		ret.on("progress", (state: any) => {
			if (!isNaN(state.percent)) {
				var msg = "Downloaded " + (state.percent * 100).toFixed(2) + "%" + (state.time.remaining ? " (ETA " + state.time.remaining.toFixed(1) + "s)" : "");
				var increment = state.percent * 100 - lastProgress;
				lastProgress = state.percent * 100;
				progress.report({
					message: msg,
					increment: increment
				});
			}
		});
		return new Promise((resolve) => {
			ret.on("end", resolve);
		});
	}).then(function () {
		installationLog.appendLine("Finished downloading");
	});
	return ret;
}

export function downloadDub(env: any, done: (installed: boolean) => void) {
	var url = "";
	var ext = "";
	if (process.platform == "linux" && process.arch == "x64") {
		url = "https://code.dlang.org/files/dub-1.11.0-linux-x86_64.tar.gz";
		ext = ".tar.gz";
	}
	else if (process.platform == "linux" && process.arch == "ia32") {
		url = "https://code.dlang.org/files/dub-1.11.0-linux-x86.tar.gz";
		ext = ".tar.gz";
	}
	else if (process.platform == "linux" && process.arch == "arm") {
		url = "https://code.dlang.org/files/dub-1.1.0-linux-arm.tar.gz";
		ext = ".tar.gz";
	}
	else if (process.platform == "win32") {
		url = "https://code.dlang.org/files/dub-1.11.0-windows-x86.zip";
		ext = ".zip";
	}
	else if (process.platform == "darwin" && process.arch == "x64") {
		url = "https://code.dlang.org/files/dub-1.11.0-osx-x86_64.tar.gz";
		ext = ".tar.gz";
	}
	else
		return vscode.window.showErrorMessage("dub is not available for your platform");
	getInstallOutput().show(true);
	var outputFolder = determineOutputFolder();
	mkdirp.sync(outputFolder);
	var finalDestination = path.join(outputFolder, "dub" + (process.platform == "win32" ? ".exe" : ""));
	installationLog.appendLine("Installing into " + outputFolder);
	fs.exists(outputFolder, function (exists) {
		if (!exists)
			fs.mkdirSync(outputFolder);
		installationLog.appendLine("Downloading from " + url + " into " + outputFolder);
		var outputPath = path.join(outputFolder, "dub" + ext);
		downloadFileInteractive(url, "Dub Download", () => {
			installationLog.appendLine("Aborted download");
			fs.unlink(outputPath, function () { });
		}).pipe(fs.createWriteStream(outputPath)).on("finish", () => {
			installationLog.appendLine("Extracting dub");
			if (ext == ".zip") {
				new AdmZip(outputPath).extractAllTo(outputFolder);
				config(null).update("dubPath", finalDestination, true);
				installationLog.appendLine("Deleting " + outputPath);
				fs.unlink(outputPath, (err) => {
					if (err)
						installationLog.appendLine("Failed to delete " + outputPath);
				});
				done(true);
			}
			else if (ext == ".tar.gz") {
				installationLog.appendLine("> tar -zxvf dub" + ext);
				ChildProcess.spawn("tar", ["-zxvf", "dub" + ext], {
					cwd: outputFolder
				}).on("exit", function (code) {
					if (code != 0)
						return vscode.window.showErrorMessage("Failed to extract .tar.gz release");
					config(null).update("dubPath", finalDestination, true);
					installationLog.appendLine("Deleting " + outputPath);
					fs.unlink(outputPath, (err) => {
						if (err)
							installationLog.appendLine("Failed to delete " + outputPath);
					});
					return done(true);
				});
			}
		});
	});
	return undefined;
}

export function installServeD(env: any, done: Function) {
	var urls: string[];
	// TODO: platform checks here
	if (process.platform == "linux" && process.arch == "x64") {
		urls = [
			"https://github.com/Pure-D/serve-d/releases/download/v" + TARGET_SERVED_VERSION.join(".") + "/serve-d_" + TARGET_SERVED_VERSION.join(".") + "-linux-x86_64.tar.xz",
			"https://github.com/dlang-community/DCD/releases/download/v0.11.1/dcd-v0.11.1-linux-x86_64.tar.gz"
		];
	}
	else if (process.platform == "win32") {
		urls = [
			"https://github.com/Pure-D/serve-d/releases/download/v" + TARGET_SERVED_VERSION.join(".") + "/serve-d_" + TARGET_SERVED_VERSION.join(".") + "-windows.zip"
		];
		if (process.arch == "x64")
			urls.push("https://github.com/dlang-community/DCD/releases/download/v0.11.1/dcd-v0.11.1-windows-x86_64.zip");
		// else
		// 	urls.push("https://github.com/dlang-community/DCD/releases/download/v0.11.0/dcd-v0.11.0-windows-x86.zip");
	}
	else
		return vscode.window.showErrorMessage("No precompiled serve-d binary for this platform/architecture", "Compile from source").then((r?: string) => {
			if (r == "Compile from source")
				compileServeD(env, done);
		});
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
		async.each(urls, function (url: string, cb: Function) {
			installationLog.appendLine("Downloading from " + url + " into " + outputFolder);
			var ext = url.endsWith(".tar.xz") ? ".tar.xz" : url.endsWith(".tar.gz") ? ".tar.gz" : path.extname(url);
			var fileName = path.basename(url);
			var outputPath = path.join(outputFolder, fileName);
			downloadFileInteractive(url, "Serve-D Download", () => {
				installationLog.appendLine("Aborted download");
				fs.unlink(outputPath, function () { });
			}).pipe(fs.createWriteStream(outputPath)).on("finish", () => {
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
		}, function (err: any) {
			if (err) {
				vscode.window.showErrorMessage("Failed to download release", "Compile from source").then((r?: string) => {
					if (r == "Compile from source")
						compileServeD(env, done);
				});
			}
			else {
				config(null).update("servedPath", finalDestination, true);
				installationLog.appendLine("Finished installing into " + finalDestination);
				done(true);
			}
		});
	});
}

export function checkBetaServeD(callback: Function) {
	var proc = ChildProcess.spawn(config(null).get("servedPath", "serve-d"), ["--version"]);
	proc.on("error", () => {
		callback(false);
	});
	var output = "";
	proc.stdout.on('data', function (data) {
		output += data;
	});
	proc.stderr.on('data', function (data) {
		output += data;
	});
	proc.on("exit", (code) => {
		if (code == 0) {
			req().get({
				url: "https://api.github.com/repos/Pure-D/serve-d/commits/master",
				headers: {
					"User-Agent": "https://github.com/Pure-D/code-d"
				}
			}, (err: any, httpResponse: any, body: any) => {
				if (err)
					return callback(true);
				try {
					if (typeof body == "string")
						body = JSON.parse(body);
				}
				catch (e) {
					return callback(true);
				}
				var latest = new Date(body.commit.author.date);
				var parsed = /Built: \w+\s+(\w+)\s+(\d+)\s+(\d+:\d+:\d+)\s+(\d+)/.exec(output);
				if (!parsed)
					return callback(false);
				var month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(parsed[1].toLowerCase());
				if (month < 0)
					return callback(false);
				var date = parseInt(parsed[2]);
				var parts = parsed[3].split(':');
				var year = parseInt(parsed[4]);
				var hour = parseInt(parts[0]);
				var minute = parseInt(parts[1]);
				var second = parseInt(parts[2]);
				if (isNaN(year) || isNaN(date) || isNaN(hour) || isNaN(minute) || isNaN(second))
					return callback(false);
				var current = new Date(year, month, date, hour, minute, second);
				callback(current.getTime() >= latest.getTime());
			});
		}
		else
			callback(false);
	});
}

export function compileServeD(env: any, done: Function) {
	var outputFolder = determineOutputFolder();
	mkdirp.sync(outputFolder);
	fs.exists(outputFolder, function (exists) {
		if (!exists)
			fs.mkdirSync(outputFolder);
		env["DFLAGS"] = "-O -release";
		var buildArgs = ["build"];
		if (process.platform == "win32") {
			env["DFLAGS"] = "-release";
			buildArgs.push("--arch=x86_mscoff");
		}
		compileDependency(outputFolder, "serve-d", "https://github.com/Pure-D/serve-d.git", [
			[config(null).get("dubPath", "dub"), ["upgrade"]],
			[config(null).get("dubPath", "dub"), buildArgs]
		], function () {
			var finalDestination = path.join(outputFolder, "serve-d", "serve-d" + (process.platform == "win32" ? ".exe" : ""));

			config(null).update("servedPath", finalDestination, true);
			done(true);
		}, env);
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
		proc.stdout.on("data", log);
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

export function compileDependency(cwd: string, name: string, gitURI: string, commands: [string, string[]][], callback: Function, env: any) {
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
		spawnCommand(gitPath(), ["clone", "--recursive", gitURI, name], { cwd: cwd, env: env }, (err: any) => {
			if (err !== 0)
				return error(err);
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
				callback();
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
}
