import * as vscode from 'vscode';
import { D_MODE } from "./dmode"
import { WorkspaceD } from "./workspace-d"
import { localize } from "./extension"

export function setup(workspaced: WorkspaceD): vscode.Disposable {
	let subscriptions: vscode.Disposable[] = [];

	subscriptions.push(new ConfigSelector(workspaced));
	subscriptions.push(new ArchSelector(workspaced));
	subscriptions.push(new BuildSelector(workspaced));
	subscriptions.push(new CompilerSelector(workspaced));

	return vscode.Disposable.from(...subscriptions);
}

class ConfigSelector implements vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	private item: vscode.StatusBarItem;

	constructor(private workspaced: WorkspaceD) {
		workspaced.once("dub-ready", this.create.bind(this));
	}

	private create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.92145);
		this.item.command = "code-d.switchConfiguration";
		this.item.tooltip = localize("d.action.switchConfiguration", "Switch Configuration");
		this.item.show();
		this.workspaced.on("configuration-change", config => {
			this.item.text = config;
		});
		this.workspaced.getConfiguration().then(config => {
			this.item.text = config;
		});
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}
}

class ArchSelector implements vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	private item: vscode.StatusBarItem;

	constructor(private workspaced: WorkspaceD) {
		workspaced.once("dub-ready", this.create.bind(this));
	}

	private create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.92144);
		this.item.command = "code-d.switchArchType";
		this.item.tooltip = localize("d.action.switchArchType", "Switch Arch Type");
		this.item.show();
		this.workspaced.on("arch-type-change", arch => {
			this.item.text = arch;
		});
		this.workspaced.getArchType().then(arch => {
			this.item.text = arch;
		});
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}
}

class BuildSelector implements vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	private item: vscode.StatusBarItem;

	constructor(private workspaced: WorkspaceD) {
		workspaced.once("dub-ready", this.create.bind(this));
	}

	private create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.92143);
		this.item.command = "code-d.switchBuildType";
		this.item.tooltip = localize("d.action.switchBuildType", "Switch Build Type");
		this.item.show();
		this.workspaced.on("build-type-change", config => {
			this.item.text = config;
		});
		this.workspaced.getBuildType().then(config => {
			this.item.text = config;
		});
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}
}

class CompilerSelector implements vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	private item: vscode.StatusBarItem;

	constructor(private workspaced: WorkspaceD) {
		workspaced.once("dub-ready", this.create.bind(this));
	}

	private create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.92142);
		this.item.command = "code-d.switchCompiler";
		this.item.tooltip = localize("d.action.switchCompiler", "Switch Compiler");
		this.item.show();
		this.workspaced.on("compiler-change", config => {
			this.item.text = config;
		});
		this.workspaced.getCompiler().then(config => {
			this.item.text = config;
		});
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}
}