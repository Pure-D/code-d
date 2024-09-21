import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import * as cp from "child_process";

const packageJson = require("../../package.json");

import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from "@vscode/test-electron";
import { rimraf } from "rimraf";

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, "../../");

    // The path to the extension test runner script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, "./suite/index");

    const vscodeExecutablePath = await downloadAndUnzipVSCode();

    const [cliPath, ...args] =
      resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

    // for (const extensionId of packageJson.extensionDependencies) {
    //   cp.spawnSync(cliPath, [...args, "--install-extension", extensionId], {
    //     encoding: "utf-8",
    //     stdio: "inherit",
    //   });
    // }

    await rimraf(".vscode-test/user-data");

    let cwd = fs.mkdtempSync(path.join(os.tmpdir(), "coded_project"));
    fs.writeFileSync(path.join(cwd, "dub.sdl"), 'name "codedproject"\n');
    fs.mkdirSync(path.join(cwd, "source"));
    fs.writeFileSync(
      path.join(cwd, "source", "app.d"),
      'import std.stdio;\n\nvoid main() {\n\twriteln("hello world");\n}\n'
    );

    // Download VS Code, unzip it and run the integration test
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      launchArgs: [cwd],
      extensionTestsPath,
      extensionTestsEnv: {
        PROJECT_DIR: cwd,
      },
    });
  } catch (err) {
    console.error(err);
    console.error("Failed to run tests");
    process.exit(1);
  }
}

main();
