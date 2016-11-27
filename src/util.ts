import * as vscode from "vscode";
var request = require("request");

export function req() {
	let proxy = vscode.workspace.getConfiguration("http").get("proxy", "");
	if (proxy)
		return request.defaults({ "proxy": proxy });
	else
		return request;
}

export function uploadCode(title: string, syntax: string, code: string): Thenable<string> {
	return new Promise((resolve, reject) => {
		req().post('http://dpaste.com/api/v2/', { form: { content: code, syntax: syntax, title: title, expiry_days: 7 } }, (err, httpResponse, body) => {
			if (err)
				return reject(err);
			resolve(body);
		});
	});
}