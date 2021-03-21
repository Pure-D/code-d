import { DScannerIniSection, ServeD } from "./extension";
import { CodedAPI, Snippet } from "code-d-api";
import * as vscode from "vscode";

/**
 * Implementation of the code-d API using serve-d
 */
export class CodedAPIServedImpl implements CodedAPI {
	protected served?: ServeD;

	protected dependencySnippetsToRegister: [string[], Snippet][] = [];
	registerDependencyBasedSnippet(requiredDependencies: string[], snippet: Snippet): void {
		this.dependencySnippetsToRegister.push([requiredDependencies, snippet]);

		this.served?.addDependencySnippet({
			requiredDependencies: requiredDependencies,
			snippet: snippet
		});
	}

	registerDependencyBasedSnippets(requiredDependencies: string[], snippets: Snippet[]): void {
		snippets.forEach(snippet => {
			this.registerDependencyBasedSnippet(requiredDependencies, snippet);
		});
	}

	refreshDependencies(): boolean {
		if (this.served) {
			this.served.refreshDependencies();
			return true;
		} else {
			return false;
		}
	}

	triggerDscanner(uri: string | vscode.Uri): boolean {
		if (this.served) {
			if (typeof uri == "string")
				uri = vscode.Uri.parse(uri);
	
			this.served.triggerDscanner(uri);
			return true;
		} else {
			return false;
		}
	}

	async listDscannerConfig(uri: string | vscode.Uri): Promise<DScannerIniSection[]> {
		if (typeof uri == "string")
			uri = vscode.Uri.parse(uri);

		const served = await this.waitForInternalImplementation();
		return await served.listDScannerConfig(uri);
	}

	async findFiles(query: string): Promise<string[]> {
		const served = await this.waitForInternalImplementation();
		return await served.findFiles(query);
	}

	async findFilesByModule(query: string): Promise<string[]> {
		const served = await this.waitForInternalImplementation();
		return await served.findFilesByModule(query);
	}

	async getActiveDubConfig(): Promise<{ packagePath: string, packageName: string, [unstableExtras: string]: any }> {
		const served = await this.waitForInternalImplementation();
		return await served.getActiveDubConfig();
	}

	get isActive(): boolean {
		return !!this.served;
	}

	// ------------------------------------------------------------------------
	//          Implementation details starting here, no stable API
	// ------------------------------------------------------------------------

	private _onInternalImplementationReady: vscode.EventEmitter<ServeD> = new vscode.EventEmitter<ServeD>();
	readonly onInternalImplementationReady: vscode.Event<ServeD> = this._onInternalImplementationReady.event;

	started(served: ServeD) {
		this.served = served;
		let promises: Thenable<boolean>[] = [];
		this.dependencySnippetsToRegister.forEach(snip => {
			promises.push(served.addDependencySnippet({
				requiredDependencies: snip[0],
				snippet: snip[1]
			}));
		});
		Promise.all(promises).then((all) => {
			// done
		});
	}

	waitForInternalImplementation(): Thenable<ServeD> {
		if (this.served)
			return Promise.resolve(this.served);
		else
			return new Promise((resolve) => {
				if (this.served)
					resolve(this.served);
				else
					this.onInternalImplementationReady(resolve);
			});
	}

	// singleton
	static instance?: CodedAPIServedImpl;
	static getInstance(): CodedAPIServedImpl {
		if (this.instance)
			return this.instance;
		else
			return this.instance = new CodedAPIServedImpl();
	}
}