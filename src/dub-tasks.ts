import * as vscode from "vscode";
import { config, served } from "./extension";
import { LanguageClient } from "vscode-languageclient/lib/main";

export class DubTasksProvider implements vscode.TaskProvider {
	constructor(public served: LanguageClient) { }

	provideTasks(token?: vscode.CancellationToken | undefined): vscode.ProviderResult<vscode.Task[]> {
		let dubLint = config(null).get("enableDubLinting", true);
		return this.served.sendRequest<{
			definition: any,
			scope: string,
			exec: string[],
			name: string,
			isBackground: boolean,
			source: string,
			group: "clean" | "build" | "rebuild" | "test",
			problemMatchers: string[]
		}[]>("served/buildTasks").then(tasks => {
			var ret: vscode.Task[] = [];
			tasks.forEach(task => {
				var target: vscode.WorkspaceFolder | vscode.TaskScope | undefined;
				let cwd: string = "";
				if (task.scope == "global")
					target = vscode.TaskScope.Global;
				else if (task.scope == "workspace")
					target = vscode.TaskScope.Workspace;
				else {
					let uri = vscode.Uri.parse(task.scope);
					target = vscode.workspace.getWorkspaceFolder(uri);
					cwd = target?.uri.fsPath || uri.fsPath;
				}
				if (!target)
					return undefined;
				var proc: string = task.exec.shift() || "exit";
				var args: string[] = task.exec;

				if (task.definition.cwd)
					cwd = task.definition.cwd;

				if (typeof target == "object" && target.uri)
					cwd = cwd.replace("${workspaceFolder}", target.uri.fsPath);

				// set more flexible run args for UI import
				task.definition.compiler = "$current";
				task.definition.archType = "$current";
				task.definition.buildType = "$current";
				task.definition.configuration = "$current";

				if (!dubLint && !Array.isArray(task.problemMatchers) || task.problemMatchers.length == 0)
					task.problemMatchers = ["$dmd"];

				var t = new vscode.Task(
					task.definition, target, task.name, task.source,
					makeExecutor(proc, args, cwd),
					task.problemMatchers);
				t.isBackground = task.isBackground;
				t.presentationOptions = {
					focus: !!task.definition.run
				};
				(<any>t).detail = "dub " + args.join(" ");
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

	async resolveTask(task: vscode.Task & {
		definition: {
			run?: boolean,
			test?: boolean,
			root?: string,
			cwd?: string,
			overrides?: string[],
			force?: boolean,
			compiler?: string,
			archType?: string,
			buildType?: string,
			configuration?: string,
			args?: string[], // deprecated
			dub_args?: string[],
			target_args?: string[]
		}
	}, token?: vscode.CancellationToken | undefined): Promise<vscode.Task> {
		function replaceCurrent(str: string, servedFetchCommand: string): string | Promise<string> {
			if (str == "$current")
				return served.client.sendRequest<string>(servedFetchCommand);
			else
				return str;
		}

		const dubLint = config(null).get("enableDubLinting", true);
		const args: string[] = [config(null).get("dubPath", "dub")];
		args.push(task.definition.test ? "test" : task.definition.run ? "run" : "build");
		if (task.definition.root)
			args.push("--root=" + task.definition.root);
		if (task.definition.overrides)
			task.definition.overrides.forEach(override => {
				args.push("--override-config=" + override);
			});
		if (task.definition.force)
			args.push("--force");
		if (task.definition.compiler)
			args.push("--compiler=" + await replaceCurrent(task.definition.compiler, "served/getCompiler"));
		if (task.definition.archType)
			args.push("--arch=" + await replaceCurrent(task.definition.archType, "served/getArchType"));
		if (task.definition.buildType)
			args.push("--build=" + await replaceCurrent(task.definition.buildType, "served/getBuildType"));
		if (task.definition.configuration)
			args.push("--config=" + await replaceCurrent(task.definition.configuration, "served/getConfig"));

		if (Array.isArray(task.definition.dub_args))
			args.push.apply(args, task.definition.dub_args);

		if (Array.isArray(task.definition.args)) {
			args.push.apply(args, task.definition.args);
			vscode.window.showWarningMessage("Your task definition is using the deprecated \"args\" field and will be ignored in an upcoming release.\nPlease change \"args\": to \"dub_args\": to keep old behavior.")
		}

		if (Array.isArray(task.definition.target_args) && (task.definition.test || task.definition.run)) {
			// want to validate test/run in JSON schema but tasks schema doesn't allow advanced JSON schema things to be put on the object validator, only on properties
			args.push("--");
			args.push.apply(args, task.definition.target_args);
		}

		let options: any = task.scope && (<vscode.WorkspaceFolder>task.scope).uri;
		let exec = makeExecutor(args.shift() || "exit", args, (options && options.fsPath) || task.definition.cwd || undefined);

		let ret = new vscode.Task(
			task.definition,
			task.scope || vscode.TaskScope.Global,
			task.name || `dub ${task.definition.test ? "Test" : task.definition.run ? "Run" : "Build"}`,
			"dub", exec, dubLint ? task.problemMatchers : ["$dmd"]
		);
		ret.isBackground = task.isBackground;
		if (task.presentationOptions) {
			ret.presentationOptions = task.presentationOptions;
		} else {
			ret.presentationOptions = {
				focus: !!task.definition.run
			};
		}
		(<any>ret).detail = "dub " + args.join(" ");
		return ret;
	}
}

function makeExecutor(proc: string, args: string[], cwd: string): vscode.ProcessExecution | vscode.ShellExecution {
	let options: vscode.ProcessExecutionOptions | undefined = cwd ? { cwd: cwd } : undefined;
	//return new vscode.ProcessExecution(proc, args, options);
	return new vscode.ShellExecution({
		value: proc,
		quoting: vscode.ShellQuoting.Strong
	}, args.map(arg => <vscode.ShellQuotedString>{
		value: arg,
		quoting: vscode.ShellQuoting.Strong
	}), options);
}
