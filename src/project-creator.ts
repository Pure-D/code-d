import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"

var ncp = require("ncp").ncp;

export interface Template {
	label: string;
	description: string;
	detail: string;
	id: string;
	json: JSON;
}

export function getTemplates(context: vscode.ExtensionContext): Thenable<Template[]> {
	return new Promise((resolve) => {
		fs.readFile(path.join(context.extensionPath, "templates", "info.json"), function (err, data) {
			if (err) {
				console.log(err);
				return vscode.window.showErrorMessage("Failed to read template list");
			}
			var templates = JSON.parse(data.toString());
			var result: Template[] = [];
			templates.forEach((template: any) => {
				result.push({
					label: template.name,
					description: "",
					detail: template.detail,
					id: template.path,
					json: template.dub
				});
			});
			return resolve(result);
		});
	});
}

export function showProjectCreator(context: vscode.ExtensionContext) {
	vscode.window.showQuickPick(getTemplates(context), {
		ignoreFocusOut: true,
		matchOnDescription: true,
		matchOnDetail: true
	}).then((template) => {
		if (!template)
			return undefined;
		var folders = vscode.workspace.workspaceFolders;
		if (folders == undefined || folders.length == 0)
			return vscode.window.showInformationMessage("Select an empty folder to create the project in", "Select Folder").then(r => {
				if (r == "Select Folder") {
					context.globalState.update("create-template", template.id);
					openFolderWithExtension(context);
				}
			});
		var path = folders[0].uri.fsPath;
		return fs.readdir(path, function (err, files) {
			if (files.length == 0)
				return performTemplateCopy(context, template.id, template.json, path, function () {
					vscode.commands.executeCommand("workbench.action.reloadWindow");
				});
			else
				return vscode.window.showWarningMessage("The current workspace is not empty!", "Select other Folder", "Merge into Folder").then(r => {
					if (r == "Select other Folder") {
						context.globalState.update("create-template", template.id);
						openFolderWithExtension(context);
					} else if (r == "Merge into Folder") {
						performTemplateCopy(context, template.id, template.json, path, function () {
							vscode.commands.executeCommand("workbench.action.reloadWindow");
						});
					}
				});
		});
	});
}

export function openFolderWithExtension(context: vscode.ExtensionContext) {
	var pkgPath = path.join(context.extensionPath, "package.json");
	fs.readFile(pkgPath, function (err, data) {
		if (err)
			return vscode.window.showErrorMessage("Failed to reload. Reload manually and run some code-d command!");
		return fs.writeFile(pkgPath + ".bak", data, function (err) {
			if (err)
				return vscode.window.showErrorMessage("Failed to reload. Reload manually and run some code-d command!");
			var json = JSON.parse(data.toString());
			json.activationEvents = ["*"];
			return fs.writeFile(pkgPath, JSON.stringify(json), function (err) {
				if (err)
					return vscode.window.showErrorMessage("Failed to reload. Reload manually and run some code-d command!");
				context.globalState.update("restorePackageBackup", true);
				vscode.commands.executeCommand("vscode.openFolder");
				return undefined;
			});
		});
	});
}

export function restoreCreateProjectPackageBackup(context: vscode.ExtensionContext): Promise<boolean | undefined> {
	return new Promise<boolean | undefined>((resolve) => {
		if (context.globalState.get("restorePackageBackup", false)) {
			context.globalState.update("restorePackageBackup", false);
			var pkgPath = path.join(context.extensionPath, "package.json");
			fs.readFile(pkgPath + ".bak", function (err, data) {
				if (err) {
					resolve(false);
					return vscode.window.showErrorMessage("Failed to restore after reload! Please reinstall code-d if problems occur before reporting!");
				}
				return fs.writeFile(pkgPath, data, function (err) {
					if (err) {
						resolve(false);
						return vscode.window.showErrorMessage("Failed to restore after reload! Please reinstall code-d if problems occur before reporting!");
					}

					return fs.unlink(pkgPath + ".bak", function (err: any) {
						resolve(!err);
						console.error(err.toString());
					});
				});
			});
		} else {
			resolve(undefined);
		}
	});
}

function createDubName(folderName: string) {
	var res = folderName[0].toLowerCase();
	for (var i = 1; i < folderName.length; i++) {
		if (folderName[i] == folderName[i].toUpperCase() && // Is upper case
			folderName[i] != folderName[i].toLowerCase()) {
			res += "-";
			res += folderName[i].toLowerCase();
		}
		else res += folderName[i];
	}
	return res.replace(/[^a-z0-9_]+/g, "-").replace(/^-|-$/g, "");
}

export function performTemplateCopy(context: vscode.ExtensionContext, templateName: string, dubJson: any, resultPath: string, callback: Function) {
	var baseName = path.basename(resultPath);
	dubJson["name"] = createDubName(baseName);
	ncp(path.join(context.extensionPath, "templates", templateName), resultPath, { clobber: false }, function (err: any) {
		if (err) {
			console.log(err);
			return vscode.window.showErrorMessage("Failed to copy template");
		}
		return fs.writeFile(path.join(resultPath, "dub.json"), JSON.stringify(dubJson, null, '\t'), function (err) {
			if (err) {
				console.log(err);
				return vscode.window.showErrorMessage("Failed to generate dub.json");
			}
			return callback();
		});
	});
}