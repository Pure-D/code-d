import * as assert from 'assert';
import { cmpSemver, parseSimpleSemver } from '../../installer';

// Defines a Mocha test suite to group tests of similar kind together
suite("semver", () => {
	test("test parsing", () => {
		assert.deepStrictEqual(parseSimpleSemver("v1.0.0-beta.1.2"),
			[1, 0, 0, ["beta", 1, 2]]);
	});
	test("test comparision", () => {
		assert.strictEqual(cmpSemver("v1.0.0", "v1.0.0"), 0);
		assert.strictEqual(cmpSemver("v1.0.0", "v1.0.1"), -1);
		assert.strictEqual(cmpSemver("v1.0.1", "v1.0.0"), 1);
		assert.strictEqual(cmpSemver("v1.0.0", "v1.1.0"), -1);
		assert.strictEqual(cmpSemver("v1.1.0", "v1.0.0"), 1);
		assert.strictEqual(cmpSemver("v1.0.0", "v2.0.0"), -1);
		assert.strictEqual(cmpSemver("v2.0.0", "v1.0.0"), 1);

		assert.strictEqual(cmpSemver("v1.0.0-beta", "v1.0.0-beta"), 0);
		assert.strictEqual(cmpSemver("v1.0.0-beta", "v1.0.0"), -1);
		assert.strictEqual(cmpSemver("v1.0.0", "v1.0.0-beta"), 1);
		assert.strictEqual(cmpSemver("v1.0.0-alpha", "v1.0.0-beta"), -1);
		assert.strictEqual(cmpSemver("v1.0.0-beta", "v1.0.0-alpha"), 1);

		assert.strictEqual(cmpSemver("v1.0.0-beta.1", "v1.0.0-beta.2"), -1);
		assert.strictEqual(cmpSemver("v1.0.0-beta.1.1", "v1.0.0-beta.2"), -1);
		assert.strictEqual(cmpSemver("v1.0.0-beta.2.1", "v1.0.0-beta.2"), 1);
		assert.strictEqual(cmpSemver("v1.0.0-beta.10", "v1.0.0-beta.1"), 1);
	});
});