import * as vscode from "vscode"
import * as ChildProcess from "child_process"
import { WorkspaceD } from "./workspace-d"

export class CompileButtons implements vscode.Disposable {
	buildButton: vscode.StatusBarItem;
	startButton: vscode.StatusBarItem;
	stopButton: vscode.StatusBarItem;
	child: ChildProcess.ChildProcess;
	workspaced: WorkspaceD;
	output: vscode.OutputChannel;

	constructor(workspaced: WorkspaceD) {
		this.workspaced = workspaced;

		this.output = vscode.window.createOutputChannel("Run output");

		this.buildButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.99);
		this.startButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.98);
		this.stopButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.97);

		this.buildButton.text = "$(file-binary)";
		this.startButton.text = " $(triangle-right) ";
		this.stopButton.text = "$(primitive-square)";

		this.buildButton.tooltip = "Build project";
		this.startButton.tooltip = "Run project";
		this.stopButton.tooltip = "Stop running project";

		this.buildButton.command = "code-d.build";
		this.startButton.command = "code-d.run";
		this.stopButton.command = "code-d.stop";

		this.buildButton.show();
		this.startButton.show();

		vscode.commands.registerCommand("code-d.build", this.build, this);
		vscode.commands.registerCommand("code-d.run", this.run, this);
		vscode.commands.registerCommand("code-d.stop", this.stop, this);
	}

	handleData(data) {
		let lines = data.toString("utf8").split('\n');
		for (var i = 0; i < lines.length - 1; i++) {
			this.output.appendLine(lines[i]);
		}
		this.output.append(lines[lines.length - 1]);
	}

	run() {
		this.startProc("run");
	}

	build() {
		this.startProc("build");
	}

	startProc(cmd) {
		if (!this.child) {
			this.output.show(vscode.ViewColumn.Three);
			this.output.clear();
			this.buildButton.hide();
			this.startButton.hide();
			Promise.all([this.workspaced.getConfiguration(), this.workspaced.getBuildType()]).then(values => {
				let args = [cmd, "--config=" + values[0], "--build=" + values[1]];
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
					this.handleStop();
				});
				this.child.once("error", (err) => {
					this.output.appendLine("dub crashed:");
					this.output.appendLine(err.toString());
					this.handleStop();
				});

				this.stopButton.show();
			});
		}
	}

	handleStop() {
		this.child = null;
		this.buildButton.show();
		this.startButton.show();
		this.stopButton.hide();
	}

	stop() {
		if (this.child) {
			process.kill(-this.child.pid);
			this.handleStop();
		}
	}

	dispose() {
		this.stop();
	}
}