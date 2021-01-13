export interface Value {
	value: any;
	type: string;
	namespace: string;
	range: [number, number];
	ownerRange: [number, number];
	parent: Tag;
}

export interface TagParseError {
	range: [number, number];
	message: string;
	type: "error" | "warning";
}

export interface Tag {
	tags: { [index: string]: Tag[]; };
	namespaces: { [index: string]: Tag; };
	values: Value[];
	attributes: { [index: string]: Value[]; };
	parent: Tag | null;
	isNamespace?: boolean;
	range?: [number, number];
	attributesRange?: [number, number];
	errors?: TagParseError[];
}

var unicodeChar = /^'(.*?)'/;
var dateTime = /^(\d{4})\/(\d{2})\/(\d{2})\s(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(?:-([a-zA-Z0-9_]\/[a-zA-Z0-9_]|[A-Z]{3}|GMT[+-]\d{2}(?::\d{2})?))?/;
var timespan = /^([+-])?(?:(\d+)d)?(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/;
var date = /^(\d{4})\/(\d{2})\/(\d{2})/;
var longInteger = /^([+-]?\d+)[Ll]/;
var double = /^([+-]?\d+\.\d+)[Dd]?/;
var float = /^([+-]?\d+\.\d+)[Ff]/;
var decimal = /^([+-]?\d+\.\d+)(?:BD|bd)/;
var integer = /^([+-]?\d+)/;
var boolean = /^(true|false|on|off)/;
var binaryValue = /^\[([a-zA-Z0-9\+\/=\s]+)\]/;
var nullValue = /^(null)/;
var identifier = /^([A-Za-z_\.\$][A-Za-z0-9_\-\.\$]*)/;
var wysiwygString = /^`([\S\s]*?)`/;
var stringWhitespaceChar = /[^\S\n]/;
function parseStringLiteral(sdl: string) {
	if (sdl.length < 2)
		return null;
	if (sdl[0] == '`') {
		var match = wysiwygString.exec(sdl);
		if (match) {
			return { string: match[1], length: match[0].length }
		}
		else {
			return { string: sdl.substr(1), length: sdl.length };
		}
	}
	else if (sdl[0] == '"') {
		var str = "";
		var skipWhitespace = false;
		var escape = false;
		for (var i = 1; i < sdl.length; i++) {
			if (escape) {
				skipWhitespace = false;
				if (sdl[i] == '"')
					str += '"';
				else if (sdl[i] == '\\')
					str += '\\';
				else if (sdl[i] == 'n')
					str += '\n';
				else if (sdl[i] == 'r')
					str += '\r';
				else if (sdl[i] == 't')
					str += '\t';
				else if (sdl[i] == ' ')
					str += ' ';
				else if (sdl[i] == '\n') {
					skipWhitespace = true;
				}
				escape = false;
			}
			else {
				if (sdl[i] == '\\')
					escape = true;
				else if (sdl[i] == '"')
					return { string: str, length: i + 1 };
				else {
					if (skipWhitespace && stringWhitespaceChar.exec(sdl[i]))
						continue;
					else {
						skipWhitespace = false;
						str += sdl[i];
					}
				}
			}
		}
		return { string: str, length: sdl.length };
	}
	else return null;
}

var lineComment = /^(?:#|\/\/|--).*?(?=\n|$)/;
var blockComment = /^\/\*[\s\S]*?\*\//;
var whitespace = /^[^\S\n]+/;
var escapedNewline = /^\\\n/;
var endtoken = /^(\n+|;)/;
var blockStart = /^{/;
var blockEnd = /^}/;

export function tokenizeSDL(sdl: string) {
	sdl += "\n";
	var original = sdl;
	var tokens = [];
	var isAttribute = false;
	var attributeName;
	var attributeRange;
	var index = 0;
	while (sdl.length) {
		var startLen = sdl.length;
		index = original.length - sdl.length;
		if (sdl.substr(0, 64) != original.substr(index, 64))
			throw "Faulty index.\nRemaining: '" + sdl.substr(0, 64) + "'\nAccording to index: '" + original.substr(index, 64) + "'";
		var match;
		if (match = unicodeChar.exec(sdl)) {
			tokens.push({ type: "value", range: [index, index + match[0].length], valuetype: "char", value: match[1] });
			sdl = sdl.substr(match[0].length);
		} else if (match = dateTime.exec(sdl)) {
			tokens.push({ type: "value", range: [index, index + match[0].length], valuetype: "datetime", value: { year: parseInt(match[1]), month: parseInt(match[2]), day: parseInt(match[3]), hours: parseInt(match[4]), minutes: parseInt(match[5]), seconds: match[6] ? parseInt(match[6]) : undefined, milliseconds: match[7] ? parseInt(match[7]) : undefined, timezone: match[8] } });
			sdl = sdl.substr(match[0].length);
		} else if (match = timespan.exec(sdl)) {
			tokens.push({ type: "value", range: [index, index + match[0].length], valuetype: "timespan", value: { sign: match[1] || "+", days: match[2] ? parseInt(match[2]) : undefined, hours: parseInt(match[3]), minutes: parseInt(match[4]), seconds: parseInt(match[5]), milliseconds: match[6] ? parseInt(match[6]) : undefined } });
			sdl = sdl.substr(match[0].length);
		} else if (match = date.exec(sdl)) {
			tokens.push({ type: "value", range: [index, index + match[0].length], valuetype: "date", value: { year: parseInt(match[1]), month: parseInt(match[2]), day: parseInt(match[3]) } });
			sdl = sdl.substr(match[0].length);
		} else if (match = longInteger.exec(sdl)) {
			tokens.push({ type: "value", range: [index, index + match[0].length], valuetype: "long", value: parseInt(match[1]) });
			sdl = sdl.substr(match[0].length);
		} else if (match = double.exec(sdl)) {
			tokens.push({ type: "value", range: [index, index + match[0].length], valuetype: "double", value: parseFloat(match[1]) });
			sdl = sdl.substr(match[0].length);
		} else if (match = float.exec(sdl)) {
			tokens.push({ type: "value", range: [index, index + match[0].length], valuetype: "float", value: parseFloat(match[1]) });
			sdl = sdl.substr(match[0].length);
		} else if (match = decimal.exec(sdl)) {
			tokens.push({ type: "value", range: [index, index + match[0].length], valuetype: "decimal", value: parseFloat(match[1]) });
			sdl = sdl.substr(match[0].length);
		} else if (match = integer.exec(sdl)) {
			tokens.push({ type: "value", range: [index, index + match[0].length], valuetype: "int", value: parseInt(match[1]) });
			sdl = sdl.substr(match[0].length);
		} else if (match = boolean.exec(sdl)) {
			tokens.push({ type: "value", range: [index, index + match[0].length], valuetype: "boolean", value: match[1] == "true" || match[1] == "on" });
			sdl = sdl.substr(match[0].length);
		} else if (match = binaryValue.exec(sdl)) {
			tokens.push({ type: "value", range: [index, index + match[0].length], valuetype: "binary", value: Buffer.from(match[1].replace(/\s/g, ""), "base64") });
			sdl = sdl.substr(match[0].length);
		} else if (match = nullValue.exec(sdl)) {
			tokens.push({ type: "value", range: [index, index + match[0].length], valuetype: "null", value: null });
			sdl = sdl.substr(match[0].length);
		} else if (match = identifier.exec(sdl)) {
			if (sdl.length > 0) {
				if (sdl[match[0].length] == ':') {
					tokens.push({ type: "namespace", range: [index, index + match[0].length + 1], namespace: match[1] });
					sdl = sdl.substr(match[0].length + 1);
					continue;
				}
				else if (sdl[match[0].length] == '=') {
					attributeName = match[1];
					attributeRange = [index, index + match[0].length + 1];
					isAttribute = true;
					sdl = sdl.substr(match[0].length + 1);
					continue;
				}
				tokens.push({ type: "identifier", range: [index, index + match[0].length], name: match[1] });
				sdl = sdl.substr(match[0].length);
			} else {
				tokens.push({ type: "unknown-identifier", range: [index, index + match[0].length], name: match[1] });
				sdl = sdl.substr(match[0].length);
			}
		} else if (match = parseStringLiteral(sdl)) {
			tokens.push({ type: "value", range: [index, index + match.length], valuetype: "string", value: match.string });
			sdl = sdl.substr(match.length);
		} else if (match = whitespace.exec(sdl)) {
			sdl = sdl.substr(match[0].length);
		} else if (match = escapedNewline.exec(sdl)) {
			sdl = sdl.substr(match[0].length);
		} else if (match = endtoken.exec(sdl)) {
			tokens.push({ type: "end", marker: index + 1 });
			sdl = sdl.substr(match[0].length);
		} else if (match = blockComment.exec(sdl)) {
			sdl = sdl.substr(match[0].length);
		} else if (match = lineComment.exec(sdl)) {
			sdl = sdl.substr(match[0].length);
		} else if (match = blockStart.exec(sdl)) {
			tokens.push({ type: "block-start", marker: index });
			sdl = sdl.substr(match[0].length);
		} else if (match = blockEnd.exec(sdl)) {
			tokens.push({ type: "block-end", marker: index + 1 });
			sdl = sdl.substr(match[0].length);
		}
		/*if (tokens.length >= 2 && tokens[tokens.length - 1].type == "end" && tokens[tokens.length - 2].type == "end") {
			if (tokens[tokens.length - 2].marker < tokens[tokens.length - 1].marker)
				tokens[tokens.length - 2].marker = tokens[tokens.length - 1].marker;
			tokens.pop();
		}*/
		if (startLen == sdl.length)
			break;
		if (isAttribute && attributeRange) {
			if (tokens[tokens.length - 1].type == "value")
				tokens[tokens.length - 1] = { type: "attribute", range: attributeRange, name: attributeName, value: tokens[tokens.length - 1] }
			else {
				var lastTok: any = tokens[tokens.length - 1];
				tokens.pop();
				tokens.push({ type: "attribute", range: [attributeRange[0], attributeRange[1] + 1], name: attributeName, value: undefined });
				tokens.push(lastTok);
			}
			isAttribute = false;
		}
	}
	tokens.push({ type: "end", marker: original.length });
	/*if (tokens.length >= 2 && tokens[tokens.length - 1].type == "end" && tokens[tokens.length - 2].type == "end") {
		if (tokens[tokens.length - 2].marker < tokens[tokens.length - 1].marker)
			tokens[tokens.length - 2].marker = tokens[tokens.length - 1].marker;
		tokens.pop();
	}*/
	return tokens;
}

export function parseSDL(sdl: string): Tag {
	var tokens = tokenizeSDL(sdl);
	var root: Tag = {
		attributes: {},
		namespaces: {},
		tags: {},
		values: [],
		parent: null,
		errors: [],
		range: undefined
	}
	var currTag: Tag | null = root;
	var currNamespace = "";
	var anon = true;
	var lastWasEnd = true;
	var inIdentifier = false;

	for (var i = 0; i < tokens.length; i++) {
		var token = tokens[i];
		if (token.type != "end")
			lastWasEnd = false;

		if (!currTag)
			break;

		if (token.type == "value") {
			if (anon) {
				if (!currTag.tags[""])
					currTag.tags[""] = [{
						attributes: {},
						namespaces: {},
						tags: {},
						values: [],
						parent: currTag.parent || currTag
					}];
				currTag.tags[""][0].values.push({ namespace: "", ownerRange: [0, 0], parent: currTag, range: token.range, type: token.valuetype, value: token.value });
			}
			else {
				currTag.values.push({ namespace: "", ownerRange: [0, 0], parent: currTag, range: token.range, type: token.valuetype, value: token.value });
			}
		} else if (token.type == "attribute") {
			if (!currTag.attributes[token.name])
				currTag.attributes[token.name] = [];
			if (token.value)
				currTag.attributes[token.name].push({ namespace: currNamespace, ownerRange: token.range, parent: currTag, range: token.value.range, type: token.value.valuetype, value: token.value.value });
			else
				currTag.attributes[token.name].push({ namespace: currNamespace, ownerRange: token.range, parent: currTag, range: [token.range[1], token.range[1] + 1], type: "none", value: null });
			currNamespace = "";
		} else if (token.type == "unknown-identifier") {
			if (!currTag.attributes[token.name])
				currTag.attributes[token.name] = [];
			currTag.attributes[token.name].push({ namespace: currNamespace, ownerRange: token.range, parent: currTag, range: [sdl.length, sdl.length], type: "none", value: null });
			currNamespace = "";
		} else if (token.type == "namespace") {
			if (currNamespace != "")
				root.errors!.push({ range: token.range, message: "Can't stack namespaces", type: "error" });
			currNamespace = token.namespace;
		} else if (token.type == "identifier") {
			if (inIdentifier) {
				if (!currTag.attributes[token.name])
					currTag.attributes[token.name] = [];
				currTag.attributes[token.name].push({ namespace: currNamespace, ownerRange: token.range, parent: currTag, range: [token.range[1], token.range[1]], type: "none", value: null });
				currNamespace = "";
				root.errors!.push({ range: token.range, message: "An identifier doesn't belong here", type: "error" });
			}
			else {
				if (currNamespace) {
					if (!currTag.namespaces[currNamespace])
						currTag.namespaces[currNamespace] = {
							attributes: {},
							namespaces: {},
							tags: {},
							values: [],
							parent: currTag,
							isNamespace: true,
						};
					currTag = currTag.namespaces[currNamespace];
				}
				if (!currTag.tags[token.name])
					currTag.tags[token.name] = [];
				var tag: Tag = {
					attributes: {},
					namespaces: {},
					tags: {},
					values: [],
					parent: currTag,
					range: token.range,
					attributesRange: [token.range[1] + 1, token.range[1]]
				};
				currTag.tags[token.name].push(tag);
				currTag = tag;
				anon = false;
				currNamespace = "";
				inIdentifier = true;
			}
		} else if (token.type == "end") {
			if (!anon && !lastWasEnd) {
				inIdentifier = false;
				if (currTag.range)
					currTag.range[1] = token.marker;
				if (currTag.attributesRange)
					currTag.attributesRange[1] = token.marker;
				if (currTag.parent)
					currTag = currTag.parent;
				if (currTag.isNamespace)
					currTag = currTag.parent;
				anon = true;
			}
			lastWasEnd = true;
		} else if (token.type == "block-start") {
			inIdentifier = false;
			if (anon) {
				if (!currTag.tags[""])
					currTag.tags[""] = [{
						attributes: {},
						namespaces: {},
						tags: {},
						values: [],
						parent: currTag.parent || currTag,
						range: [token.marker, sdl.length]
					}];
				currTag = currTag.tags[""][0];
			}
			else {
				if (currTag.range)
					currTag.range[1] = token.marker;
				if (currTag.attributesRange)
					currTag.attributesRange[1] = token.marker;
				anon = true;
			}
		} else if (token.type == "block-end") {
			inIdentifier = false;
			if (currTag.range)
				currTag.range[1] = token.marker;
			if (anon && currTag.parent && currTag.parent.range)
				currTag.parent.range[1] = token.marker;
			if (currTag.parent)
				currTag = currTag.parent;
			else
				root.errors!.push({ range: [token.marker - 1, token.marker], message: "Invalid block end", type: "error" });
			if (currTag.isNamespace)
				currTag = currTag.parent;
		} else throw "Unknown token type '" + token.type + "'";
	}

	return root;
}