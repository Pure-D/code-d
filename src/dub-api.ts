import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { reqJson } from "./util";
import { AxiosError } from "axios";

function dubAPI() {
	return reqJson("https://code.dlang.org/");
}

export function searchDubPackages(query: string): Thenable<unknown[]> {
	return dubAPI()
		.get("/api/packages/search?q=" + encodeURIComponent(query))
		.then((body) => {
			if (!Array.isArray(body?.data)) throw new Error("Unexpected reply from DUB API search");
			return body.data;
		})
		.catch((e: AxiosError | Error) => {
			throw "response" in e && e.response ? new Error("No packages found") : e;
		});
}

export function listPackages(): Thenable<unknown[]> {
	return dubAPI()
		.get("/packages/index.json")
		.then((body) => {
			if (!Array.isArray(body?.data)) throw new Error("Unexpected reply from DUB API search");
			return body.data;
		})
		.catch((e: AxiosError | Error) => {
			throw "response" in e && e.response ? new Error("No packages found") : e;
		});
}

let packageCache: vscode.QuickPickItem[];
let packageCacheDate = new Date(0);
export function listPackageOptions(): Thenable<vscode.QuickPickItem[]> {
	if (new Date().getTime() - packageCacheDate.getTime() < 15 * 60 * 1000) return Promise.resolve(packageCache);

	return dubAPI()
		.get<{ name: string; description: string; version: string }[]>("/api/packages/search")
		.then((body) => {
			const ret: vscode.QuickPickItem[] = [];
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

export function getPackageInfo(pkg: string): Thenable<unknown> {
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
		.get("/api/packages/" + encodeURIComponent(pkg) + "/latest/info")
		.then((body) => {
			const json = body.data;
			const subPackages: string[] = [];
			if (json.info.subPackages)
				json.info.subPackages.forEach((pkg: unknown) => {
					if (typeof pkg === "object" && pkg && "name" in pkg && typeof pkg.name === "string")
						subPackages.push(pkg.name);
					else console.error("Unexpected subpackage in DUB API response: ", pkg);
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
	addResult: (v: vscode.CompletionItem) => void,
): Thenable<void> {
	const folderOnly = ["path", "targetPath", "sourcePaths", "stringImportPaths", "importPaths"].indexOf(key) != -1;
	const fileRegex = ["copyFiles"].indexOf(key) != -1 ? null : /\.di?$/i;
	return new Promise((resolve, reject) => {
		if (currentValue != "") {
			const end = currentValue.lastIndexOf("/");
			if (end != -1) currentValue = currentValue.substr(0, end);
		}
		const dir = path.join(path.dirname(fileName), currentValue);
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

				const item = new vscode.CompletionItem(value, kind);
				if (file.isDirectory()) item.insertText = new vscode.SnippetString(value.slice(0, -1) + '${0}"');
				addResult(item);
			});
			resolve();
		});
	});
}
