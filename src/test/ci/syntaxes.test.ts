import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as vsctm from 'vscode-textmate';
import * as oniguruma from 'vscode-oniguruma';
import { suite, test } from 'mocha';
import { IRawGrammar } from 'vscode-textmate/release/rawGrammar';

/**
 * Resolves a package relative path (relative to root folder / package.json folder) to the actual path
 * @param pathStr the package relative path to resolve to an actual path
 */
function res(pathStr: string): string {
	return path.join(__dirname, "../../../", pathStr);
}

const wasmBin = fs.readFileSync(res('node_modules/vscode-oniguruma/release/onig.wasm')).buffer;
const vscodeOnigurumaLib = oniguruma.loadWASM(wasmBin).then(() => {
	return {
		createOnigScanner: function(patterns: any) { return new oniguruma.OnigScanner(patterns); },
		createOnigString: function(s: any) { return new oniguruma.OnigString(s); }
	};
});

function readFile(pathStr: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		fs.readFile(res(pathStr), (error, data) => error ? reject(error) : resolve(data));
	});
}

const registry = new vsctm.Registry({
	onigLib: vscodeOnigurumaLib,
	loadGrammar: async (scopeName): Promise<IRawGrammar | undefined | null> => {
		if (scopeName === 'source.diet') {
			const data = await readFile('syntaxes/diet.json');
			return vsctm.parseRawGrammar(data.toString(), 'syntaxes/diet.json');
		}
		else if (scopeName === 'source.d') {
			const data = await readFile('syntaxes/d.json');
			return vsctm.parseRawGrammar(data.toString(), 'syntaxes/d.json');
		}
		else if (scopeName === 'source.dml') {
			const data = await readFile('syntaxes/dml.json');
			return vsctm.parseRawGrammar(data.toString(), 'syntaxes/dml.json');
		}
		else if (scopeName === 'source.sdl') {
			const data = await readFile('syntaxes/sdl.json');
			return vsctm.parseRawGrammar(data.toString(), 'syntaxes/sdl.json');
		}
		console.error(`Unknown scope name: ${scopeName}`);
		return null;
	}
});

function testSyntaxes(grammar: vsctm.IGrammar, folder: string, ext: string) {
	return new Promise((resolve, reject) => {
		if (!fs.existsSync(res(folder)))
			return resolve(null);

		fs.readdir(res(folder), async (err, files) => {
			if (err)
				return reject(err);

			try {
				for (let i = 0; i < files.length; i++) {
					const file = files[i];

					if (!file.endsWith(ext))
						continue;

					let ruleStack = vsctm.INITIAL;

					const text = await readFile(path.join(folder, file));
					const lines = text.toString().split(/\r?\n/g);
					const tokens = lines.map(line => grammar.tokenizeLine(line, ruleStack).tokens.map(a => {
						return {
							start: a.startIndex,
							end: a.endIndex,
							scope: a.scopes[a.scopes.length - 1]
						};
					}));

					const actual = tokens.map(line => JSON.stringify(line)).join("\n");
					fs.writeFileSync(res(path.join(folder, file) + ".actual"), actual);

					const expectedText = await readFile(path.join(folder, file) + ".expected");
					const expectedLines = expectedText.toString().split(/\r?\n/g);
					const expectedTokens = expectedLines.map(line => JSON.parse(line));

					assert.deepStrictEqual(tokens, expectedTokens, "error in " + file);
				}
				resolve(undefined);
			}
			catch (e) {
				reject(e);
			}
		});
	});
}

suite("syntax tests", () => {
	test("diet", () => {
		return registry.loadGrammar('source.diet').then(grammar => {
			if (!grammar)
				throw new Error("grammar didn't load");

			return testSyntaxes(grammar, "src/test/ci/syntax/diet", ".dt");
		});
	});
	test("d", () => {
		return registry.loadGrammar('source.d').then(grammar => {
			if (!grammar)
				throw new Error("grammar didn't load");

			return testSyntaxes(grammar, "src/test/ci/syntax/d", ".d");
		});
	});
	test("dml", () => {
		return registry.loadGrammar('source.dml').then(grammar => {
			if (!grammar)
				throw new Error("grammar didn't load");

			return testSyntaxes(grammar, "src/test/ci/syntax/dml", ".dml");
		});
	});
});
