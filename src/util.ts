import * as vscode from "vscode";
var request = require("request");

export function req() {
	let proxy = vscode.workspace.getConfiguration("http").get("proxy", "");
	if (proxy)
		return request.defaults({ "proxy": proxy });
	else
		return request;
}
