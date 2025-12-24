import * as vscode from "vscode";
import { default as axios, AxiosInstance, ResponseType } from "axios";
import { currentVersion } from "./extension";

export function reqType(type: ResponseType, baseURL?: string | undefined, timeout: number = 10000): AxiosInstance {
	const proxy = vscode.workspace.getConfiguration("http").get("proxy", "");
	if (proxy) process.env["http_proxy"] = proxy;

	return axios.create({
		baseURL,
		responseType: type,
		timeout: timeout,
		headers: {
			"User-Agent": "code-d/" + currentVersion + " (github:Pure-D/code-d)",
		},
	});
}

export function reqJson(baseURL?: string | undefined, timeout: number = 10000): AxiosInstance {
	return reqType("json", baseURL, timeout);
}

export function reqText(baseURL?: string | undefined, timeout: number = 10000): AxiosInstance {
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
	if (param.length == 0) return '""';

	if (param.indexOf(" ") == -1 && param.indexOf('"') == -1) return param;

	let ret = '"';
	let backslash = 0;
	for (let i = 0; i < param.length; i++) {
		const c = param[i];
		if (c == '"') {
			ret += "\\".repeat(backslash + 1) + '"';
			backslash = 0;
		} else {
			if (c == "\\") backslash++;
			else backslash = 0;
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
	let encoding: BufferEncoding = "utf8";
	if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
		buffer = buffer.subarray(3);
	} else if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xfe && bytes[3] === 0xff) {
		buffer = buffer.subarray(4);
		encoding = "utf32be" as BufferEncoding;
	} else if (bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0x00 && bytes[3] === 0x00) {
		buffer = buffer.subarray(4);
		encoding = "utf32le" as BufferEncoding;
	} else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
		buffer = buffer.subarray(2);
		encoding = "utf16be" as BufferEncoding;
	} else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
		buffer = buffer.subarray(2);
		encoding = "utf16le";
	}

	return buffer.toString(encoding);
}

type QuickPickInputDefaultItem = vscode.QuickPickItem & { custom: true };

export function showQuickPickWithInput<T>(
	items: T[] | Thenable<T[]>,
	options: vscode.QuickPickOptions & { canPickMany: true },
): Promise<readonly (T | QuickPickInputDefaultItem)[] | undefined>;
export function showQuickPickWithInput<T>(
	items: T[] | Thenable<T[]>,
	options?: (vscode.QuickPickOptions & { canPickMany: false | undefined }) | undefined,
): Promise<T | QuickPickInputDefaultItem | undefined>;
export function showQuickPickWithInput<T extends vscode.QuickPickItem>(
	items: T[] | Thenable<T[]>,
	options?: vscode.QuickPickOptions,
): Promise<(T | QuickPickInputDefaultItem) | readonly (T | QuickPickInputDefaultItem)[] | undefined> {
	return new Promise((resolve) => {
		const quickPick = vscode.window.createQuickPick<T | QuickPickInputDefaultItem>();
		quickPick.canSelectMany = options?.canPickMany ?? false;
		quickPick.ignoreFocusOut = options?.ignoreFocusOut ?? false;
		quickPick.matchOnDescription = options?.matchOnDescription ?? false;
		quickPick.matchOnDetail = options?.matchOnDetail ?? false;
		quickPick.placeholder = options?.placeHolder;
		quickPick.title = options?.title;
		const input: QuickPickInputDefaultItem = {
			label: "",
			description: "Custom Input",
			alwaysShow: true,
			custom: true,
		};
		quickPick.items = [];
		quickPick.busy = true;
		(async function () {
			quickPick.items = quickPick.items.concat(await items);
			quickPick.busy = false;
		})();
		quickPick.onDidChangeValue(() => {
			input.label = quickPick.value;
			const i = quickPick.items.indexOf(input);
			if (quickPick.value) {
				if (i == -1) quickPick.items = [input, ...quickPick.items];
			} else {
				if (i != -1) quickPick.items = quickPick.items.slice(0, i).concat(quickPick.items.slice(i + 1));
			}
		});
		let resolved = false;
		quickPick.onDidChangeSelection((e) => {
			if (options?.onDidSelectItem) options.onDidSelectItem(e[0]);
			resolve(options?.canPickMany ? e : e[0]);
			resolved = true;
			quickPick.hide();
		});

		quickPick.onDidHide(() => {
			if (!resolved) resolve(undefined);
			quickPick.dispose();
		});
		quickPick.show();
	});
}

/**
 * @param uri The text document to open and show to the user.
 * @param lineOrRange
 *     If null, only open the text document, don't scroll or select anything (default vscode behavior)
 *     If a number, this is the 0-based line number to focus and put the cursor on.
 *     If a range, this is a range to focus in the center of the editor and put the cursor at the start of.
 */
export function openTextDocumentAtRange(
	uri: vscode.Uri,
	lineOrRange: null | number | vscode.Position | vscode.Range,
): Thenable<vscode.TextEditor> {
	return vscode.workspace.openTextDocument(uri).then((doc) =>
		vscode.window.showTextDocument(doc).then((editor) => {
			if (lineOrRange !== null) {
				if (typeof lineOrRange == "number") lineOrRange = doc.lineAt(lineOrRange).range;
				if (lineOrRange instanceof vscode.Position) lineOrRange = new vscode.Range(lineOrRange, lineOrRange);

				editor.revealRange(lineOrRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
				editor.selection = new vscode.Selection(lineOrRange.start, lineOrRange.start);
			}
			return editor;
		}),
	);
}
