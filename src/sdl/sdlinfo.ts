import * as vscode from "vscode"
import { parseSDL, Tag, Value } from "./sdlparse"

export type SDLLocationType = "block" | "value" | "attribute";
export interface SDLCompletionInfo {
	uri: vscode.Uri,
	currentSDLObject: Tag;
	type: SDLLocationType;
	namespace: string[];
	name: string[];
	value: string;
	valueRange: vscode.Range | undefined;
	partial: string;
	valueIndex: number;
}

export function getLocationInfo(document: vscode.TextDocument, position: vscode.Position): SDLCompletionInfo {
	var root = parseSDL(document.getText());
	var pos = document.offsetAt(position);
	var current: Tag[] = [root];
	var currentNamespace = [""];
	var currentName = [""];
	(function findContext() {
		var prevCur = current.length;
		Object.keys(current[current.length - 1].tags).forEach(key => {
			if (current[current.length - 1].tags[key])
				current[current.length - 1].tags[key].forEach(tag => {
					if (tag.range) {
						if (pos >= tag.range[0] && pos < tag.range[1]) {
							current.push(tag);
							currentNamespace.push("");
							currentName.push(key);
							findContext();
							return;
						}
					}
				});
		});
		Object.keys(current[current.length - 1].namespaces).forEach(key => {
			if (current[current.length - 1].namespaces[key])
				Object.keys(current[current.length - 1].namespaces[key].tags).forEach(tagkey => {
					if (current[current.length - 1].namespaces[key].tags[tagkey])
						current[current.length - 1].namespaces[key].tags[tagkey].forEach(tag => {
							if (tag.range) {
								if (pos >= tag.range[0] && pos < tag.range[1]) {
									current.push(tag);
									currentNamespace.push(key);
									currentName.push(tagkey);
									findContext();
									return;
								}
							}
						});
				});
		});
		if (prevCur != current.length) {
			findContext();
		}
	})();

	var locationType: SDLLocationType = "block";
	var namespaceStack = currentNamespace;
	var nameStack = currentName;
	var valueContent: Value | undefined = undefined;
	var valueIndex = -1;
	var partialContent = "";

	function findInValues(values: Value[], attribName?: string) {
		values.forEach((value, i) => {
			if (pos >= value.ownerRange[0] && pos < value.ownerRange[1]) {
				if (value.type == "none") {
					if (value.range[0] == value.range[1])
						locationType = "attribute";
					else
						locationType = "value";
					namespaceStack.push(value.namespace);
					nameStack.push(attribName || "");
					valueContent = undefined;
					partialContent = "";
					valueIndex = i;
				}
				else {
					locationType = "attribute";
					namespaceStack.push(value.namespace);
					nameStack.push(attribName || "");
					valueContent = undefined;
					partialContent = "";
					valueIndex = i;
				}
			}
			else if (pos >= value.range[0] && pos < value.range[1]) {
				locationType = "value";
				namespaceStack.push(value.namespace);
				nameStack.push(attribName || "");
				valueContent = value;
				partialContent = valueContent.value.substr(0, value.range[0] - pos);
				valueIndex = i;
			}
		});
	}
	var curr = current[current.length - 1];
	findInValues(curr.values);
	Object.keys(curr.attributes).forEach(key => {
		findInValues(curr.attributes[key], key);
	});
	if (locationType == "block" && curr.attributesRange) {
		if (pos >= curr.attributesRange[0] && pos < curr.attributesRange[1]) {
			locationType = "attribute";
			namespaceStack.push("");
			nameStack.push("");
			valueContent = undefined;
			partialContent = "";
		}
	}

	let range: vscode.Range | undefined;
	if (valueContent)
	{
		let intRange = (<Value>valueContent).range;
		range = new vscode.Range(
			document.positionAt(intRange[0]),
			document.positionAt(intRange[1]),
		);
	}

	return {
		uri: document.uri,
		currentSDLObject: curr,
		type: locationType,
		namespace: namespaceStack,
		name: nameStack,
		value: (<Value | undefined>valueContent)?.value ?? "",
		valueRange: range,
		valueIndex: valueIndex,
		partial: partialContent
	};
}