import * as vscode from "vscode";
import * as path from "path";
import { ServeD, config } from "./extension";

let dubLoaded = false;

export function setupDub(served: ServeD): vscode.Disposable {
	const subscriptions: vscode.Disposable[] = [
		new vscode.Disposable(() => {
			dubLoaded = false;
		}),
	];

	if (dubLoaded) return new vscode.Disposable(() => {});
	dubLoaded = true;

	subscriptions.push(new ConfigSelector(served));
	subscriptions.push(new ArchSelector(served));
	subscriptions.push(new BuildSelector(served));
	subscriptions.push(new CompilerSelector(served));

	return vscode.Disposable.from(...subscriptions);
}

export function isStatusbarRelevantDocument(document: vscode.TextDocument): boolean {
	const language = document.languageId;
	if (language == "d" || language == "dml" || language == "diet") return true;
	const filename = path.basename(document.fileName.toLowerCase());
	if (filename == "dub.json" || filename == "dub.sdl") return true;
	return false;
}

export function checkStatusbarVisibility(overrideConfig: string, editor?: vscode.TextEditor | null): boolean {
	if (editor === null) {
		if (config(null).get(overrideConfig, false)) return true;
		else return false;
	} else {
		if (!editor) editor = vscode.window.activeTextEditor;
		if (editor) {
			if (config(editor.document.uri).get(overrideConfig, false) || isStatusbarRelevantDocument(editor.document))
				return true;
			else return false;
		} else {
			return false;
		}
	}
}

class GenericSelector implements vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	item?: vscode.StatusBarItem;

	constructor(
		public served: ServeD,
		public x: number,
		public command: string,
		public tooltip: string,
		public event: string,
		public method: string,
		public fallback: string,
	) {
		this.create();
	}

	protected create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, this.x);
		this.item.command = this.command;
		this.item.tooltip = this.tooltip;
		this.updateDocumentVisibility();
		this.subscriptions.push(
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				this.updateDocumentVisibility(editor || null);
			}),
		);
		this.served.on(this.event, (config) => {
			if (this.item) this.item.text = config || this.fallback;
		});
		this.served.on("workspace-change", () => {
			this.update();
		});
		this.update();
	}

	updateDocumentVisibility(editor?: vscode.TextEditor | null) {
		if (this.item) {
			if (checkStatusbarVisibility("alwaysShowDubStatusButtons", editor)) this.item.show();
			else this.item.hide();
		}
	}

	update() {
		this.served.client.sendRequest<string>(this.method).then((config) => {
			if (this.item) this.item.text = config || this.fallback;
		});
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}
}

class ConfigSelector extends GenericSelector {
	constructor(served: ServeD) {
		super(
			served,
			0.92145,
			"code-d.switchConfiguration",
			"Switch Configuration",
			"config-change",
			"served/getConfig",
			"(config)",
		);
	}
}
class ArchSelector extends GenericSelector {
	constructor(served: ServeD) {
		super(
			served,
			0.92144,
			"code-d.switchArchType",
			"Switch Arch Type",
			"arch-type-change",
			"served/getArchType",
			"(default arch)",
		);
	}
}

class BuildSelector extends GenericSelector {
	constructor(served: ServeD) {
		super(
			served,
			0.92143,
			"code-d.switchBuildType",
			"Switch Build Type",
			"build-type-change",
			"served/getBuildType",
			"(build type)",
		);
	}
}

class CompilerSelector extends GenericSelector {
	constructor(served: ServeD) {
		super(
			served,
			0.92142,
			"code-d.switchCompiler",
			"Switch Compiler",
			"compiler-change",
			"served/getCompiler",
			"(compiler)",
		);
	}
}

export class StartupProgress {
	startedGlobal: boolean = false;
	workspace: string | undefined;

	progress: vscode.Progress<{ message?: string; increment?: number }> | undefined;
	resolve: (() => void) | undefined;
	reject: (() => void) | undefined;

	constructor() {}

	async startGlobal() {
		if (this.startedGlobal) return;

		this.startedGlobal = true;

		vscode.window.withProgress(
			{
				cancellable: false,
				location: vscode.ProgressLocation.Window,
				title: "D",
			},
			(progress) => {
				this.progress = progress;
				return new Promise<void>((resolve, reject) => {
					this.resolve = resolve;
					this.reject = reject;
				});
			},
		);
	}

	finishGlobal() {
		if (!this.startedGlobal) return;

		this.startedGlobal = false;
		if (this.resolve) this.resolve();
		this.progress = undefined;
		this.resolve = undefined;
		this.reject = undefined;
	}

	globalStep(step: number, max: number, title: string, msg: string) {
		if (!this.startedGlobal || !this.progress) return;

		const percent = step / (max || 1);

		this.progress.report({
			message: title + " (" + formatPercent(percent) + "): " + msg,
		});
	}

	setWorkspace(name: string) {
		this.workspace = name;
		this.globalStep(0, 1, "workspace " + name, "starting up...");
	}

	workspaceStep(step: number, max: number, msg: string) {
		this.globalStep(step, max, "workspace " + this.workspace, msg);
	}
}

function formatPercent(p: number) {
	return (p * 100).toFixed(1) + " %";
}
