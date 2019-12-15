import * as vscode from "vscode";
import { reqJson } from "./util";
import { AxiosError } from "axios";

function dubAPI() {
	return reqJson("https://code.dlang.org/");
}

export function searchDubPackages(query: string): Thenable<any[]> {
	return dubAPI().get("/api/packages/search?q=" + encodeURIComponent(query))
		.then((body) => {
			return body.data;
		}).catch((e: AxiosError) => {
			throw e.response ? "No packages found" : e;
		});
}

export function listPackages(): Thenable<any[]> {
	return dubAPI().get("/packages/index.json")
		.then((body) => {
			return body.data;
		}).catch((e: AxiosError) => {
			throw e.response ? "No packages found" : e;
		});
}

var packageCache: any;
var packageCacheDate = new Date(0);
export function listPackageOptions(): Thenable<vscode.QuickPickItem[]> {
	if (new Date().getTime() - packageCacheDate.getTime() < 15 * 60 * 1000)
		return Promise.resolve(packageCache);

	return dubAPI().get<{ name: string, description: string, version: string }[]>("/api/packages/search").then((body) => {
		var ret: vscode.QuickPickItem[] = [];
		body.data.forEach(element => {
			ret.push({
				label: element.name,
				description: element.version,
				detail: element.description
			})
		});
		packageCache = ret;
		packageCacheDate = new Date();
		return ret;
	}).catch((e: AxiosError) => {
		throw e.response ? "No packages found" : e;
	});
}

export function getPackageInfo(pkg: string): Thenable<any> {
	return dubAPI().get("/api/packages/" + encodeURIComponent(pkg) + "/info")
		.then((body) => {
			return body.data;
		}).catch((e: AxiosError) => {
			throw e.response ? "No packages found" : e;
		});
}

export function getLatestPackageInfo(pkg: string): Thenable<{ description?: string; version?: string; subPackages?: string[] }> {
	return dubAPI().get("/api/packages/" + encodeURIComponent(pkg) + "/latest/info")
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
				subPackages: subPackages
			};
		});
}