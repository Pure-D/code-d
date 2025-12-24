import * as vscode from "vscode";
import { config, served } from "./extension";
import { LanguageClient } from "vscode-languageclient/node";

export class DubTasksProvider implements vscode.TaskProvider {
	constructor(public served: LanguageClient) {}

	provideTasks(): vscode.ProviderResult<vscode.Task[]> {
		const dubLint = config(null).get("enableDubLinting", true);
		return this.served
			.sendRequest<
				{
					definition: any; // eslint-disable-line @typescript-eslint/no-explicit-any
					scope: string;
					exec: string[];
					name: string;
					isBackground: boolean;
					source: string;
					group: "clean" | "build" | "rebuild" | "test";
					problemMatchers: string[];
				}[]
			>("served/buildTasks")
			.then((tasks) => {
				const ret: vscode.Task[] = [];
				tasks.forEach((task) => {
					let target: vscode.WorkspaceFolder | vscode.TaskScope | undefined;
					let cwd: string = "";
					if (task.scope == "global") target = vscode.TaskScope.Global;
					else if (task.scope == "workspace") target = vscode.TaskScope.Workspace;
					else {
						const uri = vscode.Uri.parse(task.scope);
						target = vscode.workspace.getWorkspaceFolder(uri);
						cwd = target?.uri.fsPath || uri.fsPath;
					}
					if (!target) return undefined;
					const proc: string = task.exec.shift() || "exit";
					const args: string[] = task.exec;

					if (task.definition.cwd) cwd = task.definition.cwd;

					if (typeof target == "object" && target.uri)
						cwd = cwd.replace("${workspaceFolder}", target.uri.fsPath);

					// set more flexible run args for UI import
					task.definition.compiler = "$current";
					task.definition.archType = "$current";
					task.definition.buildType = "$current";
					task.definition.configuration = "$current";

					if ((!dubLint && !Array.isArray(task.problemMatchers)) || task.problemMatchers.length == 0)
						task.problemMatchers = ["$dmd"];

					const t = new vscode.Task(
						task.definition,
						target,
						task.name,
						task.source,
						makeExecutor(proc, args, cwd),
						task.problemMatchers,
					);
					t.isBackground = task.isBackground;
					t.presentationOptions = {
						focus: !!task.definition.run,
					};
					t.detail = "dub " + args.join(" ");
					switch (task.group) {
						case "clean":
							t.group = vscode.TaskGroup.Clean;
							break;
						case "build":
							t.group = vscode.TaskGroup.Build;
							break;
						case "rebuild":
							t.group = vscode.TaskGroup.Rebuild;
							break;
						case "test":
							t.group = vscode.TaskGroup.Test;
							break;
					}
					ret.push(t);
				});
				return ret;
			});
	}

	async resolveTask(
		task: vscode.Task & {
			definition: {
				run?: boolean;
				test?: boolean;
				root?: string;
				cwd?: string;
				overrides?: string[];
				force?: boolean;
				compiler?: string;
				archType?: string;
				buildType?: string;
				configuration?: string;
				args?: string[]; // deprecated
				dub_args?: string[];
				target_args?: string[];
			};
		},
	): Promise<vscode.Task> {
		async function insertDollarCurrent(
			args: string[],
			prefix: string,
			str: string | undefined,
			servedFetchCommand: string,
		): Promise<void> {
			if (str == "$current") str = await served.client.sendRequest<string | undefined>(servedFetchCommand);

			if (str) args.push(prefix + str);
		}

		const dubLint = config(null).get("enableDubLinting", true);
		const args: string[] = [config(null).get("dubPath", "dub")];
		args.push(task.definition.test ? "test" : task.definition.run ? "run" : "build");
		if (task.definition.root) args.push("--root=" + task.definition.root);
		if (task.definition.overrides)
			task.definition.overrides.forEach((override) => {
				args.push("--override-config=" + override);
			});
		if (task.definition.force) args.push("--force");
		await insertDollarCurrent(args, "--compiler=", task.definition.compiler, "served/getCompiler");
		await insertDollarCurrent(args, "--arch=", task.definition.archType, "served/getArchType");
		await insertDollarCurrent(args, "--build=", task.definition.buildType, "served/getBuildType");
		await insertDollarCurrent(args, "--config=", task.definition.configuration, "served/getConfig");

		if (Array.isArray(task.definition.dub_args)) args.push(...task.definition.dub_args);

		if (Array.isArray(task.definition.args)) {
			args.push(...task.definition.args);
			vscode.window.showWarningMessage(
				'Your task definition is using the deprecated "args" field and will be ignored in an upcoming release.\nPlease change "args": to "dub_args": to keep old behavior.',
			);
		}

		if (Array.isArray(task.definition.target_args) && (task.definition.test || task.definition.run)) {
			// want to validate test/run in JSON schema but tasks schema doesn't allow advanced JSON schema things to be put on the object validator, only on properties
			args.push("--");
			args.push(...task.definition.target_args);
		}

		const options = task.scope ? (<vscode.WorkspaceFolder>task.scope).uri : undefined;
		const exec = makeExecutor(args.shift() || "exit", args, options?.fsPath || task.definition.cwd || undefined);

		const ret = new vscode.Task(
			task.definition,
			task.scope || vscode.TaskScope.Global,
			task.name || `dub ${task.definition.test ? "Test" : task.definition.run ? "Run" : "Build"}`,
			"dub",
			exec,
			dubLint ? task.problemMatchers : ["$dmd"],
		);
		ret.isBackground = task.isBackground;
		if (task.presentationOptions) {
			ret.presentationOptions = task.presentationOptions;
		} else {
			ret.presentationOptions = {
				focus: !!task.definition.run,
			};
		}
		ret.detail = "dub " + args.join(" ");
		return ret;
	}
}

function makeExecutor(
	proc: string,
	args: string[],
	cwd: string | undefined,
): vscode.ProcessExecution | vscode.ShellExecution {
	const options: vscode.ProcessExecutionOptions | undefined = cwd ? { cwd: cwd } : undefined;
	//return new vscode.ProcessExecution(proc, args, options);
	return new vscode.ShellExecution(
		{
			value: proc,
			quoting: vscode.ShellQuoting.Strong,
		},
		args.map(
			(arg) =>
				<vscode.ShellQuotedString>{
					value: arg,
					quoting: vscode.ShellQuoting.Strong,
				},
		),
		options,
	);
}
