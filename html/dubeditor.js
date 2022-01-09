// @ts-check

/** @type {"json" | "sdl"} */
let packageType = "json";
// dub.json content
let content = {};

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
 * @typedef {Object} InputOptions
 * @property {string} [error]
 * @property {string} [placeholder]
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
let configurationSelector = /** @type {HTMLSelectElement} */ (document.getElementById("configurations"));
let buildtypeSelector = /** @type {HTMLSelectElement} */ (document.getElementById("buildtypes"));
let platformSelector = /** @type {HTMLSelectElement} */ (document.getElementById("platforms"));
let architectureSelector = /** @type {HTMLSelectElement} */ (document.getElementById("architectures"));
let compilerSelector = /** @type {HTMLSelectElement} */ (document.getElementById("compilers"));

// fill content
let settings = document.querySelectorAll(".setting");
let complexSettings = document.querySelectorAll(".complex-setting");
let listSettings = document.querySelectorAll(".list-setting");

let configDisabled = false;
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
		if (platformSelector.value)
			suffix += "-" + platformSelector.value;
		if (architectureSelector.value)
			suffix += "-" + architectureSelector.value;
		if (compilerSelector.value)
			suffix += "-" + compilerSelector.value;

		if (buildtypeSelector.value)
			prefix = ["buildTypes", buildtypeSelector.value];
	}
	// important: config and buildtypes cant mix!
	if (setting.getAttribute("has-config") != "false") {
		if (configurationSelector.value)
			prefix = ["configurations", ":name=" + configurationSelector.value];
	}
	if (addSuffix)
		path[path.length - 1] += suffix;
	return prefix.concat(path);
}

function updateBuildTypes() {
	var selected = buildtypeSelector.value;
	for (var i = buildtypeSelector.options.length - 1; i >= 0; i--)
		if (buildtypeSelector.options[i].value)
			buildtypeSelector.removeChild(buildtypeSelector.options[i]);
	if (!content.buildTypes || typeof content.buildTypes != "object")
		return;
	var buildTypes = Object.keys(content["buildTypes"]);
	for (var i = 0; i < buildTypes.length; i++) {
		var option = /** @type {HTMLOptionElement} */ (document.createElement("vscode-option"));
		option.value = buildTypes[i];
		option.textContent = buildTypes[i];
		buildtypeSelector.appendChild(option);
	}
	if (selected && buildTypes.indexOf(selected) == -1) {
		console.log("Deleted build type");
		console.log("Array: " + JSON.stringify(buildTypes) + ", selected: " + selected);
		buildtypeSelector.value = "";
	}
	else
		buildtypeSelector.value = selected;
}

function updateConfigurations() {
	var selected = configurationSelector.value;
	for (var i = configurationSelector.options.length - 1; i >= 0; i--)
		if (configurationSelector.options[i].value)
			configurationSelector.removeChild(configurationSelector.options[i]);
	if (!content.configurations || !Array.isArray(content.configurations))
		return;
	var configurations = [];
	for (var i = 0; i < content.configurations.length; i++)
		if (content.configurations[i].name)
			configurations.push(content.configurations[i].name);
	for (var i = 0; i < configurations.length; i++) {
		var option = /** @type {HTMLOptionElement} */ (document.createElement("vscode-option"));
		option.value = configurations[i];
		option.textContent = configurations[i];
		configurationSelector.appendChild(option);
	}
	if (selected && configurations.indexOf(selected) == -1) {
		console.log("Deleted configuration");
		console.log("Array: " + JSON.stringify(configurations) + ", selected: " + selected);
		configurationSelector.value = "";
	}
	else
		configurationSelector.value = selected;
}

function fixSelectors() {
	console.log("Fix Selectors");
	if (configurationSelector.value) {
		buildtypeSelector.value = "";
		buildtypeSelector.setAttribute("disabled", "disabled");
		console.log("Disabled buildtypeSelector");
	}
	else if (!suffixDisabled)
		buildtypeSelector.removeAttribute("disabled");

	if (buildtypeSelector.value) {
		configurationSelector.value = "";
		configurationSelector.setAttribute("disabled", "disabled");
		console.log("Disabled configurationSelector");
	}
	else if (!configDisabled)
		configurationSelector.removeAttribute("disabled");
}

let didStartup = false;
function ready() {
	if (didStartup) return;
	didStartup = true;

	configurationSelector.value = state["dub.configuration"] || "";
	buildtypeSelector.value = state["dub.configuration"] || "";
	platformSelector.value = state["dub.platform"] || "";
	architectureSelector.value = state["dub.architecture"] || "";
	compilerSelector.value = state["dub.compiler"] || "";

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
		var hasConfiguration = element.getAttribute("has-config") != "false";
		if (hasSuffixMembers) {
			platformSelector.removeAttribute("disabled");
			architectureSelector.removeAttribute("disabled");
			compilerSelector.removeAttribute("disabled");
			buildtypeSelector.removeAttribute("disabled");
		}
		else {
			platformSelector.setAttribute("disabled", "disabled");
			architectureSelector.setAttribute("disabled", "disabled");
			compilerSelector.setAttribute("disabled", "disabled");
			buildtypeSelector.setAttribute("disabled", "disabled");
		}
		if (hasConfiguration)
			configurationSelector.removeAttribute("disabled");
		else
			configurationSelector.setAttribute("disabled", "disabled")
		suffixDisabled = !hasSuffixMembers;
		configDisabled = !hasConfiguration;

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

	ready();

	content = newContent;
	updateBuildTypes();
	updateConfigurations();
	fixSelectors();

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
		setState("dub.configuration", configurationSelector.value);
		setState("dub.buildtype", buildtypeSelector.value);
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
		let setting = /** @type {HTMLSelectElement} */ (complexSettings[i]);
		// Import:importPaths;Source:sourcePaths;String Import:stringImportPaths
		let paths = setting.getAttribute("json-paths").split(/;/g);
		if (!paths)
			continue;
		let type = setting.getAttribute("json-type");
		if (type == "files") {
			let addBtn = /** @type {HTMLButtonElement} */ (setting.parentElement.querySelector(".add"));
			let editBtn = /** @type {HTMLButtonElement} */ (setting.parentElement.querySelector(".edit"));
			let removeBtn = /** @type {HTMLButtonElement} */ (setting.parentElement.querySelector(".remove"));

			removeBtn.onclick = (function (setting) {
				let options = setting.options;
				let toRemove = [];
				for (let i = options.length - 1; i >= 0; i--)
					if (options[i].selected) {
						toRemove.push({
							name: options[i].value,
							paths: options[i].getAttribute("paths").split(";;")
						});
						setting.removeChild(options[i]);
					}
				for (let i = 0; i < toRemove.length; i++) {
					let elem = toRemove[i];
					for (let j = 0; j < elem.paths.length; j++) {
						let path = elem.paths[j];
						let configPath = undefined;
						if (getPath(makePath(setting, path, true)) !== undefined)
							configPath = makePath(setting, path, true);
						else if (getPath(makePath(setting, path, false)) !== undefined)
							configPath = makePath(setting, path, false);
						let index = getPath(configPath).indexOf(elem.name);
						if (index != -1) {
							getPath(configPath).splice(index, 1);
							runCommand("setValue", {
								path: configPath,
								value: getPath(configPath)
							});
						}
						else console.log("Path not in dub.json?!");
					}
				}
			}).bind(this, setting);

			addBtn.onclick = (function (setting, paths) {
				/**
				 * @type {InputOption[]}
				 */
				let options = [
					{ type: "text", name: "File" }
				];
				for (let j = 0; j < paths.length; j++) {
					let parts = paths[j].split(":");
					options.push({
						type: "checkbox",
						name: parts[0],
						jsonPath: parts[1]
					});
				}
				showDialog(options, ["Add", "Cancel"], function (btn) {
					if (btn == "Add") {
						let file = options[0].element.value;
						if (!file)
							return "Please enter a file path";
						let addedCount = 0;
						let paths = [];
						let names = [];
						for (let j = 1; j < options.length; j++) {
							if (!options[j].element.checked)
								continue;
							addedCount++;
							let path = options[j].jsonPath;
							let configPath = makePath(setting, path, true);

							if (getPath(configPath) === undefined)
								setPath(configPath, (getPath(path) || []).slice());
							if (getPath(configPath).indexOf(file) == -1)
								getPath(configPath).push(file);
							// set anyway in case of new field creation
							runCommand("setValue", {
								path: configPath,
								value: getPath(configPath)
							});
							names.push(options[j].name);
							paths.push(path);
						}
						if (addedCount == 0)
							return "Select at least one category";
						let existing = false;
						let option = /** @type {HTMLOptionElement} */ (document.createElement(setting.tagName.startsWith("VSCODE") ? "vscode-option" : "option"));
						for (let j = 0; j < setting.options.length; j++)
							if (setting.options[j].value == file) {
								option = setting.options[j];
								existing = true;
								break;
							}
						option.value = file;
						option.setAttribute("paths", paths.join(";;"));
						let tags = "";
						if (names.length)
							tags = " (" + names.join(", ") + ")";
						option.textContent = file + tags;
						if (!existing)
							setting.appendChild(option);
					}
				});
			}).bind(this, setting, paths);

			editBtn.onclick = (function (setting, paths) {
				let selected = undefined;
				for (let i = setting.options.length - 1; i >= 0; i--)
					if (setting.options[i].selected) {
						selected = setting.options[i];
						break;
					}
				if (!selected)
					return;
				/**
				 * @type { InputOption[] }
				 */
				let options = [
					{ type: "text", name: "File", readonly: true, defaultValue: selected.value, option: selected }
				];
				let file = selected.value;
				for (let j = 0; j < paths.length; j++) {
					let parts = paths[j].split(":");
					let path = parts[1];
					let configPath = makePath(setting, path, true);

					if (getPath(configPath) === undefined)
						setPath(configPath, (getPath(path) || []).slice());
					options.push({
						type: "checkbox",
						name: parts[0],
						jsonPath: path,
						defaultValue: getPath(configPath).indexOf(file) != -1
					});
				}
				showDialog(options, ["Update", "Cancel"], function (btn) {
					if (btn == "Update") {
						let paths = [];
						let names = [];
						for (let j = 1; j < options.length; j++) {
							let path = options[j].jsonPath;
							let configPath = makePath(setting, path, true);

							if (getPath(configPath) === undefined)
								setPath(configPath, (getPath(path) || []).slice());
							if (options[j].element.checked) {
								if (getPath(configPath).indexOf(file) == -1)
									getPath(configPath).push(file);
							}
							else {
								let index = getPath(configPath).indexOf(file);
								if (index != -1)
									getPath(configPath).splice(index, 1);
							}
							// set anyway in case of new field creation
							runCommand("setValue", {
								path: configPath,
								value: getPath(configPath)
							});
							if (options[j].element.checked) {
								names.push(options[j].name);
								paths.push(path);
							}
						}
						let option = options[0].option;
						option.setAttribute("paths", paths.join(";;"));
						let tags = "";
						if (names.length)
							tags = " (" + names.join(", ") + ")";
						option.textContent = file + tags;
					}
				});
			}).bind(this, setting, paths);

			let found = [];
			for (let j = 0; j < paths.length; j++) {
				let parts = paths[j].split(":");
				let name = parts[0];
				let path = parts[1].split(/\./g);
				let configPath = undefined;
				if (getPath(makePath(setting, path, true)) !== undefined)
					configPath = makePath(setting, path, true);
				else if (getPath(makePath(setting, path, false)) !== undefined)
					configPath = makePath(setting, path, false);

				if (configPath !== undefined) {
					let files = getPath(configPath);
					for (let fi = 0; fi < files.length; fi++) {
						let file = files[fi];
						let handled = false;
						for (let fo = 0; fo < found.length; fo++) {
							if (found[fo].file == file) {
								found[fo].paths.push(path);
								found[fo].names.push(name);
								handled = true;
							}
						}
						if (!handled) {
							found.push({
								file: file,
								paths: [path],
								names: [name]
							});
						}
					}
				}
			}

			for (let j = setting.options.length - 1; j >= 0; j--)
				setting.removeChild(setting.options[j]);

			for (let j = 0; j < found.length; j++) {
				let option = /** @type {HTMLOptionElement} */ (document.createElement(setting.tagName.startsWith("VSCODE") ? "vscode-option" : "option"));
				option.value = found[j].file;
				option.setAttribute("paths", found[j].paths.join(";;"));
				let tags = "";
				if (found[j].names.length)
					tags = " (" + found[j].names.join(", ") + ")";
				option.textContent = found[j].file + tags;
				setting.appendChild(option);
			}
		}
		else throw "Unsupported complex setting: " + type;
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
				var option = /** @type {HTMLOptionElement} */ (document.createElement(setting.tagName.startsWith("VSCODE") ? "vscode-option" : "option"));
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
			var options = setting.options;
			for (var i = options.length - 1; i >= 0; i--)
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
		renameBtn.onclick = (function (setting, path, arrayType, arrayProp) {
			var selected = undefined;
			for (var i = setting.options.length - 1; i >= 0; i--)
				if (setting.options[i].selected) {
					selected = setting.options[i];
					break;
				}
			if (!selected)
				return;
			/**
			 * @type {InputOption[]}
			 */
			var options = [{
				type: "text",
				name: "Name",
				defaultValue: selected.value
			}];
			var origName = selected.value;
			showDialog(options, ["Rename", "Cancel"], function (r) {
				if (r == "Rename") {
					var name = options[0].element.value.trim();
					if (!name)
						return "Please enter a name";
					if (!getPath(path))
						setPath(path, {});
					var oldValue = getInArray(getPath(path), origName, arrayType, arrayProp);
					if (!oldValue)
						return "Could not rename, try reopening the settings";
					if (getInArray(getPath(path), name, arrayType, arrayProp))
						return "An entry with this name already exists";
					if (arrayType) {
						oldValue[arrayProp] = name;
					}
					else {
						getPath(path)[name] = oldValue;
						delete getPath(path)[origName];
					}
					runCommand("setValue", {
						path: path,
						value: getPath(path)
					});
					selected.value = name;
					selected.textContent = name;
					setting.dispatchEvent(new Event("dub-update"));
				}
			});
		}).bind(this, setting, path, arrayType, arrayProp);

		for (var j = setting.options.length - 1; j >= 0; j--)
			setting.removeChild(setting.options[j]);

		var values = getPath(path);
		if (values) {
			if (arrayType) {
				for (var j = 0; j < values.length; j++) {
					var option = /** @type {HTMLOptionElement} */ (document.createElement(setting.tagName.startsWith("VSCODE") ? "vscode-option" : "option"));
					option.value = values[j][arrayProp];
					option.textContent = values[j][arrayProp];
					setting.appendChild(option);
				}
			}
			else {
				var names = Object.keys(values);
				for (var j = 0; j < names.length; j++) {
					var option = /** @type {HTMLOptionElement} */ (document.createElement(setting.tagName.startsWith("VSCODE") ? "vscode-option" : "option"));
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
