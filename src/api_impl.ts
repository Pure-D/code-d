import { ServeD } from "./extension";
import { CodedAPI, Snippet } from "code-d-api";

/**
 * Implementation of the code-d API using serve-d
 */
export class CodedAPIServedImpl implements CodedAPI {
	protected served?: ServeD;

	protected dependencySnippetsToRegister: [string[], Snippet][] = [];
	registerDependencyBasedSnippet(requiredDependencies: string[], snippet: Snippet): void {
		this.dependencySnippetsToRegister.push([requiredDependencies, snippet]);

		if (this.served) {
			this.served.addDependencySnippet({
				requiredDependencies: requiredDependencies,
				snippet: snippet
			});
		}
	}

	registerDependencyBasedSnippets(requiredDependencies: string[], snippets: Snippet[]): void {
		snippets.forEach(snippet => {
			this.registerDependencyBasedSnippet(requiredDependencies, snippet);
		});
	}

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

	// singleton
	static instance?: CodedAPIServedImpl;
	static getInstance(): CodedAPIServedImpl {
		if (this.instance)
			return this.instance;
		else
			return this.instance = new CodedAPIServedImpl();
	}
}