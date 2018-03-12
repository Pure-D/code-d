import * as vscode from 'vscode';
import { D_MODE } from "./dmode"
import { ServeD } from "./extension";

export function setup(served: ServeD): vscode.Disposable {
	let subscriptions: vscode.Disposable[] = [];

	subscriptions.push(new ConfigSelector(served));
	subscriptions.push(new ArchSelector(served));
	subscriptions.push(new BuildSelector(served));
	subscriptions.push(new CompilerSelector(served));

	return vscode.Disposable.from(...subscriptions);
}

class ConfigSelector implements vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	private item?: vscode.StatusBarItem;

	constructor(private served: ServeD) {
		served.client.onReady().then(this.create.bind(this));
	}

	private create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.92145);
		this.item.command = "code-d.switchConfiguration";
		this.item.tooltip = "Switch Configuration";
		this.item.show();
		this.served.on("config-change", config => {
			if (this.item)
				this.item.text = config;
		});
		this.served.client.sendRequest<string>("served/getConfig").then(config => {
			if (this.item)
				this.item.text = config;
		});
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}
}

class ArchSelector implements vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	private item?: vscode.StatusBarItem;

	constructor(private served: ServeD) {
		served.client.onReady().then(this.create.bind(this));
	}

	private create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.92144);
		this.item.command = "code-d.switchArchType";
		this.item.tooltip = "Switch Arch Type";
		this.item.show();
		this.served.on("arch-type-change", arch => {
			if (this.item)
				this.item.text = arch;
		});
		this.served.client.sendRequest<string>("served/getArchType").then(arch => {
			if (this.item)
				this.item.text = arch;
		});
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}
}

class BuildSelector implements vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	private item?: vscode.StatusBarItem;

	constructor(private served: ServeD) {
		served.client.onReady().then(this.create.bind(this));
	}

	private create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.92143);
		this.item.command = "code-d.switchBuildType";
		this.item.tooltip = "Switch Build Type";
		this.item.show();
		this.served.on("build-type-change", type => {
			if (this.item)
				this.item.text = type;
		});
		this.served.client.sendRequest<string>("served/getBuildType").then(type => {
			if (this.item)
				this.item.text = type;
		});
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}
}

class CompilerSelector implements vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	private item?: vscode.StatusBarItem;

	constructor(private served: ServeD) {
		served.client.onReady().then(this.create.bind(this));
	}

	private create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0.92142);
		this.item.command = "code-d.switchCompiler";
		this.item.tooltip = "Switch Compiler";
		this.item.show();
		this.served.on("compiler-change", compiler => {
			if (this.item)
				this.item.text = compiler;
		});
		this.served.client.sendRequest<string>("served/getCompiler").then(compiler => {
			if (this.item)
				this.item.text = compiler;
		});
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}
}