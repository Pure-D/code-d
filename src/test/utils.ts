import * as assert from "assert";
import * as vscode from "vscode";

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function testCompletion(
	editor: vscode.TextEditor,
	position: vscode.Position,
	expectedCompletionList: vscode.CompletionList,
	type: "exact" | "contains",
	testKeys: (keyof vscode.CompletionItem)[] = ["label", "kind"],
) {
	editor = await vscode.window.showTextDocument(editor.document, editor.viewColumn);
	await sleep(500);
	editor.selection = new vscode.Selection(position, position);
	await sleep(500);

	// Executing the command `vscode.executeCompletionItemProvider` to simulate triggering completion
	const actualCompletionList = (await vscode.commands.executeCommand(
		"vscode.executeCompletionItemProvider",
		editor.document.uri,
		position,
	)) as vscode.CompletionList;

	if (type === "exact") {
		assert.strictEqual(actualCompletionList.items.length, expectedCompletionList.items.length);
		expectedCompletionList.items.forEach((expectedItem, i) => {
			const actualItem = actualCompletionList.items[i];
			testKeys.forEach((key) => {
				assert.strictEqual(
					actualItem[key],
					expectedItem[key],
					"completion " +
						JSON.stringify(expectedItem.label) +
						" mismatch on key " +
						JSON.stringify(key) +
						":\n" +
						"expected = " +
						JSON.stringify(expectedItem[key]) +
						"\n" +
						"  actual = " +
						JSON.stringify(actualItem[key]),
				);
			});
		});
	} else if (type === "contains") {
		assert.ok(
			actualCompletionList.items.length >= expectedCompletionList.items.length,
			"Expected at least " +
				expectedCompletionList.items.length +
				" completions, but only got " +
				actualCompletionList.items.length,
		);
		expectedCompletionList.items.forEach((expectedItem, i) => {
			const actualItem = actualCompletionList.items.find((i) => i.label == expectedItem.label);
			if (!actualItem)
				assert.fail(
					"can't find completion item " +
						JSON.stringify(expectedItem.label) +
						" in " +
						JSON.stringify(actualCompletionList.items.map((c) => c.label)),
				);

			testKeys.forEach((key) => {
				assert.strictEqual(
					actualItem[key],
					expectedItem[key],
					"completion " +
						JSON.stringify(expectedItem.label) +
						" mismatch on key " +
						JSON.stringify(key) +
						":\n" +
						"expected = " +
						JSON.stringify(expectedItem[key]) +
						"\n" +
						"  actual = " +
						JSON.stringify(actualItem[key]),
				);
			});
		});
	} else {
		throw new Error("invalid type");
	}
}
