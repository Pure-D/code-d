import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { reqJson } from "./util";
import { AxiosError } from "axios";

function dubAPI() {
	return reqJson("https://code.dlang.org/");
}

export function searchDubPackages(query: string): Thenable<any[]> {
	return dubAPI()
		.get("/api/packages/search?q=" + encodeURIComponent(query))
		.then((body) => {
			return body.data;
		})
		.catch((e: AxiosError) => {
			throw e.response ? "No packages found" : e;
		});
}

export function listPackages(): Thenable<any[]> {
	return dubAPI()
		.get("/packages/index.json")
		.then((body) => {
			return body.data;
		})
		.catch((e: AxiosError) => {
			throw e.response ? "No packages found" : e;
		});
}

var packageCache: any;
var packageCacheDate = new Date(0);
export function listPackageOptions(): Thenable<vscode.QuickPickItem[]> {
	if (new Date().getTime() - packageCacheDate.getTime() < 15 * 60 * 1000) return Promise.resolve(packageCache);

	return dubAPI()
		.get<{ name: string; description: string; version: string }[]>("/api/packages/search")
		.then((body) => {
			var ret: vscode.QuickPickItem[] = [];
			body.data.forEach((element) => {
				ret.push({
					label: element.name,
					description: element.version,
					detail: element.description,
				});
			});
			packageCache = ret;
			packageCacheDate = new Date();
			return ret;
		})
		.catch((e: AxiosError) => {
			throw e.response ? "No packages found" : e;
		});
}

export function getPackageInfo(pkg: string): Thenable<any> {
	return dubAPI()
		.get("/api/packages/" + encodeURIComponent(pkg) + "/info")
		.then((body) => {
			return body.data;
		})
		.catch((e: AxiosError) => {
			throw e.response ? "No packages found" : e;
		});
}

export function getLatestPackageInfo(pkg: string): Thenable<{
	description?: string;
	version?: string;
	subPackages?: string[];
	readme?: string;
	readmeMarkdown?: boolean;
	license?: string;
	copyright?: string;
}> {
	return dubAPI()
		.get<any>("/api/packages/" + encodeURIComponent(pkg) + "/latest/info")
		.then((body) => {
			var json = body.data;
			var subPackages: string[] = [];
			if (json.info.subPackages)
				json.info.subPackages.forEach((pkg: any) => {
					subPackages.push(pkg.name);
				});
			return {
				version: json.version,
				description: json.info.description,
				license: json.info.license,
				copyright: json.info.copyright,
				subPackages: subPackages,
				readme: json.readme,
				readmeMarkdown: json.readmeMarkdown,
			};
		});
}

export function autoCompletePath(
	fileName: string,
	key: string,
	currentValue: string,
	addResult: (v: vscode.CompletionItem) => any,
): Thenable<any> {
	let folderOnly = ["path", "targetPath", "sourcePaths", "stringImportPaths", "importPaths"].indexOf(key) != -1;
	let fileRegex = ["copyFiles"].indexOf(key) != -1 ? null : /\.di?$/i;
	return new Promise((resolve, reject) => {
		if (currentValue != "") {
			let end = currentValue.lastIndexOf("/");
			if (end != -1) currentValue = currentValue.substr(0, end);
		}
		let dir = path.join(path.dirname(fileName), currentValue);
		fs.readdir(dir, { withFileTypes: true }, (err, files) => {
			if (err) return reject(err);

			files.forEach((file) => {
				if (file.name[0] == ".") return;
				if (folderOnly && !file.isDirectory()) return;
				if (!file.isDirectory() && fileRegex && !fileRegex.exec(file.name)) return;

				let kind: vscode.CompletionItemKind = vscode.CompletionItemKind.Text;
				if (file.isSymbolicLink()) kind = vscode.CompletionItemKind.Reference;
				else if (file.isDirectory()) kind = vscode.CompletionItemKind.Folder;
				else if (file.isFile()) kind = vscode.CompletionItemKind.File;

				let value = path.join(currentValue, file.name).replace(/\\/g, "/");
				if (file.isDirectory() && !folderOnly) value += "/";
				value = JSON.stringify(value);

				let item = new vscode.CompletionItem(value, kind);
				if (file.isDirectory()) item.insertText = new vscode.SnippetString(value.slice(0, -1) + '${0}"');
				addResult(item);
			});
			resolve(null);
		});
	});
}
