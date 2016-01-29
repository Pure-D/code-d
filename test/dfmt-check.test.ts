import * as assert from 'assert';
import * as vscode from 'vscode';
import { lintDfmt } from '../src/dfmt-check';

// Defines a Mocha test suite to group tests of similar kind together
suite("dfmt lint", () => {
	test("misspelling on/off", () => {
		let linted = lintDfmt(undefined, `void foo() {
			//dfmt offs
			int i = 5;
			//dfmt onf
		}`);
		assert.strictEqual(linted.length, 2);
		assert.strictEqual(linted[0].severity, vscode.DiagnosticSeverity.Warning);
		assert.strictEqual(linted[1].severity, vscode.DiagnosticSeverity.Warning);
	});
	test("redundant on/off", () => {
		let linted = lintDfmt(undefined, `void foo() {
			//dfmt on
			//dfmt off
			int i = 5;
			//dfmt off
			//dfmt ons
		}`);
		assert.strictEqual(linted.length, 3);
		assert.strictEqual(linted[0].severity, vscode.DiagnosticSeverity.Information);
		assert.strictEqual(linted[1].severity, vscode.DiagnosticSeverity.Information);
		assert.strictEqual(linted[2].severity, vscode.DiagnosticSeverity.Warning);
	});
});