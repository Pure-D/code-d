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
