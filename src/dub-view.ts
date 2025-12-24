import * as vscode from "vscode";
import { extensionContext } from "./extension";

export interface DubDependencyInfo {
	name: string;
	failed?: boolean;
	version: string;
	path: string;
	description: string;
	homepage: string;
	authors: string[];
	copyright: string;
	license: string;
	subPackages: string[];
	hasDependencies: boolean;
	root: boolean;
}

export class DubDependency extends vscode.TreeItem {
	constructor(info: DubDependencyInfo, command?: vscode.Command, icon?: string);
	constructor(info: string, command?: vscode.Command, icon?: string);
	constructor(info: DubDependencyInfo | string, command?: vscode.Command, icon?: string) {
		super(
			typeof info == "string"
				? info
				: info.name + ":  " + info.version + (info.failed ? " (failed loading)" : ""),
			typeof info == "string" ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed,
		);
		if (typeof info == "object") {
			this.info = info;
			this.iconPath = {
				light: vscode.Uri.joinPath(extensionContext.extensionUri, "images", "dependency-light.svg"),
				dark: vscode.Uri.joinPath(extensionContext.extensionUri, "images", "dependency-dark.svg"),
			};
			this.command = {
				command: "code-d.viewDubPackage",
				title: "Open README",
				tooltip: "Open README",
				arguments: [info.path, info.name],
			};
			this.contextValue = info.root ? "root" : "dependency";
		}
		if (command) this.command = command;
		if (icon)
			this.iconPath = {
				light: vscode.Uri.joinPath(extensionContext.extensionUri, "images", icon + "-light.svg"),
				dark: vscode.Uri.joinPath(extensionContext.extensionUri, "images", icon + "-dark.svg"),
			};
	}

	info?: DubDependencyInfo;
}
