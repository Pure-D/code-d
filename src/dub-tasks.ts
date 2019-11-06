import * as vscode from "vscode";
import { config } from "./extension";
import { LanguageClient } from "vscode-languageclient/lib/main";

export class DubTasksProvider implements vscode.TaskProvider {
	constructor(public served: LanguageClient) { }

	provideTasks(token?: vscode.CancellationToken | undefined): vscode.ProviderResult<vscode.Task[]> {
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
				if (task.scope == "global")
					target = vscode.TaskScope.Global;
				else if (task.scope == "workspace")
					target = vscode.TaskScope.Workspace;
				else
					target = vscode.workspace.getWorkspaceFolder(vscode.Uri.parse(task.scope));
				if (!target)
					return undefined;
				var proc: string = task.exec.shift() || "exit";
				var args: string[] = task.exec;
				var t = new vscode.Task(task.definition, target, task.name, task.source, new vscode.ProcessExecution(proc, args), task.problemMatchers);
				t.isBackground = task.isBackground;
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

	resolveTask(task: vscode.Task & {
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
			args?: string[]
		}
	}, token?: vscode.CancellationToken | undefined): vscode.ProviderResult<vscode.Task> {
		var args: string[] = [config(null).get("dubPath", "dub")];
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
			args.push("--compiler=" + task.definition.compiler);
		if (task.definition.archType)
			args.push("--arch=" + task.definition.archType);
		if (task.definition.buildType)
			args.push("--build=" + task.definition.buildType);
		if (task.definition.configuration)
			args.push("--config=" + task.definition.configuration);
		if (Array.isArray(task.definition.args))
			args.push.apply(args, task.definition.args);

		let exec = new vscode.ShellExecution({
			value: args.shift() || "exit",
			quoting: vscode.ShellQuoting.Strong
		}, args.map(arg => <vscode.ShellQuotedString>{
			value: arg,
			quoting: vscode.ShellQuoting.Strong
		}));

		return new vscode.Task(
			task.definition,
			task.scope || vscode.TaskScope.Global,
			task.name || `dub ${task.definition.test ? "Test" : task.definition.run ? "Run" : "Build"}`,
			"dub", exec, task.problemMatchers
		);
	}
}