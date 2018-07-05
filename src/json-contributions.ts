import { Location, getLocation, createScanner, SyntaxKind } from 'jsonc-parser';
import { DubJSONContribution } from './dub-json';
import * as vscode from 'vscode';

export interface ISuggestionsCollector {
	add(suggestion: vscode.CompletionItem): void;
	error(message: string): void;
	log(message: string): void;
}

export interface IJSONContribution {
	getDocumentSelector(): vscode.DocumentSelector;
	getInfoContribution(fileName: string, location: Location): Thenable<vscode.MarkedString[]>;
	collectPropertySuggestions(fileName: string, location: Location, currentWord: string, addValue: boolean, isLast: boolean, result: ISuggestionsCollector): Thenable<any>;
	collectValueSuggestions(fileName: string, location: Location, result: ISuggestionsCollector): Thenable<any>;
	resolveSuggestion?(item: vscode.CompletionItem): Thenable<vscode.CompletionItem>;
}

export function addJSONProviders(): vscode.Disposable {
	let subscriptions: vscode.Disposable[] = [];

	// register completion and hove providers for JSON setting file(s)
	let contributions = [new DubJSONContribution()];
	contributions.forEach(contribution => {
		var provider = new JSONProvider(contribution);
		let selector = contribution.getDocumentSelector();
		subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, provider, '"', ':'));
		subscriptions.push(vscode.languages.registerHoverProvider(selector, provider));
	});

	return vscode.Disposable.from(...subscriptions);
}

export class JSONProvider implements vscode.HoverProvider, vscode.CompletionItemProvider {

	constructor(private jsonContribution: IJSONContribution) {
	}

	public provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.Hover> | null {
		let offset = document.offsetAt(position);
		let location = getLocation(document.getText(), offset);
		let node = location.previousNode;
		if (node && node.offset <= offset && offset <= node.offset + node.length) {
			let promise = this.jsonContribution.getInfoContribution(document.fileName, location);
			if (promise) {
				return promise.then(htmlContent => {
					let range = new vscode.Range(document.positionAt((<any>node).offset), document.positionAt((<any>node).offset + (<any>node).length));
					let result: vscode.Hover = {
						contents: htmlContent,
						range: range
					};
					return result;
				});
			}
		}
		return null;
	}

	public resolveCompletionItem(item: vscode.CompletionItem, token: vscode.CancellationToken): Thenable<vscode.CompletionItem> {
		if (this.jsonContribution.resolveSuggestion) {
			let resolver = this.jsonContribution.resolveSuggestion(item);
			if (resolver) {
				return resolver;
			}
		}
		return Promise.resolve(item);
	}

	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionList | null> | null {
		let currentWord = this.getCurrentWord(document, position);
		let overwriteRange: vscode.Range | null = null;
		let items: vscode.CompletionItem[] = [];

		let offset = document.offsetAt(position);
		let location = getLocation(document.getText(), offset);

		let node = location.previousNode;
		if (node && node.offset <= offset && offset <= node.offset + node.length && (node.type === 'property' || node.type === 'string' || node.type === 'number' || node.type === 'boolean' || node.type === 'null')) {
			overwriteRange = new vscode.Range(document.positionAt(node.offset), document.positionAt(node.offset + node.length));
		} else {
			overwriteRange = new vscode.Range(document.positionAt(offset - currentWord.length), position);
		}

		let proposed: { [key: string]: boolean } = {};
		let collector: ISuggestionsCollector = {
			add: (suggestion: vscode.CompletionItem) => {
				if (!proposed[suggestion.label]) {
					proposed[suggestion.label] = true;
					if (overwriteRange) {
						suggestion.range = overwriteRange;
					}

					items.push(suggestion);
				}
			},
			error: (message: string) => console.error(message),
			log: (message: string) => console.log(message)
		};

		let collectPromise: Thenable<any> | null = null;

		if (location.isAtPropertyKey) {
			let addValue = !location.previousNode || !location.previousNode.colonOffset && (offset == (location.previousNode.offset + location.previousNode.length));
			let scanner = createScanner(document.getText(), true);
			scanner.setPosition(offset);
			scanner.scan();
			let isLast = scanner.getToken() === SyntaxKind.CloseBraceToken || scanner.getToken() === SyntaxKind.EOF;
			collectPromise = this.jsonContribution.collectPropertySuggestions(document.fileName, location, currentWord, addValue, isLast, collector);
		} else if (location.path.length !== 0)
			collectPromise = this.jsonContribution.collectValueSuggestions(document.fileName, location, collector);

		if (collectPromise) {
			return collectPromise.then(() => {
				if (items.length > 0)
					return new vscode.CompletionList(items);
				else
					return null;
			});
		}
		return null;
	}

	private getCurrentWord(document: vscode.TextDocument, position: vscode.Position) {
		var i = position.character - 1;
		var text = document.lineAt(position.line).text;
		while (i >= 0 && ' \t\n\r\v"{[,'.indexOf(text.charAt(i)) === -1) {
			i--;
		}
		return text.substring(i + 1, position.character);
	}
}