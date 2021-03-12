import { IJSONContribution, ISuggestionsCollector } from "./json-contributions";
import * as vscode from "vscode";
import { Location } from "jsonc-parser";
import { searchDubPackages, listPackages, getPackageInfo, getLatestPackageInfo } from "./dub-api"
import { cmpSemver } from "./installer";

function pad3(n: number) {
	if (n >= 100)
		return n.toString();
	if (n >= 10)
		return "0" + n.toString();
	return "00" + n.toString();
}

export class DubJSONContribution implements IJSONContribution {
	public getDocumentSelector(): vscode.DocumentSelector {
		return [{ language: "json", pattern: "**/dub.json", scheme: "file" }];
	}

	public getInfoContribution(fileName: string, location: Location): Thenable<vscode.MarkedString[]> {
		if (location.path.length < 2 || location.path[location.path.length - 2] != "dependencies")
			return Promise.resolve([]);
		let pack = location.path[location.path.length - 1];
		if (typeof pack === "string") {
			return getLatestPackageInfo(pack).then(info => {
				let htmlContent: vscode.MarkedString[] = [];
				htmlContent.push("Package " + pack);
				if (info.description) {
					htmlContent.push(info.description);
				}
				if (info.version) {
					htmlContent.push("Latest version: " + info.version);
				}
				return htmlContent;
			});
		}
		return Promise.resolve([]);
	}

	public collectPropertySuggestions(fileName: string, location: Location, currentWord: string, addValue: boolean, isLast: boolean, result: ISuggestionsCollector): Thenable<any> {
		if (location.path[location.path.length - 1] != "dependencies" && location.path[location.path.length - 2] != "dependencies")
			return Promise.resolve(null);
		return new Promise((resolve, reject) => {
			if (currentWord.length > 0) {
				var colonIdx = currentWord.indexOf(":");
				if (colonIdx == -1) {
					searchDubPackages(currentWord).then(json => {
						json.forEach(element => {
							var item = new vscode.CompletionItem(element.name);
							var insertText = new vscode.SnippetString().appendText(JSON.stringify(element.name));
							if (addValue) {
								insertText.appendText(': "').appendPlaceholder(element.version).appendText('"');
								if (!isLast)
									insertText.appendText(",");
							}
							item.insertText = insertText;
							item.kind = vscode.CompletionItemKind.Property;
							item.documentation = element.description;
							result.add(item);
						});
						resolve(undefined);
					}, err => {
						console.log("Error searching for packages");
						console.log(err);
						resolve(undefined);
					});
				} else {
					var pkgName = currentWord.substr(0, colonIdx);
					getLatestPackageInfo(pkgName).then(info => {
						if (info.subPackages)
							info.subPackages.forEach(subPkgName => {
								var completionName = pkgName + ":" + subPkgName;
								var item = new vscode.CompletionItem(completionName);
								var insertText = new vscode.SnippetString().appendText(JSON.stringify(completionName));
								if (addValue) {
									insertText.appendText(': "').appendPlaceholder(info.version || "").appendText('"');
									if (!isLast)
										insertText.appendText(",");
								}
								item.insertText = insertText;
								item.kind = vscode.CompletionItemKind.Property;
								item.documentation = info.description;
								result.add(item);
							});
						resolve(undefined);
					}, err => {
						result.error("Package not found");
						resolve(undefined);
					});
				}
			}
			else {
				listPackages().then(json => {
					json.forEach(element => {
						var item = new vscode.CompletionItem(element);
						item.kind = vscode.CompletionItemKind.Property;
						var insertText = new vscode.SnippetString().appendText(JSON.stringify(element));
						if (addValue) {
							insertText.appendText(': "').appendPlaceholder("").appendText('"');
							if (!isLast)
								insertText.appendText(",");
						}
						item.insertText = insertText;
						result.add(item);
					});
					resolve(undefined);
				}, err => {
					console.log("Error searching for packages");
					console.log(err);
					resolve(undefined);
				});
			}
		});
	}

	public collectValueSuggestions(fileName: string, location: Location, result: ISuggestionsCollector): Thenable<any> {
		let currentKey: any = undefined;
		if (location.path[location.path.length - 2] == "dependencies")
			currentKey = location.path[location.path.length - 1];
		else if (location.path[location.path.length - 3] == "dependencies" && location.path[location.path.length - 1] == "version")
			currentKey = location.path[location.path.length - 2];
		else
			return Promise.resolve(null);
		if (typeof currentKey === "string") {
			return new Promise((resolve, reject) => {
				getPackageInfo(currentKey).then(json => {
					var versions = json.versions;
					if (!versions || !versions.length) {
						result.error("No versions found");
						return resolve(undefined);
					}
					var items: vscode.CompletionItem[] = [];
					for (var i = versions.length - 1; i >= 0; i--) {
						var item = new vscode.CompletionItem(versions[i].version);
						item.detail = "Released on " + new Date(versions[i].date).toLocaleDateString();
						item.kind = vscode.CompletionItemKind.Class;
						item.insertText = new vscode.SnippetString().appendPlaceholder("").appendText(versions[i].version);
						item.sortText = "0";
						items.push(item);
					}
					items.sort((a, b) => cmpSemver(b.label, a.label));
					for (let i = 0; i < items.length; i++) {
						items[i].sortText = (10000000 + i).toString(); // lazy 0 pad
						result.add(items[i]);
					}
					resolve(undefined);
				}, error => {
					result.error(error.toString());
					resolve(undefined);
				});
			});
		}
		return Promise.resolve(null);
	}

	public resolveSuggestion(item: vscode.CompletionItem): Thenable<vscode.CompletionItem> {
		if (item.kind === vscode.CompletionItemKind.Property) {
			let pack = item.label
			return getLatestPackageInfo(pack).then((info: any) => {
				if (info.description) {
					item.documentation = info.description;
				}
				if (info.version) {
					item.detail = info.version;
					item.insertText = new vscode.SnippetString((<vscode.SnippetString>item.insertText).value.replace(/\{\{\}\}/, "{{" + info.version + "}}"));
				}
				return item;
			}, err => {
				return <any>undefined;
			});
		}
		return Promise.resolve(<any>undefined);
	}
}