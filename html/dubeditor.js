// @ts-check

/** @type {"json" | "sdl"} */
let packageType = "json";
// dub.json content
let content = {};

const OPTION_EMPTY_VALUE = "*"; // workaround to https://github.com/microsoft/vscode-webview-ui-toolkit/issues/327

// IPC API
// @ts-ignore
const vscode = acquireVsCodeApi();
const state = vscode.getState() || {};

function setState(/** @type {string} */ key, /** @type {any} */ value) {
	state[key] = value;
	vscode.setState(state);
}

function runCommand(/** @type {string} */ command, /** @type {any} */ argument) {
	vscode.postMessage({
		cmd: command,
		arg: argument
	});
}

/**
 * @typedef {HTMLElement} VSCodeDataGridElement
 * @property {{ columnDataKey: string, title: string }} [columnDefinitions]
 * @property {{ [index: string]: string }} [rowsData]
 */

/**
 * @typedef {Object} InputOptions
 * @property {string} [error]
 * @property {string} [placeholder]
 * @property {string} [value]
 */

/**
 * @param {string} label
 * @param {InputOptions | undefined} options
 * @returns {Promise<string | undefined>}
 */
function getInput(label, options) {
	let callbackId = (_gid++).toString();
	let ret = new Promise(resolve => {
		_callbacks[callbackId] = v => resolve(v);
	});
	runCommand("getInput", { callbackId, label, options });
	return ret;
}

// event callback counter
let _gid = 0;
let _callbacks = {};
window.addEventListener("message", event => {
	const message = event.data;
	switch (message.type) {
		case "update":
			updateRecipeContent(message.json, message.errors);
			refreshSettings();
			return;
		case "callback":
			_callbacks[message.id](message.value);
			delete _callbacks[message.id];
			return;
	}
});

runCommand("refetch");

/**
 * @typedef {Object} InputOption
 * @property {"text" | "checkbox"} type
 * @property {string} name
 * @property {any} [defaultValue]
 * @property {boolean} [readonly]
 * @property {any} [option]
 * @property {string[]} [jsonPath]
 * @property {HTMLInputElement} [element]
 */

/**
 * @typedef {Object} TextAreaOption
 * @property {"textarea"} type
 * @property {string} name
 * @property {any} [defaultValue]
 * @property {boolean} [readonly]
 * @property {number} [rows]
 * @property {any} [option]
 * @property {string[]} [jsonPath]
 * @property {HTMLTextAreaElement} [element]
 */

/**
 * @typedef {InputOption | TextAreaOption} Option
 */

// basic DOM
let overridesSelector = /** @type {HTMLSelectElement} */ (document.getElementById("overrides"));
let platformSelector = /** @type {HTMLSelectElement} */ (document.getElementById("platforms"));
let architectureSelector = /** @type {HTMLSelectElement} */ (document.getElementById("architectures"));
let compilerSelector = /** @type {HTMLSelectElement} */ (document.getElementById("compilers"));

// fill content
let settings = document.querySelectorAll(".setting");
let complexSettings = document.querySelectorAll(".complex-setting");
let listSettings = document.querySelectorAll(".list-setting");

let overridesDisabled = false;
let suffixDisabled = false;

function isSameValue(a, b) {
	if (typeof a != typeof b)
		return false;
	if (typeof a == "object") {
		if (Array.isArray(a)) {
			if (!Array.isArray(b))
				return false;
			if (a.length != b.length)
				return false;
			for (var i = 0; i < b.length; i++)
				if (a[i] != b[i])
					return false;
			return true;
		}
		else {
			// there are no object primitive values used!
			return a == b;
		}
	}
	else return a == b;
}

/**
 * 
 * @param {Option[]} options 
 * @param {string[]} buttons 
 * @param {(string) => any} onButtonClick 
 */
function showDialog(options, buttons, onButtonClick) {
	var dialog = document.getElementById("filedialog");
	var contentSpace = dialog.querySelector(".content");
	var msgSpace = dialog.querySelector(".error");
	var btnSpace = dialog.querySelector(".buttons");
	for (var i = contentSpace.children.length - 1; i >= 0; i--)
		contentSpace.removeChild(contentSpace.children[i]);
	for (var i = btnSpace.children.length - 1; i >= 0; i--)
		btnSpace.removeChild(btnSpace.children[i]);
	msgSpace.textContent = "";
	var buttonHandler = function (e) {
		if (!onButtonClick)
			dialog.style.display = "none";
		else {
			var msg = onButtonClick(e.target.getAttribute("cb"));
			if (msg)
				msgSpace.textContent = msg;
			else
				dialog.style.display = "none";
		}
	};
	for (var i = 0; i < buttons.length; i++) {
		var button = document.createElement("vscode-button");
		if (i != 0)
			button.setAttribute("appearance", "secondary");
		button.textContent = buttons[i];
		button.setAttribute("cb", buttons[i]);
		button.onclick = buttonHandler;
		btnSpace.appendChild(button);
	}
	for (var i = 0; i < options.length; i++) {
		var opt = options[i];
		if (opt.type == "checkbox") {
			// @ts-ignore
			opt.element = opt.element || document.createElement("vscode-checkbox");
			opt.element.textContent = opt.name;
			opt.element.checked = !!opt.defaultValue;
		} else {
			// @ts-ignore
			opt.element = opt.element || document.createElement(opt.type == "textarea" ? "vscode-text-area" : "vscode-text-field");
			opt.element.textContent = opt.name;
			// @ts-ignore
			if (opt.rows) opt.element.rows = opt.rows;
			opt.element.value = opt.defaultValue || "";
		}

		if (opt.readonly)
			opt.element.setAttribute("readonly", "readonly");
		contentSpace.appendChild(opt.element);
	}
	dialog.style.display = "block";
}

/*
json path format: string[]
- if string, take key in the current scope with the name of that string as next scope
- if element starts with `:` then the format must be `:key=value` and assuming the current scope is an array searches for the item in the array where the key equals the value, then updates the scope to that item
*/

function getPathImpl(content, /** @type {string[]} */ path) {
	let scope = content;
	for (let i = 0; i < path.length; i++) {
		if (scope === undefined)
			return undefined;
		let part = path[i];
		if (part[0] == ":") {
			let eqIdx = part.indexOf("=");
			let key = part.substring(1, eqIdx);
			let val = part.substr(eqIdx + 1);
			for (let j = 0; j < scope.length; j++) {
				if (scope[j][key] == val) {
					scope = scope[j];
					break;
				}
			}
		} else
			scope = scope[part];
	}
	return scope;
}

function setPathImpl(content, /** @type {string[]} */ path, /** @type {any} */ value) {
	let scope = content;
	for (let i = 0; i < path.length - 1; i++) {
		let part = path[i];
		if (part[0] == ":") {
			if (scope === undefined)
				return;
			let eqIdx = part.indexOf("=");
			let key = part.substring(1, eqIdx);
			let val = part.substr(eqIdx + 1);
			for (let j = 0; j < scope.length; j++)
				if (scope[j][key] == val) {
					scope = scope[j];
					break;
				}
		} else {
			if (scope[path[i]] === undefined)
				scope[path[i]] = {};
			scope = scope[part];
		}
	}
	scope[path[path.length - 1]] = value;
	if (value === undefined)
		delete scope[path[path.length - 1]];
}

let getPath = (path) => getPathImpl(content, path);
let setPath = (path, value) => setPathImpl(content, path, value);

function getInArray(arr, name, isArray, propName) {
	if (isArray) {
		for (var i = 0; i < arr.length; i++)
			if (arr[i][propName] == name)
				return arr[i];
		return undefined;
	}
	else
		return arr[name];
}

function setInArray(arr, name, isArray, propName, value) {
	if (isArray) {
		value[propName] = name;
		for (var i = 0; i < arr.length; i++)
			if (arr[i][propName] == name)
				return arr[i] = value;
		arr.push(value);
		return value;
	}
	else
		return arr[name] = value;
}

function removeInArray(arr, name, isArray, propName) {
	if (isArray) {
		for (var i = 0; i < arr.length; i++)
			if (arr[i][propName] == name)
				return arr.splice(i, 1);
	}
	else
		delete arr[name];
}

function makePath(/** @type {HTMLElement} */ setting, /** @type {string[]} */ path, /** @type {boolean} */ addSuffix) {
	var suffix = "";
	var prefix = [];
	if (setting.getAttribute("has-suffix") == "true") {
		if (platformSelector.value != OPTION_EMPTY_VALUE)
			suffix += "-" + platformSelector.value;
		if (architectureSelector.value != OPTION_EMPTY_VALUE)
			suffix += "-" + architectureSelector.value;
		if (compilerSelector.value != OPTION_EMPTY_VALUE)
			suffix += "-" + compilerSelector.value;

		if (overridesSelector.value != OPTION_EMPTY_VALUE
			&& overridesSelector.value.startsWith("build:"))
			prefix = ["buildTypes", overridesSelector.value.substring("build:".length)];
	}
	// important: config and buildtypes cant mix!
	if (setting.getAttribute("has-config") != "false"
		&& overridesSelector.value != OPTION_EMPTY_VALUE
		&& overridesSelector.value.startsWith("config:"))
		prefix = ["configurations", ":name=" + overridesSelector.value.substring("config:".length)];

	if (addSuffix)
		path[path.length - 1] += suffix;
	return prefix.concat(path);
}

function updateOverrides() {
	/**
	 * @type {[string, string][]}
	 */
	let fullArray = [];
	if (content.configurations && Array.isArray(content.configurations)) {
		let configurations = [];
		for (let i = 0; i < content.configurations.length; i++)
			if (content.configurations[i].name)
				configurations.push(content.configurations[i].name);
		for (let i = 0; i < configurations.length; i++) {
			fullArray.push(["config:" + configurations[i], "--config=" + configurations[i]]);
		}
	}
	if (content.buildTypes && typeof content.buildTypes == "object") {
		let buildTypes = Object.keys(content["buildTypes"]);
		for (let i = 0; i < buildTypes.length; i++) {
			fullArray.push(["build:" + buildTypes[i], "--build=" + buildTypes[i]]);
		}
	}

	let allMatch = true;
	for (let i = 0; i < fullArray.length; i++) {
		if (!overridesSelector.children[i + 1]
			|| /** @type {any} */ (overridesSelector.children[i + 1]).value != fullArray[i][0]
			|| overridesSelector.children[i + 1].textContent != fullArray[i][1]) {
			allMatch = false;
			break;
		}
	}

	if (allMatch)
		return;

	let selected = overridesSelector.value;
	for (let i = overridesSelector.children.length - 1; i >= 0; i--)
		if ((/** @type {HTMLOptionElement} */ (overridesSelector.children[i])).value != OPTION_EMPTY_VALUE)
			overridesSelector.removeChild(overridesSelector.children[i]);

	function addOption(value, textContent) {
		let option = /** @type {HTMLOptionElement} */ (document.createElement("vscode-option"));
		option.value = value;
		option.textContent = textContent;
		overridesSelector.appendChild(option);

		if (selected == value)
		{
			option.selected = true;
			// https://github.com/microsoft/vscode-webview-ui-toolkit/issues/332
			option.setAttribute("selected", "selected");
		}
	}

	fullArray.forEach(option => {
		addOption(option[0], option[1]);
	});

	overridesSelector.value = selected;
}

function fixSelectors() {
	if (overridesSelector.value != OPTION_EMPTY_VALUE && overridesDisabled) {
		overridesSelector.value = OPTION_EMPTY_VALUE;
		overridesSelector.setAttribute("disabled", "disabled");
		console.log("Disabled configurationSelector");
	}
	else if (!overridesDisabled)
		overridesSelector.removeAttribute("disabled");
}

let didStartup = false;
function ready() {
	if (didStartup) return;
	didStartup = true;

	overridesSelector.value = state["dub.overrides"] || OPTION_EMPTY_VALUE;
	platformSelector.value = state["dub.platform"] || OPTION_EMPTY_VALUE;
	architectureSelector.value = state["dub.architecture"] || OPTION_EMPTY_VALUE;
	compilerSelector.value = state["dub.compiler"] || OPTION_EMPTY_VALUE;

	console.log("loaded state:",
		"\n\toverrides:", overridesSelector.value,
		"\n\tplatform:", platformSelector.value,
		"\n\tarchitecture:", architectureSelector.value,
		"\n\tcompiler:", compilerSelector.value);

	refreshSettings();
	document.querySelectorAll(".refresh-ui").forEach(e => {
		e.addEventListener("change", refreshSettings);
		e.addEventListener("dub-update", refreshSettings);
	});

	// setup tabs
	var activeTab = undefined;

	function switchTab(element) {
		if (activeTab === element.id || element.id === undefined)
			return;
		if (activeTab !== undefined) {
			var page = "page" + activeTab.substr(3);
			document.getElementById(page).setAttribute("class", "child");
			document.getElementById(activeTab).setAttribute("class", "");
		}
		activeTab = element.id;
		page = "page" + activeTab.substr(3);
		document.getElementById(page).setAttribute("class", "child visible");
		element.setAttribute("class", "active");
		setState("dub.activeTab", activeTab);
		var hasSuffixMembers = !!element.getAttribute("has-suffix");
		var hasOverride = element.getAttribute("has-override") != "false";
		if (hasSuffixMembers) {
			platformSelector.removeAttribute("disabled");
			architectureSelector.removeAttribute("disabled");
			compilerSelector.removeAttribute("disabled");
		}
		else {
			platformSelector.setAttribute("disabled", "disabled");
			architectureSelector.setAttribute("disabled", "disabled");
			compilerSelector.setAttribute("disabled", "disabled");
		}

		if (hasOverride)
			overridesSelector.removeAttribute("disabled");
		else
			overridesSelector.setAttribute("disabled", "disabled")

		suffixDisabled = !hasSuffixMembers;
		overridesDisabled = !hasOverride;
		fixSelectors();
	}

	var tabsMenu = document.getElementById("tabs").querySelectorAll("li");
	for (var i = 0; i < tabsMenu.length; i++) {
		tabsMenu[i].onclick = (function () {
			switchTab(this);
		}).bind(tabsMenu[i]);
	}

	if (state["dub.activeTab"])
		switchTab(document.getElementById(state["dub.activeTab"]));
	else
		switchTab(document.getElementById("tabGeneral"));
}

function updateRecipeContent(newContent, errors) {
	if (packageType != "json" && packageType != "sdl")
		throw new Error("Invalid type");

	content = newContent;
	updateOverrides();
	ready();

	let errorOutput = document.getElementById("errors");
	let errorText = "";
	for (let i = 0; i < errors.length; i++) {
		let e = errors[i];
		errorText += "Line " + e.line + ":" + e.column + ": " + e.message;
	}
	if (errorText)
		errorOutput.textContent = "Errors parsing JSON:\n" + errorText;
	else
		errorOutput.textContent = "";
}


function refreshSettings() {
	try {
		console.log("refreshing settings ", overridesSelector.value);
		setState("dub.overrides", overridesSelector.value);
		setState("dub.platform", platformSelector.value);
		setState("dub.architecture", architectureSelector.value);
		setState("dub.compiler", compilerSelector.value);

		if (packageType == "json") {
			loadJsonIntoUI();
		} else if (packageType == "sdl") {
			document.write("dub.sdl files are not supported yet");
		} else {
			document.write("unknown file format");
		}
		console.log("done refreshing settings ", overridesSelector.value);
	}
	catch (e) {
		console.log(e);
	}
}

function loadJsonIntoUI() {
	for (let i = 0; i < settings.length; i++) {
		let setting =  /** @type {HTMLInputElement} */ (settings[i]);
		// json-path="description"
		// json-value="name" in string[] for checkboxes
		// json-type="string[]"

		let inputType = setting.getAttribute("type");
		let path = setting.getAttribute("json-path").split(/\./g);
		if (!path)
			continue;
		let type = setting.getAttribute("json-type");
		let strValue = setting.getAttribute("json-value");
		let configPath = undefined;
		let pathWithSuffix = makePath(setting, path, true);
		let pathWithoutSuffix = makePath(setting, path, false);
		if (getPath(pathWithSuffix) !== undefined)
			configPath = pathWithSuffix;
		else if (pathWithSuffix != pathWithoutSuffix && getPath(pathWithoutSuffix) !== undefined)
			configPath = pathWithoutSuffix;
		let encode, decode;
		if (inputType == "checkbox") {
			if (type == "string[]" && strValue) {
				decode = function (configPath, value) {
					setting.checked = configPath === undefined ? !!value : value.indexOf(strValue) != -1;
				};
				encode = (function (configPath, strValue, setting, e) {
					var value = getPath(configPath).slice();
					if (setting.checked) {
						if (value.indexOf(strValue) == -1)
							value.push(strValue);
					}
					else {
						var index = value.indexOf(strValue);
						if (index != -1)
							value.splice(index, 1);
					}
					return value;
				}).bind(this, configPath, strValue, setting);
			}
			else {
				decode = function (configPath, value) {
					setting.checked = configPath === undefined ? !!value : value;
				};
				encode = (function (setting, e) {
					return setting.checked;
				}).bind(this, setting);
			}
		}
		else {
			decode = function (type, configPath, value) {
				setting.value = configPath === undefined ? (value || "") : (
					type == "string[]" ?
						(value || []).join("\n")
						: (value || ""));
			}.bind(this, type);
			encode = (function (type, setting, e) {
				var newVal;
				if (type == "string[]") {
					if (setting.value.trim() == "")
						newVal = undefined;
					else
						newVal = setting.value.split("\n");
				}
				else
					newVal = setting.value || undefined;
				return newVal;
			}).bind(this, type, setting);
		}
		var configSetting;
		if (configPath !== undefined)
			configSetting = getPath(configPath);
		else
			configSetting = JSON.parse(setting.getAttribute("json-default"));
		decode(configPath, configSetting);
		configPath = makePath(setting, path, true);
		let changeFun = (function (setting, configPath, path, encode, e) {
			var value = encode(e);
			var set = true;
			var suffixlessPath = makePath(setting, path, false);
			if (configPath != suffixlessPath)
				if (isSameValue(getPath(suffixlessPath), value))
					set = false;
			value = set ? value : undefined;
			runCommand("setValue", {
				path: configPath,
				value: value
			});
			setPath(configPath, value);
		}).bind(this, setting, configPath, path, encode);
		if (setting.tagName == "VSCODE-TEXT-FIELD" || setting.tagName == "VSCODE-TEXT-AREA")
			setting.oninput = changeFun;
		else
			setting.onchange = changeFun;
	}
	for (let i = 0; i < complexSettings.length; i++) {
		// TODO: need to store the extra state per platform-suffix-combo, not globally
		let setting = /** @type {VSCodeDataGridElement & { rows: ({ label: string } | { [index: string]: boolean })[], columnNames: string[], addedClick: boolean }} */ (complexSettings[i]);
		// Import=importPaths;Source=sourcePaths;String Import=stringImportPaths
		let paths = setting.getAttribute("json-paths").split(/;/g).map(v => v.split("=", 2));
		if (!paths)
			continue;
		if (setting.querySelector("vscode-text-field"))
			continue;

		const hasSuffix = setting.getAttribute("has-suffix") == "true";

		if (!setting.columnNames) {
			setting.columnNames = [setting.getAttribute("string-label")];

			for (let j = 0; j < paths.length; j++) {
				let parts = paths[j];
				let name = parts[0];
				setting.columnNames.push(name);
			}

			let spacing = "1fr";
			for (let j = 1; j < setting.columnNames.length; j++)
				spacing += " 96px";
			setting.setAttribute("grid-template-columns", spacing);

			let headerRowElem = document.createElement("vscode-data-grid-row");
			headerRowElem.setAttribute("row-type", "header");
			for (let column = 0; column < setting.columnNames.length; column++) {
				let columnElem = document.createElement("vscode-data-grid-cell");
				columnElem.setAttribute("cell-type", "columnheader");
				columnElem.setAttribute("grid-column", (column + 1).toString());
				columnElem.textContent = setting.columnNames[column];
				headerRowElem.appendChild(columnElem);
			}
			setting.appendChild(headerRowElem);
		}

		if (!setting.rows)
			setting.rows = [];

		for (let j = 0; j < setting.rows.length; j++) {
			// first unset all the checkboxes
			// @ts-ignore
			setting.rows[j] = { label: setting.rows[j].label };
		}

		for (let j = 0; j < paths.length; j++) {
			let parts = paths[j];
			let path = parts[1].split(/\./g);
			let configPath = undefined;
			if (getPath(makePath(setting, path, hasSuffix)) !== undefined)
				configPath = makePath(setting, path, hasSuffix);
			else if (hasSuffix && getPath(makePath(setting, path, false)) !== undefined)
				configPath = makePath(setting, path, false);

			if (configPath !== undefined) {
				let items = getPath(configPath);
				for (let fi = 0; fi < items.length; fi++) {
					let item = items[fi];
					let index = setting.rows.findIndex(row => row.label == item);
					if (index == -1) {
						index = setting.rows.length;
						setting.rows.push({ label: item });
					}
					setting.rows[index]["d" + j] = true;
				}
			}
		}

		function recreateCells() {
			for (let row = 0; row < setting.rows.length; row++) {
				let rowElem = document.createElement("vscode-data-grid-row");
				let labelCell = document.createElement("vscode-data-grid-cell");
				labelCell.setAttribute("grid-column", "1");
				// @ts-ignore
				labelCell.textContent = setting.rows[row].label;
				rowElem.appendChild(labelCell);
				for (let column = 1; column < setting.columnNames.length; column++) {
					let cell = document.createElement("vscode-data-grid-cell");
					cell.setAttribute("grid-column", (column + 1).toString());
					let cb = /** @type {HTMLInputElement} */ (document.createElement("vscode-checkbox"));
					cb.checked = !!setting.rows[row]["d" + (column - 1)];
					cell.appendChild(cb);
					rowElem.appendChild(cell);
				}
				setting.appendChild(rowElem);
			}
		}

		/**
		 * @param {HTMLElement} cellElement
		 * @param {(value) => any} onChange
		 * @param {() => any} onRemove
		 */
		function startEdit(cellElement, onChange, onRemove) {
			let existing = setting.querySelectorAll("vscode-text-field");
			for (let i = 0; i < existing.length; i++) {
				// @ts-ignore
				existing[i].finishEdit();
			}

			let field = /** @type { HTMLInputElement } */ (document.createElement("vscode-text-field"));
			field.classList.add("inline-edit");
			// @ts-ignore
			field.finishEdit = function() {
				if (!field.value) {
					onRemove();
				} else {
					field.parentElement.insertBefore(field, document.createTextNode(field.value));
					field.parentElement.removeChild(field);
				}
			};

			field.addEventListener("input", function() {
				onChange(field.value);
			});

			field.value = cellElement.textContent;
			cellElement.removeChild(cellElement.firstChild);
			cellElement.appendChild(field);
		}

		if (!setting.addedClick) {
			setting.addedClick = true;
			setting.nextElementSibling.addEventListener("click", function() {
				setting.rows.push({ label: "" });
				recreateCells();
			});
		}

		recreateCells();
	}
	for (let i = 0; i < listSettings.length; i++) {
		let setting = /** @type {HTMLSelectElement} */ (listSettings[i]);
		let path = setting.getAttribute("json-path").split(/\./g);
		if (!path)
			continue;
		let arrayType = setting.getAttribute("json-array") == "true";
		let arrayProp = setting.getAttribute("json-array-key");
		let addBtn = /** @type {HTMLButtonElement} */ (setting.parentElement.querySelector(".add"));
		let renameBtn = /** @type {HTMLButtonElement} */ (setting.parentElement.querySelector(".rename"));
		let removeBtn = /** @type {HTMLButtonElement} */ (setting.parentElement.querySelector(".remove"));

		addBtn.onclick = (async function (setting, path, arrayType, arrayProp) {
			const settingName = setting.getAttribute("ui-setting-name");
			let error = undefined;
			while (true)
			{
				let options = { "error": error };
				if (settingName)
					options.placeholder = settingName + " name";
				let name = await getInput("Enter Name", options);
				if (!name)
					return;
				if (!getPath(path))
					setPath(path, arrayType ? [] : {});
				if (getInArray(getPath(path), name, arrayType, arrayProp)) {
					error = "An entry with this name already exists";
					continue;
				}
				setInArray(getPath(path), name, arrayType, arrayProp, JSON.parse(setting.getAttribute("json-default") || "null"));
				runCommand("setValue", {
					path: path,
					value: getPath(path)
				});
				let option = /** @type {HTMLOptionElement} */ (document.createElement(setting.tagName.startsWith("VSCODE") ? "vscode-option" : "option"));
				option.value = name;
				option.textContent = name;
				setting.appendChild(option);
				setting.dispatchEvent(new Event("dub-update"));
				break;
			}
		}).bind(this, setting, path, arrayType, arrayProp);
		removeBtn.onclick = (function (setting, path, arrayType, arrayProp) {
			if (!getPath(path))
				return;
			let options = setting.children;
			for (let i = options.length - 1; i >= 0; i--)
				if (options[i].selected) {
					removeInArray(getPath(path), options[i].value, arrayType, arrayProp);
					setting.removeChild(options[i]);
				}
			runCommand("setValue", {
				path: path,
				value: getPath(path)
			});
			setting.dispatchEvent(new Event("dub-update"));
		}).bind(this, setting, path, arrayType, arrayProp);
		renameBtn.onclick = (async function(setting, path, arrayType, arrayProp) {
			let selected = undefined;
			let options = setting.children;
			for (let i = options.length - 1; i >= 0; i--)
				if (options[i].selected) {
					selected = options[i];
					break;
				}
			if (!selected)
				return;
			let origName = selected.value;
			let value = origName;

			const settingName = setting.getAttribute("ui-setting-name");
			let error = undefined;
			while (true)
			{
				/**
				 * @type {InputOptions}
				 */
				let options = { "error": error, "value": value };
				if (settingName)
					options.placeholder = settingName + " name";
				value = await getInput("Enter new Name", options);
				if (!value)
					return;
				if (!getPath(path))
					setPath(path, arrayType ? [] : {});

				let oldValue = getInArray(getPath(path), origName, arrayType, arrayProp);
				if (!oldValue) {
					runCommand("showError", "Could not rename, try reopening the settings");
					break;
				}

				if (getInArray(getPath(path), value, arrayType, arrayProp)) {
					error = "An entry with this name already exists";
					continue;
				}

				if (arrayType) {
					oldValue[arrayProp] = value;
				}
				else {
					getPath(path)[value] = oldValue;
					delete getPath(path)[origName];
				}

				runCommand("setValue", {
					path: path,
					value: getPath(path)
				});
				selected.value = value;
				selected.textContent = value;
				setting.dispatchEvent(new Event("dub-update"));
				break;
			}
		}).bind(this, setting, path, arrayType, arrayProp);

		for (let j = setting.options.length - 1; j >= 0; j--)
			setting.removeChild(setting.options[j]);

		let values = getPath(path);
		if (values) {
			if (arrayType) {
				for (let j = 0; j < values.length; j++) {
					let option = /** @type {HTMLOptionElement} */ (document.createElement(setting.tagName.startsWith("VSCODE") ? "vscode-option" : "option"));
					option.value = values[j][arrayProp];
					option.textContent = values[j][arrayProp];
					setting.appendChild(option);
				}
			}
			else {
				let names = Object.keys(values);
				for (let j = 0; j < names.length; j++) {
					let option = /** @type {HTMLOptionElement} */ (document.createElement(setting.tagName.startsWith("VSCODE") ? "vscode-option" : "option"));
					option.value = names[j];
					option.textContent = names[j];
					setting.appendChild(option);
				}
			}
		}
	}
	{
		var dependencies = document.getElementById("dependencies");
		for (var i = dependencies.children.length - 1; i >= 0; i--)
			dependencies.removeChild(dependencies.children[i]);
		var addDependency = function (key, depObj) {
			var tr = document.createElement("tr");
			var name = document.createElement("td");
			var version = document.createElement("td");
			var removeBtn = document.createElement("td");

			name.textContent = key;
			var versionOrPath;
			var type = "Version";
			if (typeof depObj == "string")
				versionOrPath = depObj;
			else {
				if (depObj.path) {
					type = "Path";
					versionOrPath = depObj.path;
				}
				else if (depObj.version)
					versionOrPath = depObj.version;
				else
					return;
			}
			var versionLabel = document.createElement("label");
			versionLabel.className = "label lite";
			var versionInput = document.createElement("input");
			versionInput.value = versionOrPath;
			versionInput.setAttribute("depname", key);
			versionInput.oninput = (function (key, versionInput) {
				var depObj = content.dependencies[key];
				if (!depObj)
					return;
				if (typeof depObj == "string")
					content.dependencies[key] = versionInput.value;
				else if (depObj.path)
					depObj.path = versionInput.value;
				else if (depObj.version)
					depObj.version = versionInput.value;

				runCommand("setValue", {
					path: ["dependencies"],
					value: content.dependencies
				});
			}).bind(this, key, versionInput);
			versionLabel.appendChild(document.createTextNode(type));
			versionLabel.appendChild(versionInput);
			version.appendChild(versionLabel);
			var removeLabel = document.createElement("vscode-button");
			removeLabel.textContent = "Remove";
			removeLabel.setAttribute("appearance", "secondary");
			removeLabel.onclick = (function (key, tr) {
				delete content.dependencies[key];
				dependencies.removeChild(tr);

				runCommand("setValue", {
					path: ["dependencies"],
					value: content.dependencies
				});
			}).bind(this, key, tr);
			removeBtn.appendChild(removeLabel);

			tr.appendChild(name);
			tr.appendChild(version);
			tr.appendChild(removeBtn);

			dependencies.appendChild(tr);
		}
		var addButton = /** @type {HTMLButtonElement} */ (dependencies.parentElement.querySelector("vscode-button"));
		addButton.onclick = function () {
			/**
			 * @type {InputOption[]}
			 */
			var options = [
				{
					name: "Name",
					type: "text"
				}, {
					name: "From Path",
					type: "checkbox"
				}, {
					name: "Path or Version",
					type: "text"
				}
			];
			showDialog(options, ["Add", "Cancel"], function (r) {
				if (r == "Add") {
					if (!content.dependencies)
						content.dependencies = {};
					var name = options[0].element.value;
					var pathOrVersion = options[2].element.value;
					if (!name)
						return "Please enter a name";
					if (!pathOrVersion)
						return "Please enter a path or version";
					if (content.dependencies[name])
						return "This dependency already exists!";
					if (options[1].element.checked) {
						content.dependencies[name] = { path: pathOrVersion };
					}
					else {
						content.dependencies[name] = pathOrVersion;
					}
					runCommand("setValue", {
						path: ["dependencies"],
						value: content.dependencies
					});
					addDependency(name, content.dependencies[name]);
				}
			});
		};
		if (content.dependencies) {
			for (var key in content.dependencies) {
				if (content.dependencies.hasOwnProperty(key)) {
					addDependency(key, content.dependencies[key]);
				}
			}
		}
	}
}
