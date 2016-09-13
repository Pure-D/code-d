import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"

interface CoverageCache {
	hits: number;
	trimmedLine: string;
	offsetAdd: number;
}

const coveragePattern = /^\s*(\d*)\|(.*)/;

function pathToName(fspath: string) {
	var file = path.relative(vscode.workspace.rootPath, fspath).replace(/[\\/]/g, "-");
	if (!file.endsWith(".d"))
		return undefined;
	return file.substr(0, file.length - 2);
}

export class CoverageAnalyzer {
	constructor() {
		this.uncovDecorator = vscode.window.createTextEditorDecorationType({
			backgroundColor: "rgba(255, 128, 16, 0.1)",
			isWholeLine: true,
			overviewRulerColor: "rgba(255, 128, 16, 0.15)",
			overviewRulerLane: vscode.OverviewRulerLane.Center
		});
		this.covDecorator = vscode.window.createTextEditorDecorationType({
			backgroundColor: "rgba(32, 255, 16, 0.03)",
			isWholeLine: true
		});
	}

	updateCache(uri: vscode.Uri) {
		var cache: CoverageCache[] = [];
		var file = path.basename(uri.fsPath, ".lst");
		fs.readFile(uri.fsPath, "utf-8", (err, data) => {
			var lines = data.split("\n");
			var offsetAdd = 0;
			for (var i = 0; i < lines.length; i++) {
				var line = lines[i];
				if (line.trim().length == 0)
					continue;
				var match = coveragePattern.exec(line);
				if (!match)
					break;
				if (match[1] && match[2].trim()) // only lines with coverage & source
				{
					cache.push({
						hits: parseInt(match[1]),
						trimmedLine: match[2].trim(),
						offsetAdd: offsetAdd
					});
					offsetAdd = 0;
				}
				else
					offsetAdd++;
			}
			console.log("Set coverage for file " + file + ". Found " + cache.length + " lines");
			this.cache.set(file, cache);
			if (pathToName(vscode.window.activeTextEditor.document.fileName) == file)
				this.populateCurrent();
		});
	}

	removeCache(uri: vscode.Uri) {
		this.cache.delete(path.basename(uri.fsPath, ".lst"));
	}

	populateCurrent() {
		var editor = vscode.window.activeTextEditor;
		var name = pathToName(editor.document.fileName);
		if (!name)
			return;
		var cache = this.cache.get(name);
		var uncovRanges: vscode.Range[] = [];
		var covRanges: vscode.Range[] = [];
		if (cache && cache.length) {
			const maxLineSkip = 100; // maximum number of lines to scan ahead when new code has been written
			var lineIndex = 0;
			var searchOffset = 0;
			var lineCount = editor.document.lineCount;
			for (var i = 0; i < cache.length; i++) {
				searchOffset = 0;
				for (; lineIndex + searchOffset < lineCount && searchOffset < maxLineSkip + cache[i].offsetAdd; searchOffset++) {
					var line = editor.document.lineAt(lineIndex + searchOffset);
					if (line.text.trim() == cache[i].trimmedLine) {
						if (cache[i].hits > 0)
							covRanges.push(line.range);
						else
							uncovRanges.push(line.range);
						lineIndex += searchOffset;
						break;
					}
				}
			}
		}
		editor.setDecorations(this.uncovDecorator, uncovRanges);
		editor.setDecorations(this.covDecorator, covRanges);
	}

	private uncovDecorator: vscode.TextEditorDecorationType;
	private covDecorator: vscode.TextEditorDecorationType;
	private cache = new Map<string, CoverageCache[]>();
}