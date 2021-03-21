import * as vscode from 'vscode';
import { ServeD, served } from './extension';
import { win32EscapeShellParam, unixEscapeShellParam } from './util';
import * as which from "which";
import * as path from "path";
import stringArgv from 'string-argv';

export function registerDebuggers(context: vscode.ExtensionContext) {
	var webfreakDebug = vscode.extensions.getExtension("webfreak.debug");
	var cppDebug = vscode.extensions.getExtension("ms-vscode.cpptools");
	var codeLLDB = vscode.extensions.getExtension("vadimcn.vscode-lldb");

	if (webfreakDebug || cppDebug || codeLLDB) {
		debugProvider = new DDebugProvider(context, webfreakDebug, cppDebug, codeLLDB);
		context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider("code-d", debugProvider))
	}
}

var debugProvider: DDebugProvider;
export function linkDebuggersWithServed(served: ServeD) {
	debugProvider.served = served;
}

type DebuggerType = "autodetect" | "gdb" | "lldb" | "mago" | "vsdbg" | "cpp-auto" | "cpp-gdb" | "cpp-lldb" | "nd-gdb" | "nd-lldb" | "code-lldb";

async function hasDebugger(name: string): Promise<boolean> {
	try {
		return !!await which(name);
	} catch (e) {
		return false;
	}
}

class DDebugProvider implements vscode.DebugConfigurationProvider {
	public served?: ServeD;

	constructor(
		protected context: vscode.ExtensionContext,
		public webfreakDebug: vscode.Extension<any> | undefined,
		public cppDebug: vscode.Extension<any> | undefined,
		public codeLLDB: vscode.Extension<any> | undefined
	) { }

	get hasWebfreakDebug(): boolean {
		return !!this.webfreakDebug;
	}

	get hasCppDebug(): boolean {
		return !!this.cppDebug;
	}

	get hasCodeLLDB(): boolean {
		return !!this.codeLLDB;
	}

	get pyLLDBEntrypoint(): string {
		return this.context.asAbsolutePath("dlang-debug/lldb_dlang.py");
	}

	get pyGDBEntrypoint(): string {
		return this.context.asAbsolutePath("dlang-debug/gdb_dlang.py");
	}

	makeNativeDebugConfiguration(type: string, debugConfiguration: vscode.DebugConfiguration): vscode.DebugConfiguration {
		const platform = debugConfiguration.platform || process.platform;
		const args = debugConfiguration.args;
		var config: vscode.DebugConfiguration = {
			name: "code-d " + debugConfiguration.name,
			request: "launch",
			type: type,
			target: debugConfiguration.program,
			cwd: debugConfiguration.cwd,
			valuesFormatting: "prettyPrinters"
		};

		if (type == "gdb")
			config.autorun = [`source ${this.pyGDBEntrypoint}`];
		else if (type == "lldb-mi")
			config.autorun = [`command script import "${this.pyLLDBEntrypoint}"`];
	
		if (Array.isArray(args) && args.length > 0) {
			config.arguments = args
				.map(platform == "win32" ? win32EscapeShellParam : unixEscapeShellParam)
				.join(' ');
		} else if (typeof args == "string" && args.length > 0) {
			config.arguments = args;
		}
	
		return config;
	}
	
	makeCodeLLDBConfiguration(debugConfiguration: vscode.DebugConfiguration): vscode.DebugConfiguration {
		const args = debugConfiguration.args;
		var config: vscode.DebugConfiguration = {
			name: "code-d " + debugConfiguration.name,
			request: "launch",
			type: "lldb",
			program: debugConfiguration.program,
			cwd: debugConfiguration.cwd,
			initCommands: [`command script import "${this.pyLLDBEntrypoint}"`]
		};
	
		if (Array.isArray(args) && args.length > 0) {
			config.args = args;
		} else if (typeof args == "string" && args.length > 0) {
			config.args = stringArgv(args);
		}
	
		return config;
	}
	
	makeCppMiConfiguration(type: string | undefined, debugConfiguration: vscode.DebugConfiguration): vscode.DebugConfiguration {
		const args = debugConfiguration.args;
		var config: vscode.DebugConfiguration = {
			name: "code-d " + debugConfiguration.name,
			request: "launch",
			type: "cppdbg",
			program: debugConfiguration.program,
			cwd: debugConfiguration.cwd,
			setupCommands: [
				{
					description: "Enable python pretty printing for D extensions",
					ignoreFailures: true,
					text: "-enable-pretty-printing"
				}
			],
			MIMode: type
		};

		if (!type || type == "gdb") {
			config.setupCommands.push({
				description: "Enable python pretty printing for D extensions",
				ignoreFailures: true,
				text: `-interpreter-exec console "source ${this.pyGDBEntrypoint}"`
			});
		}
		if (!type || type == "lldb") {
			config.setupCommands.push({
				description: "Enable python pretty printing for D extensions",
				ignoreFailures: true,
				text: `-interpreter-exec console "command script import ${this.pyLLDBEntrypoint}"`
			});
		}
	
		if (Array.isArray(args) && args.length > 0) {
			config.args = args;
		} else if (typeof args == "string" && args.length > 0) {
			config.args = stringArgv(args);
		}
	
		return config;
	}
	
	makeCppVsdbgConfiguration(debugConfiguration: vscode.DebugConfiguration): vscode.DebugConfiguration {
		const platform = debugConfiguration.platform || process.platform;
		const args = debugConfiguration.args;
		var config: vscode.DebugConfiguration = {
			name: "code-d " + debugConfiguration.name,
			request: "launch",
			type: "cppvsdbg",
			program: debugConfiguration.program,
			cwd: debugConfiguration.cwd
		};
	
		if (Array.isArray(args) && args.length > 0) {
			config.args = args;
		} else if (typeof args == "string" && args.length > 0) {
			config.args = stringArgv(args);
		}
	
		return config;
	}

	async makeDebugConfiguration(debugConfiguration: vscode.DebugConfiguration): Promise<vscode.DebugConfiguration> {
		const overwrite = debugConfiguration.config;

		if (!path.isAbsolute(debugConfiguration.program) && debugConfiguration.cwd)
			debugConfiguration.program = path.join(debugConfiguration.cwd, debugConfiguration.program);

		let debugType = <DebuggerType>debugConfiguration.debugger || "autodetect";
		let config = debugConfiguration;

		if (debugType == "autodetect") {
			debugType = <any>"no-ext";

			if (this.hasCodeLLDB && debugType.startsWith("no-")) {
				debugType = "code-lldb";
			}
			if (this.hasCppDebug && debugType.startsWith("no-")) {
				debugType = <any>"no-dbg";

				if (process.platform == "win32") {
					// https://github.com/microsoft/vscode-cpptools/blob/76e427fdb24014399497f0598727f2fd2a097454/Extension/package.json#L2751-L2757
					// always available on these platforms, so let's default to it
					if (process.arch == "x64" || process.arch == "ia32") {
						debugType = "vsdbg";
					} else {
						debugType = "cpp-auto";
					}
				} else {
					debugType = "cpp-auto";
				}
			}
			if (this.hasWebfreakDebug && debugType.startsWith("no-")) {
				debugType = <any>"no-dbg";

				if (process.platform == "win32") {
					if (await hasDebugger("mago-mi"))
						debugType = "mago";
					else if (await hasDebugger("gdb"))
						debugType = "nd-gdb";
					else if (await hasDebugger("lldb-mi"))
						debugType = "nd-lldb";
				} else if (process.platform == "darwin") {
					// prefer LLDB on OSX
					if (await hasDebugger("lldb-mi"))
						debugType = "nd-lldb";
					else if (await hasDebugger("gdb"))
						debugType = "nd-gdb";
				} else {
					if (await hasDebugger("gdb"))
						debugType = "nd-gdb";
					else if (await hasDebugger("lldb-mi"))
						debugType = "nd-lldb";
				}
			}

			if (<any>debugType == "no-ext") {
				throw new Error("No debugging extension installed. Please install ms-vscode.cpptools and/or webfreak.debug! To force a debugger, explicitly specify `debugger` in the debug launch config.");
			}
			if (<any>debugType == "no-dbg") {
				if (process.platform == "win32") {
					throw new Error("No debugger installed. Please install Visual Studio, GDB, LLDB or mago-mi or force a debugger by specifying `debugger` in the debug launch config!");
				} else {
					throw new Error("No debugger installed. Please install GDB or LLDB or force a debugger by specifying `debugger` in the debug launch config!");
				}
			}
		}

		if (debugType == "gdb") {
			if (this.hasCppDebug) {
				debugType = "cpp-gdb";
			} else if (this.hasWebfreakDebug) {
				debugType = "nd-gdb";
			} else {
				throw new Error("No debugging extension installed. Please install ms-vscode.cpptools and/or webfreak.debug! To force a debugger, explicitly specify `debugger` in the debug launch config.");
			}
		}

		if (debugType == "lldb") {
			if (this.hasCodeLLDB) {
				debugType = "code-lldb";
			} else if (this.hasCppDebug) {
				debugType = "cpp-lldb";
			} else if (this.hasWebfreakDebug) {
				debugType = "nd-lldb";
			} else {
				throw new Error("No debugging extension installed. Please install ms-vscode.cpptools and/or webfreak.debug! To force a debugger, explicitly specify `debugger` in the debug launch config.");
			}
		}

		switch (<DebuggerType>debugType) {
			case "code-lldb":
				config = this.makeCodeLLDBConfiguration(debugConfiguration);
				break;
			case "cpp-auto":
				config = this.makeCppMiConfiguration(undefined, debugConfiguration);
				break;
			case "cpp-gdb":
				config = this.makeCppMiConfiguration("gdb", debugConfiguration);
				break;
			case "cpp-lldb":
				config = this.makeCppMiConfiguration("lldb", debugConfiguration);
				break;
			case "vsdbg":
				config = this.makeCppVsdbgConfiguration(debugConfiguration);
				break;
			case "nd-gdb":
				config = this.makeNativeDebugConfiguration("gdb", debugConfiguration);
				break;
			case "nd-lldb":
				config = this.makeNativeDebugConfiguration("lldb-mi", debugConfiguration);
				break;
			case "mago":
				config = this.makeNativeDebugConfiguration("mago-mi", debugConfiguration);
				break;
			default:
				throw new Error("Unrecognized debug type '" + debugType + "'");
		}

		if (debugType.startsWith("cpp-") || debugType == "vsdbg")
			await this.cppDebug?.activate();
		else if (debugType.startsWith("nd-") || debugType == "mago")
			await this.webfreakDebug?.activate();
		else if (debugType == "code-lldb")
			await this.codeLLDB?.activate();

		if (overwrite) {
			for (const key in overwrite) {
				if (overwrite.hasOwnProperty(key)) {
					config[key] = overwrite[key];
				}
			}
		}

		return config;
	}

	async resolveDebugConfigurationWithSubstitutedVariables?(
		folder: vscode.WorkspaceFolder | undefined,
		debugConfiguration: vscode.DebugConfiguration,
		token?: vscode.CancellationToken
	): Promise<vscode.DebugConfiguration | undefined | null> {
		const config = await this.makeDebugConfiguration(debugConfiguration);

		this.served?.outputChannel?.appendLine("Generated debugging configuration:\n\n" + JSON.stringify(config, null, "\t"));

		if (!debugConfiguration.dubBuild)
			return config;

		let exitCode = await new Promise<number>(async (done) => {
			let task = <vscode.Task>await served.tasksProvider?.resolveTask(
				{
					definition: {
						type: "dub",
						run: false,
						_generated: true,
						compiler: "$current",
						archType: "$current",
						buildType: "$current",
						configuration: "$current",
						name: "debug dub build",
						_id: "coded-debug-id-" + Math.random().toString(36)
					},
					isBackground: false,
					name: "debug dub build",
					source: "code-d debug",
					runOptions: {
						reevaluateOnRerun: false
					},
					presentationOptions: {
						clear: true,
						echo: true,
						panel: vscode.TaskPanelKind.Dedicated,
						reveal: vscode.TaskRevealKind.Silent,
						showReuseMessage: false
					},
					problemMatchers: ["$dmd"],
					group: vscode.TaskGroup.Build
				}, undefined);

			// hacky wait until finished task
			let finished = false;
			let waiter = vscode.tasks.onDidEndTask((e) => {
				if (!finished && e.execution.task.definition._id == task.definition._id) {
					setTimeout(() => {
						if (!finished) {
							finished = true;
							waiter.dispose();
							procWaiter.dispose();
							done(-1);
						}
					}, 100);
				}
			});
			let procWaiter = vscode.tasks.onDidEndTaskProcess((e) => {
				if (!finished && e.execution.task.definition._id == task.definition._id) {
					finished = true;
					waiter.dispose();
					procWaiter.dispose();
					done(e.exitCode);
				}
			});

			await vscode.tasks.executeTask(task);
		});

		if (exitCode == -1) {
			vscode.window.showErrorMessage("Could not start dub build task before debugging!");
			return null;
		}
		else if (exitCode != 0) {
			vscode.window.showErrorMessage("dub build exited with error code " + exitCode);
			return undefined;
		}

		return config;
	}
}
