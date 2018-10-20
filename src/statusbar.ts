import * as vscode from 'vscode';
import * as path from 'path';
import { D_MODE } from "./dmode"
import { ServeD, config } from "./extension";

export function setup(served: ServeD): vscode.Disposable {
	let subscriptions: vscode.Disposable[] = [];

	subscriptions.push(new ConfigSelector(served));
	subscriptions.push(new ArchSelector(served));
	subscriptions.push(new BuildSelector(served));
	subscriptions.push(new CompilerSelector(served));

	return vscode.Disposable.from(...subscriptions);
}

export function isStatusbarRelevantDocument(document: vscode.TextDocument): boolean {
	var language = document.languageId;
	if (language == "d" || language == "dml" || language == "diet")
		return true;
	var filename = path.basename(document.fileName.toLowerCase());
	if (filename == "dub.json" || filename == "dub.sdl")
		return true;
	return false;
}

export function checkStatusbarVisibility(overrideConfig: string, editor?: vscode.TextEditor | null): boolean {
	if (editor === null) {
		if (config(null).get(overrideConfig, false))
			return true
		else
			return false
	} else {
		if (!editor)
			editor = vscode.window.activeTextEditor;
		if (editor) {
			if (config(editor.document.uri).get(overrideConfig, false) || isStatusbarRelevantDocument(editor.document))
				return true
			else
				return false
		} else {
			return false;
		}
	}
}

class GenericSelector implements vscode.Disposable {
	subscriptions: vscode.Disposable[] = [];
	item?: vscode.StatusBarItem;
	served: ServeD;
	x: number;
	command: string;
	tooltip: string;
	event: string;
	method: string;

	constructor(served: ServeD, x: number, command: string, tooltip: string, event: string, method: string) {
		this.served = served;
		this.x = x;
		this.command = command;
		this.tooltip = tooltip;
		this.event = event;
		this.method = method;
		served.client.onReady().then(this.create.bind(this));
	}

	protected create() {
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, this.x);
		this.item.command = this.command;
		this.item.tooltip = this.tooltip;
		this.updateDocumentVisibility();
		this.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
			this.updateDocumentVisibility(editor || null);
		}));
		this.served.on(this.event, config => {
			if (this.item)
				this.item.text = config;
		});
		this.served.on("workspace-change", () => {
			this.update();
		});
		this.update();
	}

	updateDocumentVisibility(editor?: vscode.TextEditor | null) {
		if (this.item) {
			if (checkStatusbarVisibility("alwaysShowDubStatusButtons", editor))
				this.item.show();
			else
				this.item.hide();
		}
	}

	update() {
		this.served.client.sendRequest<string>(this.method).then(config => {
			if (this.item)
				this.item.text = config;
		});
	}

	dispose() {
		vscode.Disposable.from(...this.subscriptions).dispose();
	}
}

class ConfigSelector extends GenericSelector {
	constructor(served: ServeD) {
		super(served, 0.92145, "code-d.switchConfiguration", "Switch Configuration", "config-change", "served/getConfig");
	}
}
class ArchSelector extends GenericSelector {
	constructor(served: ServeD) {
		super(served, 0.92144, "code-d.switchArchType", "Switch Arch Type", "arch-type-change", "served/getArchType");
	}
}

class BuildSelector extends GenericSelector {
	constructor(served: ServeD) {
		super(served, 0.92143, "code-d.switchBuildType", "Switch Build Type", "build-type-change", "served/getBuildType");
	}
}

class CompilerSelector extends GenericSelector {
	constructor(served: ServeD) {
		super(served, 0.92142, "code-d.switchCompiler", "Switch Compiler", "compiler-change", "served/getCompiler");
	}
}