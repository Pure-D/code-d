import * as vscode from "vscode";
import axiosLib = require("axios");
import { currentVersion } from "./extension";
export const axios = axiosLib.default;

export function reqType(type: axiosLib.ResponseType, baseURL?: string | undefined, timeout: number = 10000): axiosLib.AxiosInstance {
	let proxy = vscode.workspace.getConfiguration("http").get("proxy", "");
	if (proxy)
		process.env["http_proxy"] = proxy;

	return axios.create({
		baseURL,
		responseType: type,
		timeout: timeout,
		headers: {
			"User-Agent": "code-d/" + currentVersion + " (github:Pure-D/code-d)"
		}
	});
}

export function reqJson(baseURL?: string | undefined, timeout: number = 10000): axiosLib.AxiosInstance {
	return reqType("json", baseURL, timeout);
}

export function reqText(baseURL?: string | undefined, timeout: number = 10000): axiosLib.AxiosInstance {
	return reqType("text", baseURL, timeout);
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

/**
 * Converts a buffer (UTF-8 or UTF-16 LE with BOM) to a JS string.
 * Contains code for other UTF encodings, which are not supported by NodeJS
 * yet however.
 */
export function simpleBytesToString(bytes: Uint8Array): string {
	let buffer = Buffer.from(bytes);
	let encoding = "utf8";
	if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
		buffer = buffer.slice(3);
	} else if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xFE && bytes[3] === 0xFF) {
		buffer = buffer.slice(4);
		encoding = "utf32be";
	} else if (bytes[0] === 0xFF && bytes[1] === 0xFE && bytes[2] === 0x00 && bytes[3] === 0x00) {
		buffer = buffer.slice(4);
		encoding = "utf32le";
	} else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
		buffer = buffer.slice(2);
		encoding = "utf16be";
	} else if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
		buffer = buffer.slice(2);
		encoding = "utf16le";
	}

	return buffer.toString(encoding);
}
