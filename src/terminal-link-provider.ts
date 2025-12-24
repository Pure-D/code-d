import * as vscode from "vscode";
import * as osPath from "path";
import * as fs from "fs";
import { openTextDocumentAtRange } from "./util";

export type TerminalFileLink = vscode.TerminalLink & { file: { path: vscode.Uri; line?: number; column?: number } };

export class DTerminalLinkProvider implements vscode.TerminalLinkProvider {
	provideTerminalLinks(context: { line: string; cwd?: string }): Thenable<TerminalFileLink[]> {
		const cwd =
			context.cwd ||
			(vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : process.cwd());
		// context.terminal.creationOptions.cwd is useless here, possibly
		// pointing to entirely different paths because vscode reuses terminals
		// (or sessions) across different workspaces, keeping old defaults.
		return Promise.all(findDErrorLines(cwd, context.line)).then(
			(v) => <TerminalFileLink[]>v.filter((l) => l !== null),
		);
	}

	handleTerminalLink(link: TerminalFileLink): vscode.ProviderResult<void> {
		let range: null | number | vscode.Position = null;
		if (link.file.line && link.file.column) range = new vscode.Position(link.file.line - 1, link.file.column - 1);
		else if (link.file.line) range = link.file.line - 1;

		openTextDocumentAtRange(link.file.path, range);
	}

	static register(): vscode.Disposable {
		const provider = new DTerminalLinkProvider();
		return vscode.window.registerTerminalLinkProvider(provider);
	}
}

const dubFileSearch = process.platform == "win32" ? "dub\\packages\\" : "dub/packages/";
function findDErrorLines(cwd: string, line: string): Promise<TerminalFileLink | null>[] {
	const ret: Promise<TerminalFileLink | null>[] = [];
	let i = 0;
	while (true) {
		i = line.indexOf("(", i);
		if (i == -1) break;

		const firstLineDigit = line[i + 1];
		if (
			isDigit(firstLineDigit) &&
			(line.endsWith(".d", i) ||
				line.endsWith(".di", i) ||
				line.endsWith(".dt", i) || // diet templates
				endsWithMixin(line, i))
		)
			ret.push(extractFileLinkAt(cwd, line, i));

		i++;
	}
	return ret;
}

function endsWithMixin(line: string, endIndex: number): boolean {
	// format = "file.d-mixin-5(5, 8)"
	if (endIndex == 0 || !isDigit(line[endIndex - 1])) return false;

	endIndex--;
	while (endIndex > 0 && isDigit(line[endIndex - 1])) endIndex--;

	return line.endsWith("-mixin-", endIndex);
}

function isDigit(c: string): boolean {
	return c >= "0" && c <= "9";
}

async function extractFileLinkAt(cwd: string, line: string, i: number): Promise<TerminalFileLink | null> {
	function isValidFilePathPart(c: string) {
		return (
			c != " " &&
			c != "(" &&
			c != ")" &&
			c != "[" &&
			c != "]" &&
			c != ":" &&
			c != "@" &&
			c != "`" &&
			c != '"' &&
			c != "'" &&
			c != "," &&
			c != "!" &&
			c != "?"
		);
	}

	let endOffset = 0;

	let gotDriveLetter = false;
	let prefixDone = false;
	function isValidPrefix(c: string) {
		if (prefixDone) return false;

		if (process.platform == "win32" && c == ":" && !gotDriveLetter) {
			gotDriveLetter = true;
			return true;
		}

		if (gotDriveLetter) {
			if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
				prefixDone = true;
				return true;
			} else {
				i++;
				return false;
			}
		}

		return isValidFilePathPart(c) || c == ":";
	}

	let lineNo: number | undefined = undefined;
	let column: number | undefined = undefined;
	while (i > 0 && isValidPrefix(line[i - 1])) i--;
	const file = line.substring(i);

	let end = 0;
	while (isValidFilePathPart(file[end])) end++;

	if (end == 0 || file[end - 1] == ".") return null;

	const lineNoMatcher = /^[(:](\d+)(?:[,:](\d+))?/;
	const lineNoMatch = file.substring(end).match(lineNoMatcher);

	if (lineNoMatch) {
		lineNo = parseInt(lineNoMatch[1]);
		if (lineNoMatch[2]) column = parseInt(lineNoMatch[2]);
		endOffset += lineNoMatch[0].length;
		if (lineNoMatch[0][0] == "(") endOffset++;
	}

	if (endsWithMixin(file, end)) {
		const newEnd = file.lastIndexOf("-mixin-", end);
		if (newEnd == -1) throw new Error("this should not happen");
		lineNo = parseInt(file.substring(newEnd + 7, end));
		column = undefined;
		endOffset += end - newEnd;
		end = newEnd;
	}

	const filePath = await resolveFilePath(cwd, file.substring(0, end));
	if (!filePath) return null;

	return {
		startIndex: i,
		length: end + endOffset,
		file: {
			path: filePath,
			line: lineNo,
			column: column,
		},
	};
}

export const dubPackagesHome = determineDubPackageHome();

let resolveAllFilePathsForTest: boolean = false;
export function enableResolveAllFilePathsForTest() {
	return (resolveAllFilePathsForTest = true);
}

function resolveFilePath(cwd: string, path: string): Promise<vscode.Uri | null> {
	return new Promise(function (resolve) {
		if (!osPath.isAbsolute(path)) path = osPath.join(cwd, path);
		fs.stat(path, function (err, stats) {
			if (!err && stats.isFile()) return resolve(vscode.Uri.file(path));

			const dubPathStart = path.indexOf(dubFileSearch);
			if (dubPathStart != -1) {
				path = osPath.join(dubPackagesHome, path.substring(dubPathStart + dubFileSearch.length));
				fs.stat(path, function (err, stats) {
					if ((!err && stats.isFile()) || resolveAllFilePathsForTest) {
						resolve(vscode.Uri.file(path));
					} else {
						resolve(null);
					}
				});
			} else {
				if (resolveAllFilePathsForTest) return resolve(vscode.Uri.file(path));
				else resolve(null);
			}
		});
	});
}

function determineDubPackageHome(): string {
	let dubHome = process.env["DUB_HOME"];
	if (!dubHome) {
		const dpath = process.env["DPATH"];
		if (dpath) {
			dubHome = osPath.join(dpath, "dub");
		}
	}

	if (dubHome) {
		return osPath.join(dubHome, "packages");
	}

	if (process.platform == "win32") {
		return osPath.join(process.env["LOCALAPPDATA"] || process.env["APPDATA"] || process.cwd(), "dub", "packages");
	} else {
		return osPath.join(process.env["HOME"] || process.cwd(), ".dub", "packages");
	}
}
