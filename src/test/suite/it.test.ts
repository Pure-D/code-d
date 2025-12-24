import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { sleep } from "../utils";
// import * as myExtension from '../../extension';

suite("Integration Tests", () => {
	vscode.window.showInformationMessage("Start all tests.");

	// sanity test that we have the correct window open
	const workspaces = vscode.workspace.workspaceFolders;
	assert.strictEqual(workspaces?.length, 1);
	assert.strictEqual(workspaces[0].uri.fsPath.toLowerCase(), process.env["PROJECT_DIR"]!.toLowerCase());

	test("check code-d installed", async () => {
		const coded = vscode.extensions.getExtension("webfreak.code-d")!;
		assert.notStrictEqual(coded, undefined, "code-d not installed?!");
	});

	// const workspace = workspaces[0];
	// function file(relative: string): vscode.Uri {
	// 	return vscode.Uri.joinPath(workspace.uri, relative);
	// }

	test("Wait for code-d extension", async () => {
		const coded = vscode.extensions.getExtension("webfreak.code-d")!;
		await coded.activate();
		await sleep(5000); // give sufficient startup time
	});

	// test('interactive', () => new Promise((resolve, reject) => {}));
});
