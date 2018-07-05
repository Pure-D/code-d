import * as vscode from "vscode"
import * as ChildProcess from "child_process"
import * as path from "path"
import { ServeD, config } from "./extension"

export class CompileButtons implements vscode.Disposable {
	buildButton?: vscode.StatusBarItem;
	startButton?: vscode.StatusBarItem;
	debugButton?: vscode.StatusBarItem;
	child?: ChildProcess.ChildProcess;
	served: ServeD;
	output?: vscode.OutputChannel;
	isDebug: boolean = false;
	debugValuesCache: any = null;
	terminal?: vscode.Terminal;

	constructor(served: ServeD) {
		this.served = served;
		served.client.onReady().then(this.create.bind(this));
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

	handleData(data: any) {
		if (!this.output) {
			console.log(data);
			return;
		}
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

	startProc(cmd: string, inTerminal = false) {
		if (inTerminal) {
			if (!this.terminal)
				this.terminal = vscode.window.createTerminal("Build Output");
			vscode.workspace.saveAll(false);
			if (this.buildButton)
				this.buildButton.hide();
			if (this.startButton)
				this.startButton.hide();
			if (this.debugButton)
				this.debugButton.hide();
			Promise.all([
				this.served.client.sendRequest<string>("served/getConfig"),
				this.served.client.sendRequest<string>("served/getArchType"),
				this.served.client.sendRequest<string>("served/getBuildType"),
				this.served.client.sendRequest<string>("served/getCompiler")
			]).then(values => {
				if (this.terminal) {
					this.terminal.show(true);
					this.terminal.sendText(`cd "${vscode.workspace.rootPath}"`);
					if (cmd == "run" && (values[2].toString() == "unittest" || values[2].toString() == "unittest-cov"))
						cmd = "test";
					this.terminal.sendText(`dub ${cmd} --config=${values[0]} --arch=${values[1]} --build=${values[2]} --compiler=${values[3]}`);
				}
				if (this.buildButton)
					this.buildButton.show();
				if (this.startButton)
					this.startButton.show();
				if (this.debugButton)
					this.debugButton.show();
			});
		}
		else if (!this.child) {
			if (this.output) {
				this.output.show(vscode.ViewColumn.Three);
				this.output.clear();
			}
			vscode.workspace.saveAll(false);
			if (this.buildButton)
				this.buildButton.hide();
			if (this.startButton)
				this.startButton.hide();
			if (this.debugButton)
				this.debugButton.hide();
			Promise.all([
				this.served.client.sendRequest<string>("served/getConfig"),
				this.served.client.sendRequest<string>("served/getArchType"),
				this.served.client.sendRequest<string>("served/getBuildType"),
				this.served.client.sendRequest<string>("served/getCompiler")
			]).then(values => {
				this.debugValuesCache = values;
				let args = [cmd, "--config=" + values[0], "--arch=" + values[1], "--build=" + values[2], "--compiler=" + values[3]];
				if (this.output)
					this.output.appendLine("> dub " + args.join(" "));
				this.child = ChildProcess.spawn(config(null).get("dubPath", "dub"), args, { cwd: vscode.workspace.rootPath, detached: true });
				this.child.stderr.on("data", this.handleData.bind(this));
				this.child.stdout.on("data", this.handleData.bind(this));
				this.child.once("close", (code) => {
					code = (code || 0);
					if (this.output) {
						if (code === 0)
							this.output.appendLine(cmd + " succeeded");
						else
							this.output.appendLine("dub stopped with error code " + code);
					}
					this.handleStop(code);
				});
				this.child.once("error", (err) => {
					if (this.output) {
						this.output.appendLine("dub crashed:");
						this.output.appendLine(err.toString());
					}
					this.handleStop(-1);
				});
			});
		}
	}

	handleStop(code: number) {
		this.child = undefined;
		if (this.buildButton)
			this.buildButton.show();
		if (this.startButton)
			this.startButton.show();
		if (this.debugButton)
			this.debugButton.show();
		if (this.isDebug && code == 0) {
			this.isDebug = false;
			var proc = ChildProcess.spawn(config(null).get("dubPath", "dub"),
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

				let launchConfig: vscode.DebugConfiguration = {
					name: "code-d inline debug",
					type: "gdb",
					request: "launch",
					target: path.join(exePath, exeName),
					cwd: cwd
				};

				if (vscode.workspace.workspaceFolders) {
					var folder = vscode.workspace.workspaceFolders[0];
					vscode.debug.startDebugging(folder, launchConfig).then(() => {
					}, err => {
						vscode.window.showErrorMessage("Couldn't start debugging. Make sure you have a GDB extension installed!", "Install Extensions").then(result => {
							if (result == "Install Extensions") {
								vscode.commands.executeCommand("workbench.extensions.action.installExtension");
							}
						});
					});
				}
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