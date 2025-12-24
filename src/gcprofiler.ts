import * as vscode from "vscode";
import { served } from "./extension";
import { openTextDocumentAtRange } from "./util";

interface ProfileQuickPick extends vscode.QuickPickItem {
	uri: string;
	line: number;
}

export class GCProfiler {
	static listProfileCache() {
		const entriesPromise = served.client.sendRequest<unknown>("served/getProfileGCEntries");

		const items: Thenable<ProfileQuickPick[]> = entriesPromise.then((gcEntries) =>
			Array.isArray(gcEntries)
				? gcEntries.map(
						(entry) =>
							<ProfileQuickPick>{
								description: entry.type,
								detail:
									entry.bytesAllocated +
									" bytes allocated / " +
									entry.allocationCount +
									" allocations",
								label: entry.displayFile + ":" + entry.line,
								uri: entry.uri,
								line: entry.line,
							},
					)
				: [],
		);

		vscode.window.showQuickPick(items).then((item) => {
			if (item) openTextDocumentAtRange(vscode.Uri.parse(item.uri), item.line - 1);
		});
	}
}
