import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { sleep, testCompletion } from "../utils";
// import * as myExtension from '../../extension';

suite("Integration Tests", () => {
  vscode.window.showInformationMessage("Start all tests.");

  // sanity test that we have the correct window open
  let workspaces = vscode.workspace.workspaceFolders;
  assert.strictEqual(workspaces?.length, 1);
  assert.strictEqual(
    workspaces[0].uri.fsPath.toLowerCase(),
    process.env["PROJECT_DIR"]!.toLowerCase()
  );
  let workspace = workspaces[0];

  test("check code-d installed", async () => {
    let coded = vscode.extensions.getExtension("webfreak.code-d")!;
    assert.notStrictEqual(coded, undefined, "code-d not installed?!");
  });

  function file(relative: string): vscode.Uri {
    return vscode.Uri.joinPath(workspace.uri, relative);
  }

  test("Wait for python and code-d extensions", async () => {
    let coded = vscode.extensions.getExtension("webfreak.code-d")!;
    await coded.activate();
    await sleep(5000); // give sufficient startup time
  });

  test("Recipe file", async () => {
    let recipe = await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(file("dub.sdl")),
      vscode.ViewColumn.One
    );

    await recipe.edit((edit) => {
      edit.insert(new vscode.Position(2, 0), "dep");
    });

    await testCompletion(
      recipe,
      new vscode.Position(2, 3),
      new vscode.CompletionList([
        new vscode.CompletionItem(
          "dependency",
          vscode.CompletionItemKind.Field
        ),
      ]),
      "contains"
    );
  });

  // test('interactive', () => new Promise((resolve, reject) => {}));
});
