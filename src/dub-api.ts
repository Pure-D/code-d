import * as vscode from "vscode";
var request = require("request");

function req() {
	let proxy = vscode.workspace.getConfiguration("http").get("proxy", "");
	if (proxy)
		return request.defaults({ "proxy": proxy });
	else
		return request;
}

export function searchDubPackages(query: string): Thenable<any[]> {
	return new Promise((resolve, reject) => {
		req()("https://code.dlang.org/api/packages/search?q=" + encodeURIComponent(query), function (error, response, body) {
			if (error || response.statusCode != 200)
				return reject(error || "No packages found");
			var json: any[] = JSON.parse(body);
			resolve(json);
		});
	});
}

export function listPackages(): Thenable<any[]> {
	return new Promise((resolve, reject) => {
		req()("https://code.dlang.org/packages/index.json", function (error, response, body) {
			if (error || response.statusCode != 200)
				return reject(error || "No packages found");
			var json: any[] = JSON.parse(body);
			resolve(json);
		});
	});
}

export function getPackageInfo(pkg: string): Thenable<any> {
	return new Promise((resolve, reject) => {
		req()("https://code.dlang.org/api/packages/" + encodeURIComponent(pkg) + "/info", function (error, response, body) {
			if (error || response.statusCode != 200)
				return reject(error || "Package not found");
			var json: any = JSON.parse(body);
			resolve(json);
		});
	});
}

export function getLatestPackageInfo(pkg: string): Thenable<{ description?: string; version?: string; subPackages?: string[] }> {
	return new Promise((resolve, reject) => {
		req()("https://code.dlang.org/api/packages/" + encodeURIComponent(pkg) + "/latest/info", function (error, response, body) {
			if (error || response.statusCode != 200)
				return reject(error);
			var json = JSON.parse(body);
			var subPackages = [];
			if (json.info.subPackages)
				json.info.subPackages.forEach(pkg => {
					subPackages.push(pkg.name);
				});
			resolve({
				version: json.version,
				description: json.info.description,
				subPackages: subPackages
			});
		});
	});
}