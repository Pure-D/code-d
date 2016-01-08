import * as vscode from 'vscode';
import { D_MODE } from "./dmode"
import { WorkspaceD } from "./workspace-d"

export function setup(workspaced: WorkspaceD): vscode.Disposable {
	let subscriptions: vscode.Disposable[] = [];

	subscriptions.push(new ConfigSelector(workspaced));
	subscriptions.push(new BuildSelector(workspaced));

	return vscode.Disposable.from(...subscriptions);
}

class ConfigSelector implements vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	private item: vscode.StatusBarItem;

	constructor(private workspaced: WorkspaceD) {
		workspaced.once("dub-ready", this.create.bind(this));
	}

	private create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 2);
		this.item.command = "code-d.switchConfiguration";
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

class BuildSelector implements vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	private item: vscode.StatusBarItem;

	constructor(private workspaced: WorkspaceD) {
		workspaced.once("dub-ready", this.create.bind(this));
	}

	private create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
		this.item.command = "code-d.switchBuildType";
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