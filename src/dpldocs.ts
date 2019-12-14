import * as vscode from "vscode";
import * as path from "path";
import { JSDOM } from "jsdom";
import { req } from "./util";
import { served } from "./extension";
import { DubDependencyInfo } from "./dub-view";
var DOMParser = require("xmldom").DOMParser;

export type DocItem = vscode.QuickPickItem & { href: string, score: number, dependency?: DubDependencyInfo };

class WorkState {
	working: number = 0;
	items: DocItem[] = [];
	depItems: { [index: string]: DocItem[] } = {};

	constructor(public quickPick: vscode.QuickPick<any>) {
	}

	startWork() {
		this.working++;
		this.quickPick.busy = this.working > 0;
	}

	finishWork() {
		this.working--;
		this.quickPick.busy = this.working > 0;
	}

	refreshItems() {
		var ret: DocItem[] = this.items.slice();
		for (var key in this.depItems)
			if (this.depItems.hasOwnProperty(key))
				ret.push.apply(ret, this.depItems[key]);
		this.quickPick.items = ret;
	}
}

export function showDpldocsSearch(query?: string) {
	var quickpick = vscode.window.createQuickPick<DocItem>();
	const state = new WorkState(quickpick);

	loadDependencyPackageDocumentations(state);

	var timeout: NodeJS.Timer | undefined;
	function updateSearch(query: string) {
		timeout = updateRootSearchQuery(timeout, query, state);
	}
	quickpick.onDidChangeValue((value) => updateSearch);

	quickpick.placeholder = "Enter search term for symbol...";
	quickpick.onDidAccept(() => {
		var selection = quickpick.selectedItems[0];
		if (selection)
			showDocItemUI(selection);
	});
	quickpick.items = state.items;
	quickpick.show();

	if (query) {
		quickpick.value = query;
		updateSearch(query);
	}
}

export function fillDplDocs(panel: vscode.WebviewPanel, label: string, href: string) {
	panel.webview.html = "<h1>" + label + "</h1>";

	if (!href.startsWith("http:") && !href.startsWith("https:"))
		return;

	req()(href, function (error: any, response: any, body: string) {
		var content = new JSDOM(body);
		var page = content.window.document.getElementById("page-body");
		if (page) {
			var nonce = Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
			var font = vscode.workspace.getConfiguration("editor").get("fontFamily") || "monospace";
			panel.webview.html = `<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>${label}</title>
					<script nonce="${nonce}">
					(function() {
						var vscode = acquireVsCodeApi();
						window.onload = function() {
							var links = document.getElementsByTagName('a');
							for (var i = 0; i < links.length; i++) {
								links[i].onclick = function() {
									var href = this.href || this.getAttribute("href");
									if (href.startsWith("http:") || href.startsWith("https:") || href.startsWith("#"))
										return;
									if (/^\\w+(\\.\\w+)*\\.html$/.test(href))
									{
										vscode.postMessage({ type: "handle-link", href: href, title: this.title });
										return false;
									}
									else if (href.startsWith("source/") && /\\.d\\.html(#L\\d+)?$/.test(href))
									{
										href = href.substr("source/".length);
										var lno = 0;
										if (href.indexOf("L") != -1)
											lno = parseInt(href.substr(href.lastIndexOf("L") + 1));
										var module_ = href.substr(0, href.lastIndexOf(".d.html"));
										vscode.postMessage({ type: "open-module", module_: module_, line: lno });
										return false;
									}
								};
							}
						};
					})();
					</script>
					<style nonce="${nonce}">
						body {
							display: flex;
						}
						pre, code {
							font-family: ${font};
						}
						a {
							text-decoration: none;
						}
						a:hover {
							text-decoration: underline;
						}
						#page-nav {
							box-sizing: border-box;
							width: 16em;
							flex-grow: 0;
							flex-shrink: 0;
							order: 1;
							padding: 1em;
							border-right: 1px solid var(--vscode-editorGroup-border);
						}
						#page-nav a {
							display: block;
						}
						#page-nav a.parent {
							font-weight: bold;
						}
						#page-nav .type-separator {
							text-transform: capitalize;
							display: block;
							margin-top: 1em;
							border-bottom: 1px solid var(--vscode-editorGroup-border);
						}
						#page-nav ul {
							padding: 0;
							list-style: none;
						}
						#page-content {
							box-sizing: border-box;
							flex-grow: 1;
							flex-shrink: 1;
							order: 2;
							padding: 1em;
							padding-left: 2em;
						}
						a.header-anchor {
							text-decoration: none;
							color: var(--vscode-sideBarSectionHeader-foreground);
						}
						.breadcrumbs:empty {
							display: none;
						}
						.breadcrumbs {
							margin: 1em;
							background-color: var(--vscode-editorWidget-background);
							border: 1px solid var(--vscode-editorWidget-border);
							box-shadow: 0 2px 8px var(--vscode-widget-shadow);
						}
						.breadcrumbs a:before {
							content: ' \\00bb\\a0';
						}
						.breadcrumbs a {
							display: inline-block;
							padding: 0.5em;
							color: var(--vscode-breadcrumb-foreground);
							text-decoration: none;
						}
						.breadcrumbs a:hover {
							color: var(--vscode-breadcrumb-focusForeground);
						}
						.function-prototype {
							padding: 2em;
							margin: 1em;
						}
						.inline-code, .d_code, .function-prototype {
							background-color: var(--vscode-editor-background);
							color: var(--vscode-editor-foreground);
							font-family: ${font};
						}
						.d_code {
							padding: 1em;
						}
						.d_code, .function-prototype {
							border: 1px solid var(--vscode-editorGroup-border);
						}
						.toplevel.parameters-list {
							display: table;
						}
						.toplevel.parameters-list > .parameter-item {
							display: table-row;
						}
						.toplevel.parameters-list > .parameter-item > *:first-child {
							padding-left: 2em !important;
						}
						.toplevel.parameters-list > .parameter-item + .comma {
							display: none;
						}
						.toplevel.parameters-list > .parameter-item > *:last-child::after {
							content: ",";
						}
						.toplevel.parameters-list > .parameter-item:last-child > *:last-child::after {
							content: "";
						}
						.toplevel.parameters-list > .parameter-item .parameter-type-holder,
						.toplevel.parameters-list > .parameter-item .parameter-name,
						.toplevel.parameters-list > .parameter-item .parameter-default-value {
							display: table-cell;
							padding: 0px 0.25em;
						}
						.toplevel.parameters-list > .parameter-item:hover {
							background-color: var(--vscode-editor-lineHighlightBackground);
							border: 2px solid var(--vscode-editor-lineHighlightBorder);
						}
						.parameter-attribute {
							padding-left: 1em;
						}
						.aggregate-declaration {
							margin: 1em;
						}
						.aggregate-member {
							padding-left: 2em;
						}
						.template-constraint-expression,
						.parameter-item {
							padding-left: 2em;
						}
						.with-line-wrappers .br {
							-webkit-user-select: none;
							-moz-user-select: none;
							-ms-user-select: none;
							user-select: none;
							width: 3em;
							width: 4ch;
							display: inline-block;
							color: var(--vscode-editorLineNumber-foreground);
							padding: 0px;
							margin: 0px;
							margin-right: 3px;
							padding-right: 3px;
							font-style: normal;
							font-weight: normal;
							background-color: transparent;
							text-align: right;
							white-space: pre;
						}
						.aggregate-members:empty::after {
							content: "This aggregate has no documented members available.";
						}
					</style>
				</head>
				<body>
					${page.innerHTML}
				</body>
				</html>`;
		}
	});
}

async function loadDependencyPackageDocumentations(state: WorkState) {
	if (!served)
		return;

	let deps = await served.getChildren();
	var checked: string[] = [];
	deps.forEach(dep => {
		if (dep.info) {
			var strippedVersion = dep.info.version;
			if (strippedVersion.startsWith("~"))
				strippedVersion = strippedVersion.substr(1);

			var strippedName = dep.info.name;
			var colon = strippedName.indexOf(":");
			if (colon != -1)
				strippedName = strippedName.substr(0, colon);
			if (checked.indexOf(strippedName) != -1)
				return;
			checked.push(strippedName);

			state.startWork();
			loadDependencySymbolsOnline(dep.info, strippedName, strippedVersion).then(docs => {
				state.finishWork();
				state.depItems[dep.info!.name] = docs;
				state.refreshItems();
			});
		}
	});
}

export function loadDependencySymbolsOnline(
	dep: DubDependencyInfo | undefined,
	strippedDependencyName: string,
	strippedDependencyVersion: string): Thenable<DocItem[]> {
	let url = `https://${encodeURIComponent(strippedDependencyName)}.dpldocs.info/${encodeURIComponent(strippedDependencyVersion)}/search-results.html`;

	let retried = false;
	let doTry = function (url: string) {
		return new Promise<DocItem[]>((resolve, reject) => {
			req()({ method: "GET", uri: url, gzip: true }, function (error: any, response: any, body: string) {
				if (!error && response.statusCode == 200) {
					if (response.headers["content-length"] || response.headers["Content-Length"]) {
						resolve(parseDependencySearchResult(body, dep, strippedDependencyName, strippedDependencyVersion));
					}
					else if (!retried) {
						retried = true;
						return doTry(url);
					}
					else reject();
				} else reject();
			});
		});
	}
	return doTry(url);
}


function updateRootSearchQuery(timeout: NodeJS.Timer | undefined, value: string, state: WorkState): NodeJS.Timer {
	if (timeout !== undefined)
		clearTimeout(timeout);
	return setTimeout(() => {
		state.startWork();
		req()("https://dpldocs.info/locate?q=" + encodeURIComponent(value), function (error: any, response: any, body: any) {
			state.finishWork();
			state.items = [];
			if (!error && response.statusCode == 200) {
				let dom = new JSDOM(body);
				let results = <Element[]><any>dom.window.document.querySelectorAll("dt.search-result");
				results.forEach(dt => {
					let item = parseDocItem(dt);
					if (item)
						state.items.push(item);
				});
			}
			state.refreshItems();
		});
	}, 500);
}

function parseDependencySearchResult(
	body: string,
	dep: DubDependencyInfo | undefined,
	strippedDependencyName: string,
	strippedDependencyVersion: string): DocItem[] {
	let start = body.indexOf("<adrdox>");
	if (start == -1)
		return [];
	let end = body.indexOf("</adrdox>", start);
	if (end == -1)
		return [];

	let content = body.substring(start, end + "</adrdox>".length);
	let xml: Document = new DOMParser().parseFromString(content, "text/xml");
	let decls = xml.getElementsByTagName("decl");
	let localItems: DocItem[] = [];
	for (let j = 0; j < decls.length; j++) {
		let docEntry = parseDocEntry(decls[j]);
		if (docEntry.name && docEntry.link) {
			let href = docEntry.link;
			let m;
			if (m = /\.(\d+)\.html/.exec(href))
				if (parseInt(m[1]) > 1)
					continue;
			let obj: DocItem = {
				dependency: dep,
				label: strippedDependencyName + "/" + docEntry.name,
				href: `https://${encodeURIComponent(strippedDependencyName)}.dpldocs.info/${encodeURIComponent(strippedDependencyVersion)}/${encodeURIComponent(href)}`,
				score: 0
			};
			if (docEntry.desc)
				obj.detail = docEntry.desc;
			localItems.push(obj);
		}
	}
	return localItems;
}

interface DocEntry {
	name: string | null;
	link: string | null;
	desc: string | null;
}

function parseDocEntry(declElem: Element): DocEntry {
	console.log(declElem.childNodes.length);
	let name: Element | null = null;
	let link: Element | null = null;
	let desc: Element | null = null;
	for (let i = 0; i < declElem.childNodes.length; i++) {
		let child = <any>declElem.childNodes[i];
		if (child.tagName) {
			if (child.tagName.toLowerCase() == "name")
				name = child;
			else if (child.tagName.toLowerCase() == "link")
				link = child;
			else if (child.tagName.toLowerCase() == "desc")
				desc = child;
		}
	}
	return {
		name: getCleanSimpleTextContent(name),
		link: getCleanSimpleTextContent(link),
		desc: getCleanSimpleTextContent(desc)
	};
}

function parseDocItem(dt: Element): DocItem | undefined {
	let a = dt.querySelector("a");
	if (!a)
		return;
	let href = a.getAttribute("href");
	if (!href)
		return;

	let score = parseInt(dt.getAttribute("data-score") || "0");
	let obj: DocItem = {
		label: (a.textContent || "").replace(/\s+/g, ""),
		href: href,
		score: score
	};

	if (score > 0)
		obj.description = "Search Score: " + score;

	if (dt.nextElementSibling)
		obj.detail = (dt.nextElementSibling.textContent || "").replace(/([^\S\n]*\n[^\S\n]*\n[^\S\n]*)+/g, "\n\n");

	return obj;
}

function getCleanSimpleTextContent(elem: Element | null): string | null {
	return elem ? (elem.textContent || "").replace(/<\/?.*?>/g, "").trim() : elem;
}

function showDocItemUI(docItem: DocItem) {
	var panel = vscode.window.createWebviewPanel("dpldocs", docItem.label, {
		viewColumn: vscode.ViewColumn.Active
	}, {
		enableCommandUris: false,
		enableFindWidget: true,
		enableScripts: true,
		localResourceRoots: []
	});
	var baseUri = docItem.href;
	panel.webview.onDidReceiveMessage((msg) => {
		switch (msg.type) {
			case "handle-link":
				let href = path.posix.normalize(msg.href);
				let uri = vscode.Uri.parse(baseUri);
				if (href.startsWith("/")) {
					baseUri = uri.with({
						path: href
					}).toString();
				} else {
					let file = uri.path;
					let slash = file.lastIndexOf("/");
					file = file.substring(0, slash + 1) + href;
					baseUri = uri.with({
						path: file
					}).toString();
				}
				fillDplDocs(panel, msg.title, baseUri);
				break;
			case "open-module":
				let module_ = <string>msg.module_;
				let line = msg.line;
				focusModule(module_, line);
				break;
		}
	});
	fillDplDocs(panel, docItem.label, docItem.href);
}

function focusModule(module_: string, line: number) {
	served.findFilesByModule(module_).then(files => {
		if (!files.length) {
			vscode.window.showErrorMessage("Could not find module " + module_);
		}
		else {
			vscode.workspace.openTextDocument(files[0]).then(doc => {
				vscode.window.showTextDocument(doc).then(editor => {
					if (line > 0) {
						var pos = new vscode.Position(line - 1, 0);
						editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
						editor.selection.active = pos;
					}
				});
			});
		}
	});
}
