import * as vscode from "vscode";
import * as path from "path";
import { JSDOM } from "jsdom";
import { req } from "./util";
import { served, config } from "./extension";
import { DubDependencyInfo } from "./dub-view";
var DOMParser = require("xmldom").DOMParser;

export type DocItem = vscode.QuickPickItem & { href: string, score: number, dependency?: DubDependencyInfo };

export function showDpldocsSearch() {

	var quickpick = vscode.window.createQuickPick<DocItem>();
	var items: DocItem[] = [];
	var depItems: { [index: string]: DocItem[] } = {};
	var working = 0;

	function refreshItems() {
		var ret: DocItem[] = items.slice();
		for (var key in depItems)
			if (depItems.hasOwnProperty(key))
				ret.push.apply(ret, depItems[key]);
		quickpick.items = ret;
	}

	if (served)
		served.getChildren().then(deps => {
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

					var url = `https://${encodeURIComponent(strippedName)}.dpldocs.info/${encodeURIComponent(strippedVersion)}/search-results.html`;
					var retried = false;
					var doTry = function (dep: DubDependencyInfo, url: string) {
						working++;
						quickpick.busy = working > 0;
						req()({ method: "GET", uri: url, gzip: true }, function (error: any, response: any, body: string) {
							working--;
							quickpick.busy = working > 0;
							if (!error && response.statusCode == 200) {
								if (response.headers["content-length"] || response.headers["Content-Length"]) {
									var start = body.indexOf("<adrdox>");
									if (start != -1) {
										var end = body.indexOf("</adrdox>", start);
										if (end != -1) {
											var content = body.substring(start, end + "</adrdox>".length);
											var xml: Document = new DOMParser().parseFromString(content, "text/xml");
											var decls = xml.getElementsByTagName("decl");
											var localItems: DocItem[] = [];
											for (var j = 0; j < decls.length; j++) {
												var declElem = decls[j];
												console.log(declElem.childNodes.length);
												var name: Element | null = null;
												var link: Element | null = null;
												var desc: Element | null = null;
												for (var i = 0; i < declElem.childNodes.length; i++) {
													var child = <any>declElem.childNodes[i];
													if (child.tagName) {
														if (child.tagName.toLowerCase() == "name")
															name = child;
														else if (child.tagName.toLowerCase() == "link")
															link = child;
														else if (child.tagName.toLowerCase() == "desc")
															desc = child;
													}
												}
												if (name && link) {
													var href = (link.textContent || "").trim();
													var m;
													if (m = /\.(\d+)\.html/.exec(href))
														if (parseInt(m[1]) > 1)
															continue;
													var obj: DocItem = {
														dependency: dep,
														label: strippedName + "/" + (name.textContent || "").replace(/<\/?.*?>/g, ""),
														href: `https://${encodeURIComponent(strippedName)}.dpldocs.info/${encodeURIComponent(strippedVersion)}/${encodeURIComponent(href)}`,
														score: 0
													};
													if (desc && desc.textContent)
														obj.detail = desc.textContent.replace(/<\/?.*?>/g, "");
													localItems.push(obj);
												}
											}
											depItems[dep.name] = localItems;
											refreshItems();
										}
									}
								}
								else if (!retried) {
									retried = true;
									doTry(dep, url);
								}
							}
						});
					}
					doTry(dep.info, url);
				}
			});
		});

	var timeout: NodeJS.Timer;
	quickpick.onDidChangeValue((value) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => {
			working++;
			quickpick.busy = working > 0;
			req()("https://dpldocs.info/locate?q=" + encodeURIComponent(value), function (error: any, response: any, body: any) {
				working--;
				quickpick.busy = working > 0;
				items = [];
				if (!error && response.statusCode == 200) {
					var dom = new JSDOM(body);
					var results = <Element[]><any>dom.window.document.querySelectorAll("dt.search-result");
					results.forEach(dt => {
						var a = dt.querySelector("a");
						if (a) {
							var href = a.getAttribute("href");
							if (href) {
								var score = parseInt(dt.getAttribute("data-score") || "0");
								var obj: DocItem = {
									label: (a.textContent || "").replace(/\s+/g, ""),
									href: href,
									score: score
								};

								if (score > 0)
									obj.description = "Search Score: " + score;

								if (dt.nextElementSibling) {
									obj.detail = (dt.nextElementSibling.textContent || "").replace(/([^\S\n]*\n[^\S\n]*\n[^\S\n]*)+/g, "\n\n");
								}

								items.push(obj);
							}
						}
					});
				}
				refreshItems();
			});
		}, 500);
	});

	quickpick.placeholder = "Enter search term for symbol...";
	quickpick.onDidAccept(() => {
		var selection = quickpick.selectedItems[0];
		if (selection) {
			var panel = vscode.window.createWebviewPanel("dpldocs", selection.label, {
				viewColumn: vscode.ViewColumn.Active
			}, {
					enableCommandUris: false,
					enableFindWidget: true,
					enableScripts: true,
					localResourceRoots: []
				});
			var baseUri = selection.href;
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

						break;
				}
			});
			fillDplDocs(panel, selection.label, selection.href);
		}
	});
	quickpick.items = items;
	quickpick.show();
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