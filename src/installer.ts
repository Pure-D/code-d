import * as ChildProcess from "child_process"
import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import { req } from "./util"
import { config } from "./extension"
var unzip = require("unzip");
var progress = require("request-progress");
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

function determineOutputFolder() {
	if (process.platform == "linux") {
		if (fs.existsSync(path.join(process.env.HOME, ".local", "share")))
			return path.join(process.env.HOME, ".local", "share", "code-d", "bin");
		else
			return path.join(process.env.HOME, ".code-d", "bin");
	}
	else if (process.platform == "win32") {
		return path.join(process.env.APPDATA, "code-d", "bin");
	}
	else {
		return path.join(extensionContext.extensionPath, "bin");
	}
}

var installationLog: vscode.OutputChannel;
const installationTitle = "code-d installation progress";

export function downloadDub(env, done: Function) {
	var url = "";
	var ext = "";
	if (process.platform == "linux" && process.arch == "x64") {
		url = "https://code.dlang.org/files/dub-1.4.0-linux-x86_64.tar.gz";
		ext = ".tar.gz";
	}
	else if (process.platform == "linux" && process.arch == "ia32") {
		url = "https://code.dlang.org/files/dub-1.4.0-linux-x86.tar.gz";
		ext = ".tar.gz";
	}
	else if (process.platform == "linux" && process.arch == "arm") {
		url = "https://code.dlang.org/files/dub-1.0.0-linux-arm.tar.gz";
		ext = ".tar.gz";
	}
	else if (process.platform == "win32") {
		url = "https://code.dlang.org/files/dub-1.4.0-windows-x86.zip";
		ext = ".zip";
	}
	else if (process.platform == "darwin" && process.arch == "x64") {
		url = "https://code.dlang.org/files/dub-1.4.0-osx-x86_64.tar.gz";
		ext = ".tar.gz";
	}
	else
		return vscode.window.showErrorMessage("dub is not available for your platform");
	if (!installationLog) {
		installationLog = vscode.window.createOutputChannel(installationTitle);
		extensionContext.subscriptions.push(installationLog);
	}
	installationLog.show(true);
	var outputFolder = determineOutputFolder();
	mkdirp.sync(outputFolder);
	var finalDestination = path.join(outputFolder, "dub" + (process.platform == "win32" ? ".exe" : ""));
	installationLog.appendLine("Installing into " + outputFolder);
	fs.exists(outputFolder, function (exists) {
		if (!exists)
			fs.mkdirSync(outputFolder);
		installationLog.appendLine("Downloading from " + url + " into " + outputFolder);
		var outputPath = path.join(outputFolder, "dub" + ext);
		progress(req()(url)).on("progress", (state) => {
			if (!isNaN(state.percentage))
				installationLog.appendLine("Downloaded " + (state.percentage * 100).toFixed(2) + "%" + (state.time.remaining ? " (ETA " + state.time.remaining.toFixed(1) + "s)" : ""));
		}).pipe(fs.createWriteStream(outputPath)).on("finish", () => {
			installationLog.appendLine("Extracting dub");
			if (ext == ".zip") {
				fs.createReadStream(outputPath).pipe(unzip.Extract({ path: outputFolder })).on("finish", () => {
					config().update("dubPath", finalDestination, true);
					installationLog.appendLine("Deleting " + outputPath);
					fs.unlink(outputPath);
					done(true);
				});
			}
			else if (ext == ".tar.gz") {
				installationLog.appendLine("> tar -zxvf dub" + ext);
				ChildProcess.spawn("tar", ["-zxvf", "dub" + ext], {
					cwd: outputFolder
				}).on("exit", function (code) {
					if (code != 0)
						return vscode.window.showErrorMessage("Failed to extract .tar.gz release");
					config().update("dubPath", finalDestination, true);
					installationLog.appendLine("Deleting " + outputPath);
					fs.unlink(outputPath);
					done(true);
				});
			}
		});
	});
}

export function compileServeD(env, done) {
	var outputFolder = determineOutputFolder();
	mkdirp.sync(outputFolder);
	fs.exists(outputFolder, function (exists) {
		if (!exists)
			fs.mkdirSync(outputFolder);
		var buildArgs = ["build", "--build=release"];
		if (process.platform == "win32") {
			buildArgs.push("--compiler=ldc2");
			buildArgs.push("--combined");
		}
		compileDependency(outputFolder, "serve-d", "https://github.com/Pure-D/serve-d.git", [
			[config().get("dubPath", "dub"), ["upgrade"]],
			[config().get("dubPath", "dub"), buildArgs]
		], function () {
			var finalDestination = path.join(outputFolder, "serve-d", "serve-d" + (process.platform == "win32" ? ".exe" : ""));

			config().update("servedPath", finalDestination, true);
			done(true);
		}, env);
	});
}

function spawnCommand(cmd: string, args: string[], options: ChildProcess.SpawnOptions, cb) {
	installationLog.appendLine("> " + cmd + " " + args.join(" "));
	var proc = ChildProcess.spawn(cmd, args, options);
	proc.stdout.on("data", function (chunk) {
		installationLog.append(chunk.toString() || "null");
	});
	proc.stderr.on("data", function (chunk) {
		installationLog.append(chunk.toString() || "null");
	});
	proc.on("exit", function (d: any) {
		return cb(typeof d == "number" ? d : (d.code || -1));
	});
}

export function compileDependency(cwd, name, gitURI, commands, callback, env) {
	if (!installationLog) {
		installationLog = vscode.window.createOutputChannel(installationTitle);
		extensionContext.subscriptions.push(installationLog);
	}
	installationLog.show(true);
	installationLog.appendLine("Installing into " + cwd);
	var error = function (err) {
		installationLog.appendLine("Failed to install " + name + " (Error code " + err + ")");
	};
	var newCwd = path.join(cwd, name);
	var startCompile = () => {
		spawnCommand(gitPath(), ["clone", "--recursive", gitURI, name], { cwd: cwd, env: env }, (err) => {
			if (err !== 0)
				return error(err);
			async.eachSeries(commands, function (command, cb) {
				spawnCommand(command[0], command[1], {
					cwd: newCwd
				}, function (err) {
					cb(err);
				});
			}, function (err) {
				if (err)
					return error(err);
				installationLog.appendLine("Done compiling");
				callback();
			});
		});
	};
	if (fs.existsSync(newCwd)) {
		installationLog.appendLine("Removing old version");
		rmdir(newCwd, function (err: Error, dirs, files) {
			if (err)
				installationLog.appendLine(err.toString());
			installationLog.appendLine("Removed old version");
			startCompile();
		});
	}
	else startCompile();
}
