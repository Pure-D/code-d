import * as vscode from "vscode";
import * as path from "path";
import { JSDOM } from "jsdom";
import { reqText } from "./util";
import { served } from "./extension";
import { DubDependencyInfo } from "./dub-view";
var DOMParser = require("xmldom").DOMParser;

export type DocItem = vscode.QuickPickItem & { href: string, score: number, dependency?: DubDependencyInfo };

class WorkState {
	working: number = 0;
	items: DocItem[] = [];
	depItems: { [index: string]: DocItem[] } = {};
	visible: boolean = false;
	done: boolean = false;

	private resolve?: Function;

	constructor(public quickPick: vscode.QuickPick<any>, public query: string | undefined, public fastOpen: boolean) {
		if (fastOpen)
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				cancellable: true
			}, (progress, token) => {
				progress.report({ message: "Looking up documentation" });
				return new Promise((resolve, reject) => {
					token.onCancellationRequested((e) => {
						this.done = true;
						reject();
					});
					this.resolve = resolve;
				});
			}).then((result) => {
				// done
			});
	}

	startWork() {
		if (this.done)
			return;

		this.working++;
		this.quickPick.busy = this.working > 0;
	}

	finishWork() {
		if (this.done)
			return;

		this.working--;
		this.quickPick.busy = this.working > 0;
	}

	refreshItems() {
		if (this.done)
			return;

		var ret: DocItem[] = this.items.slice();
		for (var key in this.depItems)
			if (this.depItems.hasOwnProperty(key))
				ret.push.apply(ret, this.depItems[key]);
		ret.sort((a, b) => b.score - a.score);
		this.quickPick.items = ret;

		if (!this.visible && this.working <= 0) {
			if (!this.finishQuick()) {
				this.quickPick.show();
				if (this.resolve)
					this.resolve();
			}

			this.visible = true;
		}
	}

	show() {
		this.quickPick.items = this.items;
		if (this.fastOpen) {
			this.finishQuick();
		}
		else {
			this.quickPick.show();
			this.visible = true;
		}

		this.quickPick.onDidHide((e) => {
			if (this.resolve)
				this.resolve();
			this.done = true;
		});
	}

	finishQuick(): boolean {
		if (!this.items || !this.items.length)
			return false;

		let singleItem: DocItem | undefined;

		if (this.items.length == 1) {
			singleItem = this.items[0];
		} else if (this.query) {
			let perfect = [];
			let bestScore = 60;
			for (let i = 0; i < this.items.length; i++) {
				const item = this.items[i];
				if (item.label === this.query || item.label.endsWith("/" + this.query)) {
					perfect.push(item);
					bestScore = 100;
				} else if (item.label.endsWith(this.query) && item.score > bestScore) {
					singleItem = item;
					bestScore = item.score;
				}
			}

			if (perfect.length == 1) {
				singleItem = perfect[0];
			} else if (perfect.length > 1) {
				singleItem = undefined;
				this.items = perfect;
			}
		}

		if (singleItem) {
			showDocItemUI(singleItem);
			this.quickPick.dispose();
			this.done = true;
		} else {
			this.quickPick.show();
		}

		this.visible = true;

		if (this.resolve)
			this.resolve();

		return true;
	}
}

export function showDpldocsSearch(query?: string, fastOpen: boolean = false) {
	var quickpick = vscode.window.createQuickPick<DocItem>();
	const state = new WorkState(quickpick, query, fastOpen);

	loadDependencyPackageDocumentations(state);

	var timeout: NodeJS.Timer | undefined;
	function updateSearch(query: string, delay: number = 500) {
		timeout = updateRootSearchQuery(timeout, query, state, delay);
	}
	quickpick.onDidChangeValue((value) => updateSearch(value));

	quickpick.placeholder = "Enter search term for symbol...";
	quickpick.onDidAccept(() => {
		var selection = quickpick.selectedItems[0];
		if (selection)
			showDocItemUI(selection);
	});
	state.show();

	if (query) {
		quickpick.value = query;
		updateSearch(query, 0);
	}
}

export async function fillDplDocs(panel: vscode.WebviewPanel, label: string, href: string) {
	panel.webview.html = "<h1>" + label + "</h1>";

	if (href.startsWith("//"))
		href = "https:" + href;

	if (!href.startsWith("http:") && !href.startsWith("https:"))
	{
		panel.webview.html = `<h1>${label}</h1><p>Non-docs URL: <a href="${href}">${href}</a></p>`;

		return;
	}

	let body = (await reqText().get(href)).data;

	let content = new JSDOM(body);
	let page = content.window.document.getElementById("page-body");
	if (page) {
		let nonce = Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2);
		let font = vscode.workspace.getConfiguration("editor").get("fontFamily") || "monospace";
		panel.webview.html = `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}' ${panel.webview.cspSource}; script-src 'nonce-${nonce}' ${panel.webview.cspSource}; img-src ${panel.webview.cspSource} https:;">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>${label}</title>
				<script nonce="${nonce}">
				(function() {
					var vscode = acquireVsCodeApi();
					window.onload = function() {
						var links = document.getElementsByTagName('a');
						for (var i = 0; i < links.length; i++) {
							// change links starting with "//" to start with "coded-internal://" so they don't get the internal vscode-webview:// protocol
							if (links[i].getAttribute("href").startsWith("//"))
								links[i].setAttribute("href", "https:" + links[i].getAttribute("href"));

							// make relative links have protocol "coded-internal:" so they don't trigger vscode trusted domains question / don't actually open any browser
							var m;
							if (m = /^(https?:)\\/\\/[^/?#]+\\.dpldocs\\.info(\\/|$)/.exec(links[i].getAttribute("href")))
								links[i].setAttribute("href", "coded-internal:" + links[i].getAttribute("href").substr(m[1].length));

							links[i].onclick = function(event) {
								var href = this.href || this.getAttribute("href");

								// make relative links relative (happens with source code links)
								if (href.startsWith(window.location.protocol + "//" + window.location.host + "/"))
									href = href.substr((window.location.protocol + "//" + window.location.host).length);

								// external links, don't handle them
								if (!/^coded-internal:\\/\\/[^/?#]+\\.dpldocs\\.info(\\/|$)|^\\/[^/]/.test(href) || href.startsWith("#"))
								{
									console.log("link", href, "is external, letting vscode or electron handle it");
									return;
								}

								// open code in editor
								if (href.indexOf("source/") != -1 && /\\.d\\.html(#L\\d+)?$/.test(href))
								{
									href = href.substr(href.indexOf("source/") + "source/".length);
									var lno = 0;
									if (href.indexOf("L") != -1)
										lno = parseInt(href.substr(href.lastIndexOf("L") + 1));
									var module_ = href.substr(0, href.lastIndexOf(".d.html"));
									vscode.postMessage({ type: "open-module", module_: module_, line: lno });
									event.preventDefault();
									return false;
								}
								// internal links, rewrite to RPC calls
								else if (/\\w+(\\.\\w+)*\\.html$/.test(href))
								{
									console.log("handle-link", href);
									vscode.postMessage({ type: "handle-link", href: href, title: this.title });
									event.preventDefault();
									return false;
								}
								else
								{
									console.log("don't know what to do with href ", href);
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

			if (state.done)
				return;

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
	strippedDependencyVersion: string): Promise<DocItem[]> {
	let url = `https://${encodeURIComponent(strippedDependencyName)}.dpldocs.info/${encodeURIComponent(strippedDependencyVersion)}/search-results.html`;

	let retried = false;
	let doTry = function (url: string): Promise<DocItem[]> {
		return reqText().get(url, { headers: { "Accept-Encoding": "gzip" } }).then((body) => {
			if (body.status == 200) {
				if ((body.headers["content-length"] || body.headers["Content-Length"])) {
					return parseDependencySearchResult(body.data, dep, strippedDependencyName, strippedDependencyVersion);
				} else if (!retried) {
					retried = true;
					return doTry(url);
				} else {
					throw body;
				}
			} else throw body;
		});
	}
	return doTry(url);
}


function updateRootSearchQuery(timeout: NodeJS.Timer | undefined, value: string, state: WorkState, delay: number = 500): NodeJS.Timer {
	if (timeout !== undefined)
		clearTimeout(timeout);
	return setTimeout(async () => {
		if (state.done)
			return;

		state.startWork();
		try {
			let body = (await reqText().get("https://dpldocs.info/locate?q=" + encodeURIComponent(value))).data;
			state.finishWork();
			state.items = [];
			let dom = new JSDOM(body);
			let results = <Element[]><any>dom.window.document.querySelectorAll("dt.search-result");
			results.forEach(dt => {
				let item = parseDocItem(dt);
				if (item)
					state.items.push(item);
			});
		}
		catch (e) {
			console.error("Failed searching dpldocs: ", e);
			state.finishWork();
			state.items = [];
		}
		state.refreshItems();
	}, delay);
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
		label: (a.innerText || a.textContent || "").replace(/[\s\u2000-\u200F]+/g, ""),
		href: href,
		score: score
	};

	if (score > 0)
		obj.description = "Search Score: " + score;

	if (dt.nextElementSibling)
		obj.detail = ((<any>dt.nextElementSibling).innerText || dt.nextElementSibling.textContent || "").replace(/[\u2000-\u200F]+/g, "").replace(/([^\S\n]*\n[^\S\n]*\n[^\S\n]*)+/g, "\n\n");

	return obj;
}

function getCleanSimpleTextContent(elem: Element | null): string | null {
	return elem ? ((<any>elem).innerText || elem.textContent || "").replace(/<\/?.*?>/g, "").replace(/[\u2000-\u200F]+/g, "").trim() : elem;
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
				if (/^coded-internal:\/\/[^/?#]+\.dpldocs\.info(\/|$)/.test(msg.href)) {
					// absolute dpldocs link, possibly with different subdomain
					baseUri = vscode.Uri.parse(msg.href).with({"scheme":"https"}).toString();
					fillDplDocs(panel, msg.title, baseUri);
				} else {
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
				}
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
