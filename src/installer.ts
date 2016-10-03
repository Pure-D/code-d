import * as ChildProcess from "child_process"
import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
var request = require("request");
var unzip = require("unzip");
var progress = require('request-progress');
var async = require('async');

var extensionContext: vscode.ExtensionContext;

export function setContext(context: vscode.ExtensionContext) {
	extensionContext = context;
}

export function installWorkspaceD() {
	var url = "";
	var ext = "";
	if (process.platform == "linux" && process.arch == "x64") {
		url = "https://github.com/Pure-D/workspace-d/releases/download/v2.7.2/workspace-d_2.7.2-linux-x86_64.tar.xz";
		ext = ".tar.xz";
	}
	else if (process.platform == "win32") {
		url = "https://github.com/Pure-D/workspace-d/releases/download/v2.7.2/workspace-d-2.7.2-windows.zip";
		ext = ".zip";
	}
	else
		return vscode.window.showErrorMessage("No precompiled workspace-d binary for this platform/architecture", "Compile from source").then((r) => {
			if (r == "Compile from source")
				compileWorkspaceD();
		});
	var output = vscode.window.createOutputChannel("workspace-d installation progress");
	extensionContext.subscriptions.push(output);
	output.show(true);
	var outputFolder = path.join(extensionContext.extensionPath, "bin");
	var finalDestination = path.join(outputFolder, "workspace-d" + (process.platform == "win32" ? ".exe" : ""));
	output.appendLine("Installing into " + outputFolder);
	fs.exists(outputFolder, function (exists) {
		if (!exists)
			fs.mkdirSync(outputFolder);
		output.appendLine("Downloading from " + url + " into " + outputFolder);
		var outputPath = path.join(outputFolder, "workspace-d" + ext);
		progress(request(url)).on("progress", (state) => {
			output.appendLine("Downloaded " + (state.percentage * 100).toFixed(2) + "%" + (state.time.remaining ? " (ETA " + state.time.remaining.toFixed(1) + "s)" : ""));
		}).pipe(fs.createWriteStream(outputPath)).on("finish", () => {
			output.appendLine("Extracting workspace-d");
			if (ext == ".zip") {
				fs.createReadStream(outputPath).pipe(unzip.Extract({ path: outputFolder })).on("finish", () => {
					extensionContext.globalState.update("workspace-d_path", finalDestination);
					output.appendLine("Deleting " + outputPath);
					fs.unlink(outputPath);
					vscode.window.showInformationMessage("workspace-d successfully installed", "Reload").then((r) => {
						if (r == "Reload")
							vscode.commands.executeCommand("workbench.action.reloadWindow");
					});
				});
			}
			else if (ext == ".tar.xz") {
				output.appendLine("> tar xvfJ workspace-d" + ext);
				ChildProcess.spawn("tar", ["xvfJ", "workspace-d" + ext], {
					cwd: outputFolder
				}).on("exit", function (code) {
					if (code != 0)
						return vscode.window.showErrorMessage("Failed to extract .tar.xz release", "Compile from source").then((r) => {
							if (r == "Compile from source")
								compileWorkspaceD();
						});
					extensionContext.globalState.update("workspace-d_path", finalDestination);
					output.appendLine("Deleting " + outputPath);
					fs.unlink(outputPath);
					vscode.window.showInformationMessage("workspace-d successfully installed", "Reload").then((r) => {
						if (r == "Reload")
							vscode.commands.executeCommand("workbench.action.reloadWindow");
					});
				});
			}
		});
	});
}

export function downloadDub() {
	var url = "";
	var ext = "";
	if (process.platform == "linux" && process.arch == "x64") {
		url = "https://code.dlang.org/files/dub-1.0.0-linux-x86_64.tar.gz";
		ext = ".tar.gz";
	}
	else if (process.platform == "linux" && process.arch == "ia32") {
		url = "https://code.dlang.org/files/dub-1.0.0-linux-x86.tar.gz";
		ext = ".tar.gz";
	}
	else if (process.platform == "linux" && process.arch == "arm") {
		url = "https://code.dlang.org/files/dub-1.0.0-linux-arm.tar.gz";
		ext = ".tar.gz";
	}
	else if (process.platform == "win32") {
		url = "https://code.dlang.org/files/dub-1.0.0-windows-x86.zip";
		ext = ".zip";
	}
	else if (process.platform == "darwin" && process.arch == "x64") {
		url = "https://code.dlang.org/files/dub-1.0.0-osx-x86_64.tar.gz";
		ext = ".tar.gz";
	}
	else
		return vscode.window.showErrorMessage("dub is not available for your platform");
	var output = vscode.window.createOutputChannel("dub installation progress");
	extensionContext.subscriptions.push(output);
	output.show(true);
	var outputFolder = path.join(extensionContext.extensionPath, "bin");
	var finalDestination = path.join(outputFolder, "dub" + (process.platform == "win32" ? ".exe" : ""));
	output.appendLine("Installing into " + outputFolder);
	fs.exists(outputFolder, function (exists) {
		if (!exists)
			fs.mkdirSync(outputFolder);
		output.appendLine("Downloading from " + url + " into " + outputFolder);
		var outputPath = path.join(outputFolder, "dub" + ext);
		progress(request(url)).on("progress", (state) => {
			output.appendLine("Downloaded " + (state.percentage * 100).toFixed(2) + "%" + (state.time.remaining ? " (ETA " + state.time.remaining.toFixed(1) + "s)" : ""));
		}).pipe(fs.createWriteStream(outputPath)).on("finish", () => {
			output.appendLine("Extracting dub");
			if (ext == ".zip") {
				fs.createReadStream(outputPath).pipe(unzip.Extract({ path: outputFolder })).on("finish", () => {
					extensionContext.globalState.update("dub_path", finalDestination);
					output.appendLine("Deleting " + outputPath);
					fs.unlink(outputPath);
					vscode.window.showInformationMessage("dub successfully installed", "Reload").then((r) => {
						if (r == "Reload")
							vscode.commands.executeCommand("workbench.action.reloadWindow");
					});
				});
			}
			else if (ext == ".tar.gz") {
				output.appendLine("> tar -zxvf dub" + ext);
				ChildProcess.spawn("tar", ["-zxvf", "dub" + ext], {
					cwd: outputFolder
				}).on("exit", function (code) {
					if (code != 0)
						return vscode.window.showErrorMessage("Failed to extract .tar.gz release");
					extensionContext.globalState.update("dub_path", finalDestination);
					output.appendLine("Deleting " + outputPath);
					fs.unlink(outputPath);
					vscode.window.showInformationMessage("dub successfully installed", "Reload").then((r) => {
						if (r == "Reload")
							vscode.commands.executeCommand("workbench.action.reloadWindow");
					});
				});
			}
		});
	});
}

export function compileWorkspaceD() {
	var outputFolder = path.join(extensionContext.extensionPath, "bin");
	fs.exists(outputFolder, function (exists) {
		if (!exists)
			fs.mkdirSync(outputFolder);
		var buildArgs = ["build", "--build=release"];
		if (process.platform == "win32")
			buildArgs.push("--compiler=ldc2");
		compileDependency(outputFolder, "workspace-d", "https://github.com/Pure-D/workspace-d.git", [
			["dub", ["upgrade"]],
			["dub", buildArgs]
		], function () {
			var finalDestination = path.join(outputFolder, "workspace-d", "workspace-d" + (process.platform == "win32" ? ".exe" : ""));

			extensionContext.globalState.update("workspace-d_path", finalDestination);
			vscode.window.showInformationMessage("workspace-d successfully installed", "Reload").then((r) => {
				if (r == "Reload")
					vscode.commands.executeCommand("workbench.action.reloadWindow");
			});
		});
	});
}

export function compileDScanner() {
	var outputFolder = path.join(extensionContext.extensionPath, "bin");
	fs.exists(outputFolder, function (exists) {
		if (!exists)
			fs.mkdirSync(outputFolder);
		compileDependency(outputFolder, "Dscanner", "https://github.com/Hackerpilot/Dscanner.git", [
			["git", ["submodule", "update", "--init", "--recursive"]],
			process.platform == "win32" ? ["cmd.exe", ["/c", "build.bat"]] : ["make", []]
		], function () {
			var finalDestination = path.join(outputFolder, "Dscanner", "bin", "dscanner" + (process.platform == "win32" ? ".exe" : ""));

			extensionContext.globalState.update("dscanner_path", finalDestination);
			vscode.window.showInformationMessage("Dscanner successfully installed", "Reload").then((r) => {
				if (r == "Reload")
					vscode.commands.executeCommand("workbench.action.reloadWindow");
			});
		});
	});
}

export function compileDfmt() {
	var outputFolder = path.join(extensionContext.extensionPath, "bin");
	fs.exists(outputFolder, function (exists) {
		if (!exists)
			fs.mkdirSync(outputFolder);
		compileDependency(outputFolder, "dfmt", "https://github.com/Hackerpilot/dfmt.git", [
			["git", ["submodule", "update", "--init", "--recursive"]],
			process.platform == "win32" ? ["cmd.exe", ["/c", "build.bat"]] : ["make", []]
		], function () {
			var finalDestination = path.join(outputFolder, "dfmt", "bin", "dfmt" + (process.platform == "win32" ? ".exe" : ""));

			extensionContext.globalState.update("dfmt_path", finalDestination);
			vscode.window.showInformationMessage("dfmt successfully installed", "Reload").then((r) => {
				if (r == "Reload")
					vscode.commands.executeCommand("workbench.action.reloadWindow");
			});
		});
	});
}

export function compileDCD() {
	var outputFolder = path.join(extensionContext.extensionPath, "bin");
	fs.exists(outputFolder, function (exists) {
		if (!exists)
			fs.mkdirSync(outputFolder);
		compileDependency(outputFolder, "DCD", "https://github.com/Hackerpilot/DCD.git", [
			["git", ["submodule", "update", "--init", "--recursive"]],
			process.platform == "win32" ? ["cmd.exe", ["/c", "build.bat"]] : ["make", []]
		], function () {
			var finalDestinationClient = path.join(outputFolder, "DCD", "bin", "dcd-client" + (process.platform == "win32" ? ".exe" : ""));
			var finalDestinationServer = path.join(outputFolder, "DCD", "bin", "dcd-server" + (process.platform == "win32" ? ".exe" : ""));

			extensionContext.globalState.update("dcdClient_path", finalDestinationClient);
			extensionContext.globalState.update("dcdServer_path", finalDestinationServer);
			vscode.window.showInformationMessage("DCD successfully installed", "Reload").then((r) => {
				if (r == "Reload")
					vscode.commands.executeCommand("workbench.action.reloadWindow");
			});
		});
	});
}

function spawnCommand(output: vscode.OutputChannel, cmd: string, args: string[], options: ChildProcess.SpawnOptions, cb) {
	output.appendLine("> " + cmd + " " + args.join(" "));
	var proc = ChildProcess.spawn(cmd, args, options);
	proc.stdout.on("data", function (chunk) {
		output.append(chunk.toString() || "null");
	});
	proc.stderr.on("data", function (chunk) {
		output.append(chunk.toString() || "null");
	});
	proc.on("exit", function (d) {
		return cb(typeof d == "number" ? d : (d.code || -1));
	});
}

export function compileDependency(cwd, name, gitPath, commands, callback) {
	var output = vscode.window.createOutputChannel(name + " installation progress");
	extensionContext.subscriptions.push(output);
	output.show(true);
	output.appendLine("Installing into " + cwd);
	var error = function (err) {
		output.appendLine("Failed to install " + name + " (Error code " + err + ")");
	};
	spawnCommand(output, "git", ["clone", gitPath, name], { cwd: cwd }, (err) => {
		if (err !== 0)
			return error(err);
		var newCwd = path.join(cwd, name);
		async.eachSeries(commands, function (command, cb) {
			spawnCommand(output, command[0], command[1], {
				cwd: newCwd
			}, function (err) {
				cb(err);
			});
		}, function (err) {
			if (err)
				return error(err);
			output.appendLine("Done compiling");
			callback();
		});
	});
}

export function fixConfigExePaths(cb) {
	var checks = ["workspace-d_path", "dub_path", "dscanner_path", "dfmt_path", "dcdClient_path", "dcdServer_path"];
	async.each(checks, function (path, cb) {
		var val = <string>extensionContext.globalState.get(path);
		if (val) {
			fs.exists(val, function (exists) {
				if (!exists)
					extensionContext.globalState.update(path, undefined).then(() => { cb(); });
			});
		}
		else cb();
	}, function (err) {
		cb();
	});
}