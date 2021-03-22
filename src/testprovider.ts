import * as vscode from "vscode";
import * as path from "path";
import { ServeD, served } from "./extension";
import { TestLoadStartedEvent, TestLoadFinishedEvent, TestRunStartedEvent, TestRunFinishedEvent, TestSuiteEvent, TestEvent, TestAdapter, TestHub, TestSuiteInfo } from "vscode-test-adapter-api";
import { DocumentUri, Range } from "vscode-languageclient";

export interface UnittestProject
{
	/// Workspace uri which may or may not map to an actual workspace folder
	/// but rather to some folder inside one.
	workspaceUri: DocumentUri;
	name: string;
	modules: UnittestModule[];
	needsLoad: boolean;
}

export interface UnittestModule
{
	moduleName: string;
	uri: DocumentUri;
	tests: UnittestInfo[];
}

export interface UnittestInfo
{
	id: string;
	name: string;
	containerName: string;
	range: Range;
}

export class TestAdapterGenerator implements vscode.Disposable {
	private adapters: { [index: string]: ServeDTestProvider } = {};

	constructor(
		public served: ServeD,
		public testHub: TestHub
	) {
	}

	updateTests(tests: UnittestProject) {
		if (tests.needsLoad)
			return; // no lazy load in TestAdapter API

		let adapter = this.adapters[tests.workspaceUri];
		if (!adapter) {
			const uri = vscode.Uri.parse(tests.workspaceUri);
			adapter = this.adapters[tests.workspaceUri] = new ServeDTestProvider(
				this.served,
				tests.workspaceUri,
				tests.name || path.basename(uri.fsPath),
				vscode.workspace.getWorkspaceFolder(uri),
				tests.needsLoad
			);
			this.testHub.registerTestAdapter(adapter);
		}

		adapter.updateModules(tests.needsLoad, tests.modules);
	}

	dispose() {
		vscode.Disposable.from(...Object.values(this.adapters)).dispose();
	}
}

export class ServeDTestProvider implements TestAdapter, vscode.Disposable {
	private disposables: { dispose(): void }[] = [];

	private readonly testsEmitter = new vscode.EventEmitter<TestLoadStartedEvent | TestLoadFinishedEvent>();
	private readonly testStatesEmitter = new vscode.EventEmitter<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent>();
	private readonly autorunEmitter = new vscode.EventEmitter<void>();

	get tests(): vscode.Event<TestLoadStartedEvent | TestLoadFinishedEvent> { return this.testsEmitter.event; }
	get testStates(): vscode.Event<TestRunStartedEvent | TestRunFinishedEvent | TestSuiteEvent | TestEvent> { return this.testStatesEmitter.event; }
	get autorun(): vscode.Event<void> | undefined { return this.autorunEmitter.event; }

	private modules: UnittestModule[] = [];
	private firstLoad: boolean;

	constructor(
		public served: ServeD,
		public folderId: string,
		public folderName: string,
		public workspace?: vscode.WorkspaceFolder,
		public needsLoad?: boolean
	) {
		this.firstLoad = true;
	}

	updateModules(needsLoad: boolean, modules: UnittestModule[]) {
		this.needsLoad = needsLoad;
		this.modules = modules;
		let suite: TestSuiteInfo = {
			id: "project_" + this.folderId,
			label: this.folderName,
			type: "suite",
			debuggable: true,
			children: []
		};

		modules.forEach(module => {
			const file = vscode.Uri.parse(module.uri).fsPath;
			let moduleInfo: TestSuiteInfo = {
				type: "suite",
				debuggable: true,
				id: "module_" + module.uri,
				label: module.moduleName.startsWith("(file)")
					? "File " + module.moduleName.substring(6).trim()
					: "Module " + module.moduleName,
				children: [],
				file: file
			};

			module.tests.forEach(test => {
				moduleInfo.children.push({
					type: "test",
					id: "test_" + test.id,
					label: test.name,
					description: test.containerName
						? `in ${test.containerName}`
						: undefined,
					debuggable: true,
					file: file,
					line: test.range.start.line
				});
			});

			suite.children.push(moduleInfo);
		});

		this.testsEmitter.fire({
			type: "finished",
			suite: suite
		});
	}

	async load(): Promise<void> {
		if (this.firstLoad) {
			this.firstLoad = false;
			// skip first load (already emitting loaded)
			// only do reloads
			return;
		}

		this.served.client.sendRequest("served/rescanTests", { uri: this.folderId });
	}

	async run(tests: string[]): Promise<void> {
	}

	async debug(tests: string[]): Promise<void> {
	}

	cancel(): void {
		// in a "real" TestAdapter this would kill the child process for the current test run (if there is any)
		throw new Error("Method not implemented.");
	}

	dispose() {
		this.cancel();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}