import { IJSONContribution, ISuggestionsCollector } from "./json-contributions";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
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

	public getInfoContribution(fileName: string, location: Location): Thenable<vscode.MarkdownString[]> {
		if (location.path.length < 2 || location.path[location.path.length - 2] != "dependencies")
			return Promise.resolve([]);
		let pack = location.path[location.path.length - 1];
		if (typeof pack === "string") {
			return getLatestPackageInfo(pack).then(info => {
				let htmlContent: vscode.MarkdownString[] = [];
				htmlContent.push(new vscode.MarkdownString("Package " + pack));
				if (info.description) {
					let block = new vscode.MarkdownString(info.description);
					block.isTrusted = false;
					htmlContent.push(block);
				}
				if (info.license || info.copyright) {
					let block = new vscode.MarkdownString();
					if (info.license)
						block.appendText("License: " + info.license + "\n");
					if (info.copyright)
						block.appendText("Copyright: " + info.copyright + "\n");
					block.isTrusted = false;
					htmlContent.push(block);
				}
				if (info.version) {
					htmlContent.push(new vscode.MarkdownString("Latest version: " + info.version));
				}
				return htmlContent;
			});
		}
		return Promise.resolve([]);
	}

	public collectPropertySuggestions(fileName: string, location: Location, currentWord: string, addValue: boolean, isLast: boolean, result: ISuggestionsCollector): Thenable<any> {
		if (location.isAtPropertyKey) {
			// complete in { "dependencies": {...} } - path == ["...root", "dependencies", ""]
			// but not in { "dependencies": { "vibe-d": {...} }} - path == ["...root", "dependencies", "vibe-d", ""]
			if (!(location.path[location.path.length - 2] == "dependencies"))
				return Promise.resolve(null);
		} else {
			// dunno if this else is ever reached since updating the collection code...
			// does not seem like it and can probably be removed
			if (location.path[location.path.length - 1] != "dependencies" && location.path[location.path.length - 2] != "dependencies")
				return Promise.resolve(null);
		}

		return new Promise((resolve, reject) => {
			let keyString = location.previousNode?.value || currentWord;
			var colonIdx = keyString.indexOf(":");
			if (colonIdx != -1) {
				var pkgName = keyString.substr(0, colonIdx);
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
						item.filterText = JSON.stringify(element);
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
		const inArray = typeof location.path[location.path.length - 1] == "number";
		let keyName: string;
		if (inArray) {
			keyName = <string>location.path[location.path.length - 2];
		} else {
			keyName = <string>location.path[location.path.length - 1];
		}
		if (typeof(keyName) != "string")
			keyName = "";

		if (["path", "targetPath", "sourcePaths", "stringImportPaths", "importPaths", "copyFiles", "sourceFiles", "excludedSourceFiles", "mainSourceFile"].indexOf(keyName) != -1)
			return this.collectPathValueSuggestions(fileName, location, result, keyName);
		else if (!inArray && location.path[location.path.length - 2] == "dependencies")
			return this.collectDependencyValueSuggestions(keyName, fileName, location, result);
		else if (!inArray && location.path[location.path.length - 3] == "dependencies" && keyName == "version")
			return this.collectDependencyValueSuggestions(location.path[location.path.length - 2], fileName, location, result);
		else
			return Promise.resolve(null);
	}

	protected collectPathValueSuggestions(fileName: string, location: Location, result: ISuggestionsCollector, key: string): Thenable<any> {
		let folderOnly = ["path", "targetPath", "sourcePaths", "stringImportPaths", "importPaths"].indexOf(key) != -1;
		let fileRegex = ["copyFiles"].indexOf(key) != -1 ? null : /\.di?$/i;
		let currentValue = location.previousNode?.value || "";
		return new Promise((resolve, reject) => {
			if (currentValue != "") {
				let end = currentValue.lastIndexOf('/');
				if (end != -1)
					currentValue = currentValue.substr(0, end);
			}
			let dir = path.join(path.dirname(fileName), currentValue);
			fs.readdir(dir, { withFileTypes: true }, (err, files) => {
				if (err)
					return reject(err);

				files.forEach(file => {
					if (file.name[0] == '.')
						return;
					if (folderOnly && !file.isDirectory())
						return;
					if (!file.isDirectory() && fileRegex && !fileRegex.exec(file.name))
						return;

					let kind: vscode.CompletionItemKind = vscode.CompletionItemKind.Text;
					if (file.isSymbolicLink())
						kind = vscode.CompletionItemKind.Reference;
					else if (file.isDirectory())
						kind = vscode.CompletionItemKind.Folder;
					else if (file.isFile())
						kind = vscode.CompletionItemKind.File;

					let value = path.join(currentValue, file.name).replace(/\\/g, '/');
					if (file.isDirectory() && !folderOnly)
						value += "/";
					value = JSON.stringify(value);

					let item = new vscode.CompletionItem(value, kind);
					if (file.isDirectory())
						item.insertText = new vscode.SnippetString(value.slice(0, -1) + "${0}\"");
					result.add(item);
				});
				resolve(null);
			})
		});
	}

	protected collectDependencyValueSuggestions(currentKey: string | number, fileName: string, location: Location, result: ISuggestionsCollector): Thenable<any> {
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
						item.insertText = new vscode.SnippetString(JSON.stringify("${0}" + versions[i].version));
						item.filterText = JSON.stringify(versions[i].version);
						item.sortText = "0";
						items.push(item);
					}
					items.sort((a, b) => cmpSemver(
						typeof b.label == "string" ? b.label : b.label.label,
						typeof a.label == "string" ? a.label : a.label.label
					));
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
			let pack = item.label;
			if (typeof pack != "string")
				pack = pack.label;
			return getLatestPackageInfo(pack).then(info => {
				if (info.description) {
					let doc = new vscode.MarkdownString();
					doc.isTrusted = false;
					doc.appendMarkdown(info.description);
					if (info.license || info.copyright) {
						doc.appendText("\n");
						if (info.license)
							doc.appendText("\nLicense: " + info.license);
						if (info.copyright) {
							if (/copyright/i.exec(info.copyright))
								doc.appendText("\n" + info.copyright);
							else
								doc.appendText("\nCopyright: " + info.copyright);
						}
					}
					item.documentation = doc;
				}
				if (info.version) {
					item.detail = info.version;
					item.insertText = new vscode.SnippetString((<vscode.SnippetString>item.insertText).value.replace(/\{\{\}\}/, "{{" + info.version + "}}"));
				}
				if (typeof item.label == "string") {
					item.label = {
						label: item.label,
						detail: " " + info.version
					};
					if (info.description)
						item.label.description = info.description;
				}
				return item;
			}, err => {
				return <any>undefined;
			});
		}
		return Promise.resolve(<any>undefined);
	}
}