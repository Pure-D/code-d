import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
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
	const file = path.relative(root, fspath).replace(/[\\/]/g, "-");
	if (!file.endsWith(".d")) return undefined;
	return file.substring(0, file.length - 2);
}

export class CoverageAnalyzer implements vscode.TextDocumentContentProvider, vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	gotCoverage: boolean;

	constructor() {
		this.uncovDecorator = vscode.window.createTextEditorDecorationType({
			backgroundColor: "rgba(255, 128, 16, 0.1)",
			isWholeLine: true,
			overviewRulerColor: "rgba(255, 128, 16, 0.15)",
			overviewRulerLane: vscode.OverviewRulerLane.Center,
		});
		this.covDecorator = vscode.window.createTextEditorDecorationType({
			backgroundColor: "rgba(32, 255, 16, 0.03)",
			isWholeLine: true,
		});
		this.coverageStat = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.72136);
		this.coverageStat.text = "0.00% Coverage";
		this.coverageStat.tooltip = "Coverage in this file generated from the according .lst file";
		this.coverageStat.command = "code-d.generateCoverageReport";

		this.gotCoverage = false;

		this.subscriptions.push(this.uncovDecorator);
		this.subscriptions.push(this.covDecorator);
		this.subscriptions.push(this.coverageStat);
		this.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				this.refreshStatusBar(editor);
			}),
		);
	}

	updateCache(uri: vscode.Uri) {
		const cache: CoverageLine[] = [];
		const file = path.basename(uri.fsPath, ".lst");
		if (file.indexOf("dub_test_root-") != -1) return; // dub cache file for unittests
		fs.readFile(uri.fsPath, "utf-8", (err, data) => {
			const lines = data.split("\n");
			let offsetAdd = 0;
			let totalCov = "";
			let source = "";
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (line.trim().length == 0) continue;
				const match = coveragePattern.exec(line);
				if (!match) {
					const totalCovMatch = totalCoveragePattern.exec(line);
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
						offsetAdd: offsetAdd,
					});
					offsetAdd = 0;
				} else offsetAdd++;
			}
			console.log("Cache for " + source + " with " + totalCov + "% coverage");
			if (source && totalCov) this.cache.set(file, { lines: cache, totalCov: totalCov, source: source });
			const folder = vscode.workspace.getWorkspaceFolder(uri);
			if (
				folder &&
				vscode.window.activeTextEditor &&
				pathToName(folder.uri.fsPath, vscode.window.activeTextEditor.document.uri.fsPath) == file
			)
				this.populateCurrent();
		});
	}

	removeCache(uri: vscode.Uri) {
		this.cache.delete(path.basename(uri.fsPath, ".lst"));
	}

	populateCurrent() {
		const editor = vscode.window.activeTextEditor;
		if (!editor || !editor.document) return;
		const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
		let name;
		if (folder) name = pathToName(folder.uri.fsPath, editor.document.uri.fsPath);
		if (!name) return;

		const info = this.cache.get(name);
		const cache = info ? info.lines : undefined;
		const uncovRanges: vscode.Range[] = [];
		const covRanges: vscode.Range[] = [];
		if (cache && cache.length) {
			const maxLineSkip = 100; // maximum number of lines to scan ahead when new code has been written
			let lineIndex = 0;
			let searchOffset = 0;
			const lineCount = editor.document.lineCount;
			for (let i = 0; i < cache.length; i++) {
				searchOffset = 0;
				for (
					;
					lineIndex + searchOffset < lineCount && searchOffset < maxLineSkip + cache[i].offsetAdd;
					searchOffset++
				) {
					const line = editor.document.lineAt(lineIndex + searchOffset);
					if (line.text.trim() == cache[i].trimmedLine) {
						if (cache[i].hits > 0) covRanges.push(line.range);
						else uncovRanges.push(line.range);
						lineIndex += searchOffset;
						break;
					}
				}
			}
			this.coverageStat.text = (info ? info.totalCov : "unknown") + "% Coverage";
			this.gotCoverage = true;
			this.refreshStatusBar();
		} else {
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

	refreshStatusBar(editor?: vscode.TextEditor | null): void {
		if (this.gotCoverage && checkStatusbarVisibility("alwaysShowCoverageStatus", editor)) this.coverageStat.show();
		else this.coverageStat.hide();
	}

	provideTextDocumentContent(): string {
		let report =
			'<!DOCTYPE html>\n<html><head><meta http-equiv="Content-type" content="text/html;charset=UTF-8"><title>Coverage Report</title><style>th{padding:0 12px}</style></head><body>';
		report += "<table><thead>";
		report +=
			"<tr><th>Source</th><th>Coverage</th><th>Lines not covered</th><th>Lines covered</th><th>Average hits/line</th></tr>";
		report += "</thead><tbody>";
		let totalLinesWithout = 0;
		let totalLinesWith = 0;
		let totalSum = 0;
		let totalCount = 0;
		const it = this.cache.values();
		let next;
		let values: CoverageCache[] = [];
		while (!(next = it.next()).done) {
			values.push(next.value);
		}
		values = values.sort((a, b) => (a.source < b.source ? -1 : 1));
		for (const info of values) {
			let linesWithout = 0;
			let linesWith = 0;
			let sum = 0;
			for (let i = 0; i < info.lines.length; i++) {
				const line = info.lines[i];
				if (line.hits > 0) linesWith++;
				else linesWithout++;
				sum += line.hits;
				totalCount++;
			}
			totalLinesWith += linesWith;
			totalLinesWithout += linesWithout;
			totalSum += sum;
			report +=
				"<tr><td><a style='color:inherit' href='" +
				info.source +
				"'>" +
				info.source +
				"</a></td><td style='text-align:right'>" +
				info.totalCov +
				"%</td><td style='text-align:right'>" +
				linesWithout +
				"</td><td style='text-align:right'>" +
				linesWith +
				"</td><td style='text-align:right'>" +
				(sum / info.lines.length).toFixed(2) +
				"</td></tr>";
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
