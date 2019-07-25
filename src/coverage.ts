import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import { config } from "./extension";
import { checkStatusbarVisibility } from "./statusbar";

interface CoverageLine {
	hits: number;
	trimmedLine: string;
	offsetAdd: number;
}

interface CoverageCache {
	lines: CoverageLine[];
	totalCov: string;
	source: string;
}

const coveragePattern = /^\s*(\d*)\|(.*)/;
const totalCoveragePattern = /^(.*?) is (.*?)% covered$/;

function pathToName(root: string, fspath: string) {
	var file = path.relative(root, fspath).replace(/[\\/]/g, "-");
	if (!file.endsWith(".d"))
		return undefined;
	return file.substr(0, file.length - 2);
}

export class CoverageAnalyzer implements vscode.TextDocumentContentProvider, vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	gotCoverage: boolean;

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
		this.coverageStat = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.72136);
		this.coverageStat.text = "0.00% Coverage";
		this.coverageStat.tooltip = "Coverage in this file generated from the according .lst file";
		this.coverageStat.command = "code-d.generateCoverageReport";

		this.gotCoverage = false;

		this.subscriptions.push(this.uncovDecorator);
		this.subscriptions.push(this.covDecorator);
		this.subscriptions.push(this.coverageStat);
		this.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
			this.refreshStatusBar(editor);
		}));
	}

	updateCache(uri: vscode.Uri) {
		var cache: CoverageLine[] = [];
		var file = path.basename(uri.fsPath, ".lst");
		if (file.indexOf("dub_test_root-") != -1)
			return; // dub cache file for unittests
		fs.readFile(uri.fsPath, "utf-8", (err, data) => {
			var lines = data.split("\n");
			var offsetAdd = 0;
			var totalCov = "";
			var source = "";
			for (var i = 0; i < lines.length; i++) {
				var line = lines[i];
				if (line.trim().length == 0)
					continue;
				var match = coveragePattern.exec(line);
				if (!match) {
					var totalCovMatch = totalCoveragePattern.exec(line);
					if (totalCovMatch) {
						source = totalCovMatch[1].trim();
						totalCov = totalCovMatch[2].trim();
					}
					break;
				}
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
			console.log("Cache for " + source + " with " + totalCov + "% coverage");
			if (source && totalCov)
				this.cache.set(file, { lines: cache, totalCov: totalCov, source: source });
			var folder = vscode.workspace.getWorkspaceFolder(uri);
			if (folder && vscode.window.activeTextEditor && pathToName(folder.uri.fsPath, vscode.window.activeTextEditor.document.uri.fsPath) == file)
				this.populateCurrent();
		});
	}

	removeCache(uri: vscode.Uri) {
		this.cache.delete(path.basename(uri.fsPath, ".lst"));
	}

	populateCurrent() {
		var editor = vscode.window.activeTextEditor;
		if (!editor || !editor.document)
			return;
		var folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
		var name;
		if (folder)
			name = pathToName(folder.uri.fsPath, editor.document.uri.fsPath);
		if (!name)
			return;

		var info = this.cache.get(name);
		var cache = info ? info.lines : undefined;
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
			this.coverageStat.text = (info ? info.totalCov : "unknown") + "% Coverage";
			this.gotCoverage = true;
			this.refreshStatusBar();
		}
		else {
			this.gotCoverage = false;
			this.coverageStat.hide();
		}

		if (config(editor.document.uri).get("enableCoverageDecoration", true)) {
			editor.setDecorations(this.uncovDecorator, uncovRanges);
			editor.setDecorations(this.covDecorator, covRanges);
		} else {
			editor.setDecorations(this.uncovDecorator, []);
			editor.setDecorations(this.covDecorator, []);
		}
	}

	refreshStatusBar(editor?: vscode.TextEditor | null): any {
		if (this.gotCoverage && checkStatusbarVisibility("alwaysShowCoverageStatus", editor))
			this.coverageStat.show();
		else
			this.coverageStat.hide();
	}

	provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): string {
		var report = '<!DOCTYPE html>\n<html><head><meta http-equiv="Content-type" content="text/html;charset=UTF-8"><title>Coverage Report</title><style>th{padding:0 12px}</style></head><body>';
		report += "<table><thead>";
		report += "<tr><th>Source</th><th>Coverage</th><th>Lines not covered</th><th>Lines covered</th><th>Average hits/line</th></tr>";
		report += "</thead><tbody>";
		var totalLinesWithout = 0;
		var totalLinesWith = 0;
		var totalSum = 0;
		var totalCount = 0;
		var it = this.cache.values();
		var next;
		var values: CoverageCache[] = [];
		while (!(next = it.next()).done) {
			values.push(next.value);
		}
		values = values.sort((a, b) => a.source < b.source ? -1 : 1);
		for (var info of values) {
			var linesWithout = 0;
			var linesWith = 0;
			var sum = 0;
			for (var i = 0; i < info.lines.length; i++) {
				var line = info.lines[i];
				if (line.hits > 0)
					linesWith++;
				else
					linesWithout++;
				sum += line.hits;
				totalCount++;
			}
			totalLinesWith += linesWith;
			totalLinesWithout += linesWithout;
			totalSum += sum;
			report += "<tr><td><a style='color:inherit' href='" + info.source + "'>" + info.source + "</a></td><td style='text-align:right'>" + info.totalCov + "%</td><td style='text-align:right'>" + linesWithout + "</td><td style='text-align:right'>" + linesWith + "</td><td style='text-align:right'>" + (sum / info.lines.length).toFixed(2) + "</td></tr>";
		}
		report += "</tbody></table><hr>";
		report += "Total lines covered: <b>" + totalLinesWith + "</b><br>";
		report += "Total lines not covered: <b>" + totalLinesWithout + "</b><br>";
		report += "Total hits: <b>" + totalSum + "</b><br>";
		report += "Total coverage: <b>" + ((totalLinesWith / totalCount) * 100).toFixed(1) + "%</b>";
		report += "</body></html>";
		return report;
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}

	private coverageStat: vscode.StatusBarItem;
	private uncovDecorator: vscode.TextEditorDecorationType;
	private covDecorator: vscode.TextEditorDecorationType;
	private cache = new Map<string, CoverageCache>();
}