import * as assert from 'assert';
import {
	DTerminalLinkProvider,
	enableResolveAllFilePathsForTest,
	TerminalFileLink,
	dubPackagesHome
} from '../../terminal-link-provider';
import * as osPath from 'path';
import * as vscode from 'vscode';

suite("terminal links", () => {
	enableResolveAllFilePathsForTest();
	let provider = new DTerminalLinkProvider();

	test("DUB path rewriting", async () => {
		assert.deepStrictEqual(await provider.provideTerminalLinks({
			line: "../../elsewhere/.dub/packages/msgpack-d-1.0.1/msgpack-d/src/msgpack/common.d(532,9): Deprecation: usage of the `body` keyword is deprecated. Use `do` instead.",
			cwd: "/tmp/myproject"
		}), <TerminalFileLink[]>[
			{
				startIndex: 0,
				length: 83,
				file: {
					path: vscode.Uri.file(osPath.join(dubPackagesHome, "msgpack-d-1.0.1/msgpack-d/src/msgpack/common.d")),
					line: 532,
					column: 9
				}
			}
		]);
	});

	test("DMD error reporting", async () => {
		assert.deepStrictEqual(await provider.provideTerminalLinks({
			line: "source/app.d(5,15): Error: unable to read module `bm`",
			cwd: "/tmp/myproject"
		}), <TerminalFileLink[]>[
			{
				startIndex: 0,
				length: 18,
				file: {
					path: vscode.Uri.file("/tmp/myproject/source/app.d"),
					line: 5,
					column: 15
				}
			}
		]);
	});

	test("D exceptions", async () => {
		assert.deepStrictEqual(await provider.provideTerminalLinks({
			line: "core.exception.AssertError@source/app.d(6): Assertion failure",
			cwd: "/tmp/myproject"
		}), <TerminalFileLink[]>[
			{
				startIndex: 27,
				length: 15,
				file: {
					path: vscode.Uri.file("/tmp/myproject/source/app.d"),
					line: 6,
					column: undefined
				}
			}
		]);
	});

	test("mixin errors", async () => {
		assert.deepStrictEqual(await provider.provideTerminalLinks({
			line: "source/app.d-mixin-5(7,8): Error: unable to read module `foobar`",
			cwd: "/tmp/myproject"
		}), <TerminalFileLink[]>[
			{
				startIndex: 0,
				length: 25,
				file: {
					path: vscode.Uri.file("/tmp/myproject/source/app.d"),
					line: 5,
					column: undefined
				}
			}
		]);
	});
});