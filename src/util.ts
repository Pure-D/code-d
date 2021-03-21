import * as vscode from "vscode";
import axiosLib = require("axios");
import { currentVersion } from "./extension";
export const axios = axiosLib.default;

export function reqType(type: axiosLib.ResponseType, baseURL?: string | undefined): axiosLib.AxiosInstance {
	let proxy = vscode.workspace.getConfiguration("http").get("proxy", "");
	if (proxy)
		process.env["http_proxy"] = proxy;

	return axios.create({
		baseURL,
		responseType: type,
		timeout: 10000,
		headers: {
			"User-Agent": "code-d/" + currentVersion + " (github:Pure-D/code-d)"
		}
	});
}

export function reqJson(baseURL?: string | undefined): axiosLib.AxiosInstance {
	return reqType("json", baseURL);
}

export function reqText(baseURL?: string | undefined): axiosLib.AxiosInstance {
	return reqType("text", baseURL);
}

// the shell quoting functions should only be used if really necessary! vscode
// tasks should be used if something is actually executed.

/**
 * Escapes a parameter for appending to win32 process info object. The returned
 * string reverses back to the input param using the Win32 CommandLineToArgvW
 * method on the application side.
 */
export function win32EscapeShellParam(param: string): string {
	if (param.length == 0)
		return '""';

	if (param.indexOf(' ') == -1 && param.indexOf('"') == -1)
		return param;

	var ret = '"';
	var backslash = 0;
	for (let i = 0; i < param.length; i++) {
		const c = param[i];
		if (c == '"') {
			ret += '\\'.repeat(backslash + 1) + '"';
			backslash = 0;
		} else {
			if (c == '\\')
				backslash++;
			else
				backslash = 0;
			ret += c;
		}
	}
	return ret + '"';
}

/**
 * https://stackoverflow.com/a/22827128
 * thx Alex Yaroshevich
 */
export function unixEscapeShellParam(param: string): string {
	return `'${param.replace(/'/g, `'\\''`)}'`;
}
