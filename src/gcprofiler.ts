import * as vscode from "vscode";
import { served } from "./extension";

interface ProfileQuickPick extends vscode.QuickPickItem {
	uri: string;
	line: number;
}

export class GCProfiler {
	static listProfileCache() {
		let entriesPromise = served.client.sendRequest<any[]>("served/getProfileGCEntries");

		let items: Thenable<ProfileQuickPick[]> = entriesPromise.then(gcEntries =>
			gcEntries.map(entry => <ProfileQuickPick>{
				description: entry.type,
				detail: entry.bytesAllocated + " bytes allocated / " + entry.allocationCount + " allocations",
				label: entry.displayFile + ":" + entry.line,
				uri: entry.uri,
				line: entry.line
			}));

		vscode.window.showQuickPick(items).then(item => {
			if (item)
				vscode.workspace.openTextDocument(vscode.Uri.parse(item.uri)).then(doc => {
					vscode.window.showTextDocument(doc).then(editor => {
						let line = doc.lineAt(item.line - 1);
						editor.revealRange(line.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
						editor.selection = new vscode.Selection(line.range.start, line.range.start);
					});
				});
		});
	}

	profiles: any[] = [];
}