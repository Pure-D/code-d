import * as vscode from "vscode"
import * as ChildProcess from "child_process"
import * as path from "path"
import { WorkspaceD } from "./workspace-d"

export class CompileButtons implements vscode.Disposable {
	buildButton: vscode.StatusBarItem;
	startButton: vscode.StatusBarItem;
	debugButton: vscode.StatusBarItem;
	child: ChildProcess.ChildProcess;
	workspaced: WorkspaceD;
	output: vscode.OutputChannel;
	isDebug: boolean = false;
	debugValuesCache: any = null;
	terminal: vscode.Terminal;

	constructor(workspaced: WorkspaceD) {
		this.workspaced = workspaced;
		workspaced.once("dub-ready", this.create.bind(this));
	}

	private create() {
		this.output = vscode.window.createOutputChannel("Run output");

		this.buildButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.72135);
		this.startButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.72134);
		this.debugButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.72133);

		this.buildButton.text = "$(file-binary)";
		this.startButton.text = " $(triangle-right) ";
		this.debugButton.text = "$(bug)";

		this.buildButton.tooltip = "Build project";
		this.startButton.tooltip = "Run project";
		this.debugButton.tooltip = "Debug project";

		this.buildButton.command = "code-d.build";
		this.startButton.command = "code-d.run";
		this.debugButton.command = "code-d.debug";

		this.buildButton.show();
		this.startButton.show();
		this.debugButton.show();

		vscode.commands.registerCommand("code-d.build", this.build, this);
		vscode.commands.registerCommand("code-d.run", this.run, this);
		vscode.commands.registerCommand("code-d.stop", this.stop, this);
		vscode.commands.registerCommand("code-d.debug", this.debug, this);
	}

	handleData(data) {
		let lines = data.toString("utf8").split('\n');
		for (var i = 0; i < lines.length - 1; i++) {
			this.output.appendLine(lines[i]);
		}
		this.output.append(lines[lines.length - 1]);
	}

	run() {
		this.isDebug = false;
		this.startProc("run", true);
	}

	build() {
		this.isDebug = false;
		this.startProc("build", true);
	}

	debug() {
		this.isDebug = true;
		this.startProc("build");
	}

	startProc(cmd, inTerminal = false) {
		if (inTerminal) {
			if (!this.terminal)
				this.terminal = vscode.window.createTerminal("Build Output");
			vscode.workspace.saveAll(false);
			this.buildButton.hide();
			this.startButton.hide();
			this.debugButton.hide();
			Promise.all([this.workspaced.getConfiguration(), this.workspaced.getArchType(), this.workspaced.getBuildType(), this.workspaced.getCompiler()]).then(values => {
				this.terminal.show(true);
				this.terminal.sendText(`cd "${vscode.workspace.rootPath}"`);
				if (cmd == "run" && (values[2].toString() == "unittest" || values[2].toString() == "unittest-cov"))
					cmd = "test";
				this.terminal.sendText(`dub ${cmd} --config=${values[0]} --arch=${values[1]} --build=${values[2]} --compiler=${values[3]}`);
				this.buildButton.show();
				this.startButton.show();
				this.debugButton.show();
			});
		}
		else if (!this.child) {
			this.output.show(vscode.ViewColumn.Three);
			this.output.clear();
			vscode.workspace.saveAll(false);
			this.buildButton.hide();
			this.startButton.hide();
			this.debugButton.hide();
			Promise.all([this.workspaced.getConfiguration(), this.workspaced.getArchType(), this.workspaced.getBuildType(), this.workspaced.getCompiler()]).then(values => {
				this.debugValuesCache = values;
				let args = [cmd, "--config=" + values[0], "--arch=" + values[1], "--build=" + values[2], "--compiler=" + values[3]];
				this.output.appendLine("> dub " + args.join(" "));
				this.child = ChildProcess.spawn("dub", args, { cwd: vscode.workspace.rootPath, detached: true });
				this.child.stderr.on("data", this.handleData.bind(this));
				this.child.stdout.on("data", this.handleData.bind(this));
				this.child.once("close", (code) => {
					code = (code || 0);
					if (code === 0)
						this.output.appendLine(cmd + " succeeded");
					else
						this.output.appendLine("dub stopped with error code " + code);
					this.handleStop(code);
				});
				this.child.once("error", (err) => {
					this.output.appendLine("dub crashed:");
					this.output.appendLine(err.toString());
					this.handleStop(-1);
				});
			});
		}
	}

	handleStop(code) {
		this.child = null;
		this.buildButton.show();
		this.startButton.show();
		this.debugButton.show();
		if (this.isDebug && code == 0) {
			this.isDebug = false;
			var proc = ChildProcess.spawn("dub",
				[
					"describe",
					"--config=" + this.debugValuesCache[0],
					"--arch=" + this.debugValuesCache[1],
					"--build=" + this.debugValuesCache[2],
					"--compiler=" + this.debugValuesCache[3],
					"--data=target-path,target-name,working-directory",
					"--data-list"
				],
				{
					cwd: vscode.workspace.rootPath,
					detached: true
				});

			var allData = "";
			proc.stdout.on('data', function (data) {
				allData += data;
			});
			proc.stdout.on("finish", () => {
				var strings = allData.split("\n\n");
				var exePath = strings[0].trim();
				var exeName = strings[1].trim();
				var cwd = strings[2].trim();

				let launchConfig = {
					type: "gdb",
					request: "launch",
					target: path.join(exePath, exeName),
					cwd: cwd
				};

				vscode.commands.executeCommand('vscode.startDebug', launchConfig).then(() => {
				}, err => {
					vscode.window.showErrorMessage("Couldn't start debugging. Make sure you have a GDB extension installed!", "Install Extensions").then(result => {
						if (result == "Install Extensions") {
							vscode.commands.executeCommand("workbench.extensions.action.installExtension");
						}
					});
				});
			});
		}
	}

	stop() {
		if (this.child) {
			process.kill(-this.child.pid);
			this.handleStop(-2);
		}
	}

	dispose() {
		this.stop();
	}
}