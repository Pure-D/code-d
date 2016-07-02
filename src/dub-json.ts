import { IJSONContribution, ISuggestionsCollector } from "./json-contributions";
import * as vscode from "vscode";
import { Location } from "jsonc-parser";
import { searchDubPackages, listPackages, getPackageInfo, getLatestPackageInfo } from "./dub-api"

var semverRegex = /(\d+)\.(\d+)\.(\d+)/;

function pad3(n) {
	if (n >= 100)
		return n.toString();
	if (n >= 10)
		return "0" + n.toString();
	return "00" + n.toString();
}

export class DubJSONContribution implements IJSONContribution {
	public getDocumentSelector(): vscode.DocumentSelector {
		return [{ language: "json", pattern: "**/dub.json" }];
	}

	public getInfoContribution(fileName: string, location: Location): Thenable<vscode.MarkedString[]> {
		if (location.path.length < 2 || location.path[location.path.length - 2] != "dependencies")
			return null;
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
		return null;
	}

	public collectPropertySuggestions(fileName: string, location: Location, currentWord: string, addValue: boolean, isLast: boolean, result: ISuggestionsCollector): Thenable<any> {
		if (location.path[location.path.length - 1] != "dependencies" && location.path[location.path.length - 2] != "dependencies")
			return null;
		return new Promise((resolve, reject) => {
			if (currentWord.length > 0) {
				var colonIdx = currentWord.indexOf(":");
				if (colonIdx == -1) {
					searchDubPackages(currentWord).then(json => {
						json.forEach(element => {
							var item = new vscode.CompletionItem(element.name);
							var insertText = JSON.stringify(element.name);
							if (addValue) {
								insertText += ': "{{' + element.version + '}}"';
								if (!isLast)
									insertText += ",";
							}
							item.insertText = insertText;
							item.kind = vscode.CompletionItemKind.Property;
							item.documentation = element.description;
							result.add(item);
						});
						resolve();
					}, err => {
						console.log("Error searching for packages");
						console.log(err);
						resolve();
					});
				} else {
					var pkgName = currentWord.substr(0, colonIdx);
					getLatestPackageInfo(pkgName).then(info => {
						info.subPackages.forEach(subPkgName => {
							var completionName = pkgName + ":" + subPkgName;
							var item = new vscode.CompletionItem(completionName);
							var insertText = JSON.stringify(completionName);
							if (addValue) {
								insertText += ': "{{' + info.version + '}}"';
								if (!isLast)
									insertText += ",";
							}
							item.insertText = insertText;
							item.kind = vscode.CompletionItemKind.Property;
							item.documentation = info.description;
							result.add(item);
						});
						resolve();
					}, err => {
						result.error("Package not found");
						resolve();
					});
				}
			}
			else {
				listPackages().then(json => {
					json.forEach(element => {
						var item = new vscode.CompletionItem(element);
						item.kind = vscode.CompletionItemKind.Property;
						var insertText = JSON.stringify(element);
						if (addValue) {
							insertText += ': "{{}}"';
							if (!isLast)
								insertText += ",";
						}
						item.insertText = insertText;
						result.add(item);
					});
					resolve();
				}, err => {
					console.log("Error searching for packages");
					console.log(err);
					resolve();
				});
			}
		});
	}

	public collectValueSuggestions(fileName: string, location: Location, result: ISuggestionsCollector): Thenable<any> {
		let currentKey = undefined;
		if (location.path[location.path.length - 2] == "dependencies")
			currentKey = location.path[location.path.length - 1];
		else if (location.path[location.path.length - 3] == "dependencies" && location.path[location.path.length - 1] == "version")
			currentKey = location.path[location.path.length - 2];
		else
			return null;
		if (typeof currentKey === "string") {
			return new Promise((resolve, reject) => {
				getPackageInfo(currentKey).then(json => {
					var versions = json.versions;
					if (!versions || !versions.length) {
						result.error("No versions found");
						return resolve();
					}
					for (var i = versions.length - 1; i >= 0; i--) {
						var item = new vscode.CompletionItem(versions[i].version);
						item.detail = "Released on " + new Date(versions[i].date).toLocaleDateString();
						item.kind = vscode.CompletionItemKind.Class;
						item.insertText = JSON.stringify("{{}}" + versions[i].version);
						var sortText = "999999999";
						var semverMatch = semverRegex.exec(versions[i].version);
						if (semverMatch) {
							sortText = pad3(999 - parseInt(semverMatch[1])) + pad3(999 - parseInt(semverMatch[2])) + pad3(999 - parseInt(semverMatch[3]));
						}
						item.sortText = sortText;
						result.add(item);
					}
					resolve();
				}, error => {
					result.error(error.toString());
					resolve();
				});
			});
		}
		return null;
	}

	public resolveSuggestion(item: vscode.CompletionItem): Thenable<vscode.CompletionItem> {
		if (item.kind === vscode.CompletionItemKind.Property) {
			let pack = item.label
			return getLatestPackageInfo(pack).then(info => {
				if (info.description) {
					item.documentation = info.description;
				}
				if (info.version) {
					item.detail = info.version;
					item.insertText = item.insertText.replace(/\{\{\}\}/, "{{" + info.version + "}}");
				}
				return item;
			}, err => {
				return null;
			});
		}
		return null;
	}
}