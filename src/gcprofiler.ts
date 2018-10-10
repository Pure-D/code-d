import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { config } from "./extension";

var spaces = /[^\S\n]+/g;
var filelineRegex = /(\S+):(\d+)$/;

interface ProfileQuickPick extends vscode.QuickPickItem {
	profile: any;
}

export class GCProfiler implements vscode.CodeLensProvider {
	provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] {
		if (!config(document.uri).get("enableGCProfilerDecorations", true))
			return [];

		var lenses: vscode.CodeLens[] = [];
		this.profiles.forEach(profile => {
			if (document.uri.fsPath == vscode.Uri.parse(profile.file).fsPath) {
				var lens = new vscode.CodeLens(document.lineAt(profile.line - 1).range);
				lens.command = {
					arguments: [],
					command: "",
					title: profile.bytesAllocated + " bytes allocated / " + profile.allocationCount + " allocations"
				};
				lenses.push(lens);
			}
		});
		return lenses;
	}

	updateProfileCache(uri: vscode.Uri) {
		var root = ".";
		var workspace = vscode.workspace.getWorkspaceFolder(uri);
		if (workspace)
			root = workspace.uri.path;
		fs.readFile(uri.fsPath, (err, data) => {
			this.profiles = [];
			var lines = data.toString("utf8").split("\n");
			for (var i = 1; i < lines.length; i++) {
				var cols = lines[i].trim().split(spaces);
				if (cols.length < 5)
					continue;
				var fileLine = cols.slice(4, cols.length).join("");
				var match = filelineRegex.exec(lines[i]);
				if (match) {
					var file = match[1];
					var displayFile = file;
					if (!path.isAbsolute(file))
						file = path.join(root, file);
					this.profiles.push({
						bytesAllocated: cols[0],
						allocationCount: cols[1],
						type: cols[2],
						file: file,
						displayFile: displayFile,
						line: parseInt(match[2])
					});
				}
			}
		});
	}

	clearProfileCache() {
		this.profiles = [];
	}

	listProfileCache() {
		let items: ProfileQuickPick[] = [];
		this.profiles.forEach(profile => {
			items.push({
				description: profile.type,
				detail: profile.bytesAllocated + " bytes allocated / " + profile.allocationCount + " allocations",
				label: profile.displayFile + ":" + profile.line,
				profile: profile
			});
		});
		vscode.window.showQuickPick(items).then(item => {
			if (item)
				vscode.workspace.openTextDocument(vscode.Uri.file(item.profile.file)).then(doc => {
					vscode.window.showTextDocument(doc).then(editor => {
						let line = doc.lineAt(item.profile.line - 1);
						editor.revealRange(line.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
						editor.selection = new vscode.Selection(line.range.start, line.range.start);
					});
				});
		});
	}

	profiles: any[] = [];
}