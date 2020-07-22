import { getLocationInfo, SDLCompletionInfo } from "./sdlinfo"
import { parseSDL, Tag, Value, TagParseError } from "./sdlparse"
import * as path from "path"
import * as vscode from "vscode"
import { listPackages, getPackageInfo, getLatestPackageInfo } from "../dub-api"
import { cmpSemver } from "../installer"

export function addSDLProviders(): vscode.Disposable {
	let subscriptions: vscode.Disposable[] = [];
	let contribution = new SDLContributions();
	subscriptions.push(vscode.languages.registerCompletionItemProvider([{ language: "sdl", pattern: "**/dub.sdl" }], contribution, '"', '`', '='));
	let diagnosticCollection = vscode.languages.createDiagnosticCollection("dub.sdl");
	subscriptions.push(diagnosticCollection);
	let version;
	let writeTimeout: NodeJS.Timer;
	vscode.workspace.onDidChangeTextDocument(event => {
		let document = event.document;
		if (path.basename(document.fileName) != "dub.sdl")
			return;
		clearTimeout(writeTimeout);
		writeTimeout = setTimeout(function () {
			if (vscode.workspace.getConfiguration("d").get("enableSDLLinting", true)) {
				diagnosticCollection.clear();
				diagnosticCollection.set(document.uri, contribution.provideDiagnostics(document));
			}
		}, 50);
	}, null, subscriptions);
	return vscode.Disposable.from(...subscriptions);
}

function pad3(n: number) {
	if (n >= 100)
		return n.toString();
	if (n >= 10)
		return "0" + n.toString();
	return "00" + n.toString();
}

function completeDubVersion(info: SDLCompletionInfo): SDLCompletionResult {
	if (!info.currentSDLObject.values || info.currentSDLObject.values.length != 1)
		return [];
	var packageName = info.currentSDLObject.values[0].value;
	return new Promise((resolve) => {
		getPackageInfo(packageName).then(json => {
			var versions = json.versions;
			if (!versions || !versions.length) {
				return resolve([]);
			}
			let results: vscode.CompletionItem[] = [];
			for (let i = versions.length - 1; i >= 0; i--) {
				let item = new vscode.CompletionItem(versions[i].version);
				item.detail = "Released on " + new Date(versions[i].date).toLocaleDateString();
				item.kind = vscode.CompletionItemKind.Class;
				item.insertText = new vscode.SnippetString().appendPlaceholder("").appendText(versions[i].version);
				results.push(item);
			}
			results.sort((a, b) => cmpSemver(b.label, a.label));
			for (let i = 0; i < results.length; i++)
				results[i].sortText = (10000000 + i).toString(); // lazy 0 pad
			resolve(results);
		}, error => {
			console.log("Error searching for versions");
			console.log(error);
			resolve([]);
		});
	});
}

function completeDubPackageName(info: SDLCompletionInfo): SDLCompletionResult {
	return new Promise((resolve) => {
		var colonIdx = info.partial.indexOf(":");
		if (colonIdx != -1) {
			var pkgName = info.partial.substr(0, colonIdx);
			getLatestPackageInfo(pkgName).then(info => {
				var results: vscode.CompletionItem[] = [];
				if (info.subPackages)
					info.subPackages.forEach(subPkgName => {
						var item = new vscode.CompletionItem(pkgName + ":" + subPkgName);
						var insertText = subPkgName;
						item.insertText = new vscode.SnippetString().appendText(insertText);
						item.kind = vscode.CompletionItemKind.Property;
						item.documentation = info.description;
						results.push(item);
					});
				resolve(results);
			}, err => {
				console.log("Error searching for packages");
				console.log(err);
				resolve([]);
			});
		}
		else {
			listPackages().then(json => {
				var results: vscode.CompletionItem[] = [];
				json.forEach(element => {
					var item = new vscode.CompletionItem(element);
					item.kind = vscode.CompletionItemKind.Property;
					var insertText = element;
					item.insertText = new vscode.SnippetString().appendText(insertText);
					results.push(item);
				});
				resolve(results);
			}, err => {
				console.log("Error searching for packages");
				console.log(err);
				resolve([]);
			});
		}
	});
}

const platforms = [
	"windows",
	"linux",
	"posix",
	"osx",
	"freebsd",
	"openbsd",
	"netbsd",
	"dragonflybsd",
	"bsd",
	"solaris",
	"aix",
	"haiku",
	"skyos",
	"sysv3",
	"sysv4",
	"hurd",
	"android",
	"cygwin",
	"mingw",
	"wasm",
];
const platformComplete = platforms.map(a => new vscode.CompletionItem(a, vscode.CompletionItemKind.Property));

const architectures = [
	"x86",
	"x86_64",
	"arm",
	"aarch64",
	"arm_thumb",
	"arm_softfloat",
	"arm_hardfloat",
	"ppc",
	"ppc_softfp",
	"ppc_hardfp",
	"ppc64",
	"ia64",
	"mips",
	"mips32",
	"mips64",
	"mips_o32",
	"mips_n32",
	"mips_o64",
	"mips_n64",
	"mips_eabi",
	"mips_nofloat",
	"mips_softfloat",
	"mips_hardfloat",
	"sparc",
	"sparc_v8plus",
	"sparc_softfp",
	"sparc_hardfp",
	"sparc64",
	"s390",
	"s390x",
	"hppa",
	"hppa64",
	"sh",
	"sh64",
	"alpha",
	"alpha_softfp",
	"alpha_hardfp"
];
const architectureComplete = architectures.map(a => new vscode.CompletionItem(a, vscode.CompletionItemKind.EnumMember));

const compilers = ["dmd", "gdc", "ldc", "sdc"];
const compilerComplete = compilers.map(a => new vscode.CompletionItem(a, vscode.CompletionItemKind.Method));

function platformPatternCompleter(info: SDLCompletionInfo): SDLCompletionResult {
	// os-architecture-compiler
	let part = info.partial.trim();
	let parts = part.split(/-/g);

	if (parts.length > 0) {
		// insert os into architecture or architecture-compiler
		if (architectures.indexOf(parts[0]) != -1)
			parts.unshift("");

		// insert os-architecture into compiler
		if (compilers.indexOf(parts[0]) != -1)
			parts.unshift("", "");

		// insert architecture into os-compiler
		if (compilers.indexOf(parts[1]) != -1)
			parts.splice(1, 0, "");
	}

	let result: vscode.CompletionItem[] = [];
	if (parts.length == 0 || parts.length == 1) {
		result.push.apply(result, platformComplete);
		result.push.apply(result, architectureComplete);
		result.push.apply(result, compilerComplete);
	} else if (parts.length == 2) {
		result.push.apply(result, architectureComplete);
		result.push.apply(result, compilerComplete);
	} else if (parts.length == 3) {
		result = compilerComplete;
	} else {
		result = [];
	}
	return result;
}

const platformPattern: CompletionPattern = {
	complete: platformPatternCompleter
};

const platformAttribute: CompletionAttribute = {
	description: "Platform specifier to limit this tag or block to a given host platform. Platform attributes contain dash separated list of operating system/architecture/compiler identifiers, as defined in the D language reference, but converted to lower case. The order of these suffixes is os-architecture-compiler, where any of these parts can be left off.",
	values: {
		type: "string",
		pattern: platformPattern
	}
};

const platformAttributes: CompletionAttributeMap = {
	platform: platformAttribute
};

const licenses = [
	"public domain",
	"proprietary",
	"AFL-3.0",
	"AGPL-3.0",
	"Apache-2.0",
	"APSL-2.0",
	"Artistic-2.0",
	"BSL-1.0",
	"BSD 2-clause",
	"BSD 3-clause",
	"EPL-1.0",
	"GPL-2.0",
	"GPL-3.0",
	"ISC",
	"LGPL-2.1",
	"LGPL-3.0",
	"MIT",
	"MPL-2.0",
	"MS-PL",
	"MS-RL",
	"NCSA",
	"OpenSSL",
	"SSLeay",
	"Zlib"
];

interface CompletionTag {
	description: string;
	values?: CompletionValues;
	attributes?: CompletionAttributeMap;
	minValues?: number;
	maxValues?: number;
	tags?: CompletionTagMap | null;
	requireTags?: boolean;
	namespace?: string;
	namespaces?: string[];
}

interface CompletionValues {
	type: "string" | "boolean" | "value" | "block";
	pattern?: CompletionPattern | RegExp;
	enum?: string[];
	enumOptional?: boolean;
}

interface CompletionAttribute {
	description: string;
	values: CompletionValues;
}

interface CompletionPattern {
	complete?: SDLCompletionCallback;
	validate?: SDLValidationCallback;
	exec?: SDLValidateExecCallback;
}

type CompletionTagMap = { [index: string]: CompletionTag };
type OptionalCompletionTagMap = { [index: string]: CompletionTag | undefined };
type CompletionAttributeMap = { [index: string]: CompletionAttribute };

type SDLCompletionResult = Thenable<(vscode.CompletionItem | string)[]> | (vscode.CompletionItem | string)[];
type SDLCompletionCallback = (info: SDLCompletionInfo) => SDLCompletionResult;
type SDLValidationCallback = (value: Value) => string | undefined;
type SDLValidateExecCallback = (value: Value) => boolean;

const packageName: CompletionTag = {
	description: 'Name of the package, used to uniquely identify the package. Must be comprised of only lower case ASCII alpha-numeric characters, "-" or "_".',
	values: {
		type: "string",
		pattern: /^[-a-z0-9_]+$/
	},
	minValues: 1,
	maxValues: 1
};
const buildSettings: CompletionTagMap = {
	dependency: {
		description: "Adds a single dependency of the given name, attributes are used to configure the version/path to use - see next section for how version specifications look like. Use multiple dependency directives to add more than one dependency.",
		values: {
			type: "string",
			pattern: {
				complete: completeDubPackageName
			}
		},
		attributes: {
			version: {
				description: "The version specification as used for the simple form",
				values: {
					type: "string",
					pattern: {
						complete: completeDubVersion
					}
				}
			},
			path: {
				description: "Use a folder to source a package from",
				values: {
					type: "string"
				}
			},
			optional: {
				description: "Indicates an optional dependency",
				values: {
					type: "boolean"
				}
			},
			default: {
				description: "Choose an optional dependency by default",
				values: {
					type: "boolean"
				}
			}
		},
		minValues: 1,
		maxValues: 1
	},
	systemDependencies: {
		description: "A textual description of the required system dependencies (external C libraries) required by the package. This will be visible on the registry and will be displayed in case of linker errors.",
		values: {
			type: "string"
		},
		minValues: 1,
		maxValues: 1
	},
	targetType: {
		description: "Specifies a specific target type - this setting does not support the platform attribute",
		values: {
			type: "string",
			enum: [
				"autodetect",
				"none",
				"executable",
				"library",
				"sourceLibrary",
				"staticLibrary",
				"dynamicLibrary"
			]
		},
		minValues: 1,
		maxValues: 1
	},
	targetName: {
		description: "Sets the base name of the output file; type and platform specific pre- and suffixes are added automatically - this setting does not support the platform attribute",
		values: {
			type: "string"
		},
		minValues: 1,
		maxValues: 1
	},
	targetPath: {
		description: "The destination path of the output binary - this setting does not support the platform attribute",
		values: {
			type: "string"
		},
		minValues: 1,
		maxValues: 1
	},
	workingDirectory: {
		description: "A fixed working directory from which the generated executable will be run - this setting does not support the platform attribute",
		values: {
			type: "string"
		},
		minValues: 1,
		maxValues: 1
	},
	subConfiguration: {
		description: "Locks a dependency (first argument) to a specific configuration (second argument); see also the configurations section - this setting does not support the platform attribute",
		values: {
			type: "string"
		},
		minValues: 2,
		maxValues: 2
	},
	buildRequirements: {
		description: "List of required settings for the build process. See the build requirements section for details.",
		values: {
			type: "string",
			enum: [
				"allowWarnings",
				"silenceWarnings",
				"disallowDeprecations",
				"silenceDeprecations",
				"disallowInlining",
				"disallowOptimization",
				"requireBoundsCheck",
				"requireContracts",
				"relaxProperties",
				"noDefaultFlags"
			]
		},
		attributes: platformAttributes,
		minValues: 1
	},
	buildOptions: {
		description: "List of build option identifiers (corresponding to compiler flags) - see the build options section for details.",
		values: {
			type: "string",
			enum: [
				"debugMode",
				"releaseMode",
				"coverage",
				"debugInfo",
				"debugInfoC",
				"alwaysStackFrame",
				"stackStomping",
				"inline",
				"noBoundsCheck",
				"optimize",
				"profile",
				"profileGC",
				"unittests",
				"verbose",
				"ignoreUnknownPragmas",
				"syntaxOnly",
				"warnings",
				"warningsAsErrors",
				"ignoreDeprecations",
				"deprecationWarnings",
				"deprecationErrors",
				"property",
				"betterC"
			]
		},
		attributes: platformAttributes,
		minValues: 1
	},
	libs: {
		description: 'A list of external library names - depending on the compiler, these will be converted to the proper linker flag (e.g. "ssl" might get translated to "-L-lssl")',
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	sourceFiles: {
		description: "Additional files passed to the compiler - can be useful to add certain configuration dependent source files that are not contained in the general source folder",
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	sourcePaths: {
		description: `Allows to customize the path where to look for source files (any folder "source" or "src" is automatically used as a source path if no sourcePaths setting is specified) - note that you usually also need to define "importPaths" as "sourcePaths" don't influence those`,
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	excludedSourceFiles: {
		description: 'Files that should be removed for the set of already added source files (takes precedence over "sourceFiles" and "sourcePaths") - Glob matching can be used to pattern match multiple files at once',
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	mainSourceFile: {
		description: 'Determines the file that contains the main() function. This setting can be used by dub to exclude this file in situations where a different main function is defined (e.g. for "dub test") - this setting does not support platform suffixes',
		values: {
			type: "string"
		},
		minValues: 1,
		maxValues: 1
	},
	copyFiles: {
		description: 'A list of globs matching files or directories to be copied to targetPath. Matching directories are copied recursively, i.e. "copyFiles": ["path/to/dir"]" recursively copies dir, while "copyFiles": ["path/to/dir/*"]" only copies files within dir.',
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	versions: {
		description: "A list of D versions to be defined during compilation",
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	debugVersions: {
		description: "A list of D debug identifiers to be defined during compilation",
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	importPaths: {
		description: "Additional import paths to search for D modules (the source/ folder is used by default as a source folder, if it exists)",
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	stringImportPaths: {
		description: "Additional import paths to search for string imports/views (the views/ folder is used by default as a string import folder, if it exists)",
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	preGenerateCommands: {
		description: "A list of shell commands that is executed before project generation is started",
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	postGenerateCommands: {
		description: "A list of shell commands that is executed after project generation is finished",
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	preBuildCommands: {
		description: "A list of shell commands that is executed always before the project is built",
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	postBuildCommands: {
		description: "A list of shell commands that is executed always after the project is built",
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	dflags: {
		description: "Additional flags passed to the D compiler - note that these flags are usually specific to the compiler in use, but a set of flags is automatically translated from DMD to the selected compiler",
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	},
	lflags: {
		description: "Additional flags passed to the linker - note that these flags are usually specific to the linker in use",
		values: {
			type: "string"
		},
		attributes: platformAttributes,
		minValues: 1
	}
};

function merge(a: OptionalCompletionTagMap, b: OptionalCompletionTagMap): CompletionTagMap {
	var obj: any = {};
	Object.keys(a).forEach(k => obj[k] = a[k]);
	Object.keys(b).forEach(k => obj[k] = b[k]);
	return obj;
}

let dubSchema = {
	title: "dub Package Schema",
	description: "dub package file",
	tags: merge(buildSettings, {
		name: packageName,
		description: {
			description: "Brief description of the package",
			values: {
				type: "string"
			},
			minValues: 1,
			maxValues: 1
		},
		toolchainRequirements: {
			description: "Set of version requirements for DUB, for compilers and for language frontend.",
			attributes: {
				dub: {
					description: "DUB version requirement",
					values: {
						type: "string"
					}
				},
				frontend: {
					description: "D frontend version requirement",
					values: {
						type: "string"
					}
				},
				dmd: {
					description: "DMD version requirement",
					values: {
						type: "string",
						enum: ["no"],
						enumOptional: true
					}
				},
				ldc: {
					description: "LDC version requirement",
					values: {
						type: "string",
						enum: ["no"],
						enumOptional: true
					}
				},
				gdc: {
					description: "GDC version requirement",
					values: {
						type: "string",
						enum: ["no"],
						enumOptional: true
					}
				}
			}
		},
		homepage: {
			description: "URL of the project website",
			values: {
				type: "string"
			},
			minValues: 1,
			maxValues: 1
		},
		authors: {
			description: 'List of project authors (the suggested format is either "Peter Parker" or "Peter Parker <pparker@example.com>")',
			values: {
				type: "string"
			},
			minValues: 1
		},
		copyright: {
			description: "Copyright declaration string",
			values: {
				type: "string"
			},
			minValues: 1,
			maxValues: 1
		},
		license: {
			description: "License(s) under which the project can be used",
			values: {
				type: "string",
				pattern: {
					validate: function (value) {
						if (value.value.trim().length == 0)
							return "This value must be set";
						return undefined;
					},
					complete: function (info) {
						var words = info.partial.trim().split(" ");
						if (words.length == 0)
							return licenses;
						if (info.partial[info.partial.length - 1] != " ")
							return licenses;
						if (words[words.length - 1] == "or")
							return ["later", ...licenses];
						else
							return ["or"];
					}
				}
			},
			minValues: 1,
			maxValues: 1
		},
		subPackage: {
			description: "Defines a sub-package using either a path to a sub directory, or in-place",
			values: {
				type: "string"
			},
			tags: null
		},
		configuration: {
			description: "Speficies a build configuration (chosen on the command line using --config=...)",
			values: {
				type: "string"
			},
			tags: merge(buildSettings, {
				platforms: {
					description: "A list of platform specifiers to limit on which platforms the configuration applies",
					values: {
						type: "string"
					}
				}
			}),
			minValues: 1,
			maxValues: 1,
			requireTags: true
		},
		buildType: {
			description: "Defines an additional custom build type or overrides one of the default ones (chosen on the command line using --build=...)",
			values: {
				type: "string"
			},
			tags: merge(buildSettings, {
				dependency: undefined,
				targetType: undefined,
				targetName: undefined,
				targetPath: undefined,
				workingDirectory: undefined,
				subConfiguration: undefined
			}),
			minValues: 1,
			maxValues: 1,
			requireTags: true
		},
		ddoxFilterArgs: {
			description: "Specifies a list of command line flags usable for controlling filter behavior for --build=ddox [experimental]",
			values: {
				type: "string"
			},
			namespace: "x",
			minValues: 1
		}
	}),
	namespaces: ["x"],
	required: ["name"]
};
dubSchema.tags.subPackage.tags = dubSchema.tags;

export class SDLContributions implements vscode.CompletionItemProvider {
	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Thenable<vscode.CompletionItem[]> {
		console.log("Completion:");
		try {
			var info = getLocationInfo(document, position);
			console.log(info);
			if (info.namespace[0] != "")
				return <any>Promise.reject("Invalid namespace in info object");
			if (info.name[0] != "")
				return <any>Promise.reject("Invalid name in info object");
			if (info.namespace.length != info.name.length)
				return <any>Promise.reject("Invalid info object (length mismatch)");
			if (info.namespace.length <= 0)
				return <any>Promise.reject("Invalid info object (no entry)");
			let obj: CompletionTag = dubSchema;
			let len = info.name.length - 1;
			var found = true;
			for (var i = 1; i < len; i++) {
				found = false;
				let name = info.name[i];
				let namespace = info.namespace[i];
				if (obj.tags![name] && (obj.tags![name].namespace || "") == namespace) {
					obj = obj.tags![name];
					found = true;
					continue;
				}
			}
			if (!found) {
				console.log("None found");
				return Promise.resolve([]);
			}
			let completions: vscode.CompletionItem[] = [];
			if (info.type == "block") {
				if (obj.tags)
					Object.keys(obj.tags).forEach(key => {
						let item = new vscode.CompletionItem(key);
						item.documentation = obj.tags![key].description;
						item.kind = vscode.CompletionItemKind.Field;
						if (obj.tags![key].namespace)
							item.insertText = new vscode.SnippetString().appendText(obj.tags![key].namespace + ":" + key);
						else
							item.insertText = new vscode.SnippetString().appendText(key);
						completions.push(item);
					});
			}
			else if (info.type == "value") {
				if (obj.attributes && info.name[info.name.length - 1] != "") {
					obj = obj.attributes[info.name[info.name.length - 1]];
				}
				// single value
				if (obj && obj.values) {
					if (obj.values.pattern) {
						if ((<any>obj.values.pattern).complete) {
							return Promise.resolve((<any>obj.values!.pattern!).complete(info)).then((values) => {
								values.forEach((value: any) => {
									if (typeof value == "object" && value instanceof vscode.CompletionItem)
										completions.push(value);
									else {
										let item = new vscode.CompletionItem(value);
										item.detail = obj.values!.type;
										item.kind = vscode.CompletionItemKind.Value;
										item.insertText = new vscode.SnippetString().appendText(value);
										completions.push(item);
									}
								});
								return completions;
							});
						}
					}
					else if (obj.values.enum) {
						obj.values.enum.forEach((value: any) => {
							let item = new vscode.CompletionItem(value);
							item.detail = obj.values!.type;
							item.kind = vscode.CompletionItemKind.Value;
							item.insertText = new vscode.SnippetString().appendText(value);
							completions.push(item);
						});
					}
					else if (obj.values.type == "boolean") {
						let item = new vscode.CompletionItem("true");
						item.detail = obj.values.type;
						item.kind = vscode.CompletionItemKind.Keyword;
						completions.push(item);
						item = new vscode.CompletionItem("false");
						item.detail = obj.values.type;
						item.kind = vscode.CompletionItemKind.Keyword;
						completions.push(item);
					}
				}
			}
			else if (info.type == "attribute") {
				// attribute name
				if (obj.attributes) {
					Object.keys(obj.attributes).forEach(attribute => {
						let item = new vscode.CompletionItem(attribute);
						item.documentation = obj.attributes![attribute].description;
						item.kind = vscode.CompletionItemKind.Variable;
						var insertText = new vscode.SnippetString().appendText(attribute + "=");
						if (obj.attributes![attribute].values) {
							item.detail = obj.attributes![attribute].values.type;
							if (item.detail == "string")
								insertText.appendText('"').appendPlaceholder("").appendText('"');
						}
						item.insertText = insertText;
						completions.push(item);
					});
				}
			}
			return Promise.resolve(completions);
		}
		catch (e) {
			return <any>Promise.reject(e);
		}
	}

	resolveCompletionItem(item: vscode.CompletionItem, token: vscode.CancellationToken): Thenable<vscode.CompletionItem | null> {
		if (item.kind === vscode.CompletionItemKind.Property) {
			let pack = item.label
			return getLatestPackageInfo(pack).then(info => {
				if (info.description) {
					item.documentation = info.description;
				}
				if (info.version) {
					item.detail = info.version;
				}
				return item;
			}, err => {
				return null;
			});
		}
		return Promise.resolve(null);
	}

	provideDiagnostics(document: vscode.TextDocument): vscode.Diagnostic[] {
		var root = parseSDL(document.getText());
		let errors: vscode.Diagnostic[] = [];
		function range(r: [number, number]) {
			if (!r)
				return new vscode.Range(0, 0, 0, 0);
			return new vscode.Range(document.positionAt(r[0]), document.positionAt(r[1]));
		}
		if (root.errors)
			root.errors.forEach((error: TagParseError) => {
				errors.push(new vscode.Diagnostic(range(error.range), error.message, error.type == "error" ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning));
			});
		function checkValue(value: Value, obj: CompletionValues) {
			if (value.type != obj.type)
				errors.push(new vscode.Diagnostic(range(value.range), "Type mismatch. Expected type: " + obj.type, vscode.DiagnosticSeverity.Error));
			if (obj.pattern) {
				if (typeof (<any>obj.pattern).validate == "function") {
					var msg = (<any>obj.pattern).validate(value);
					if (msg)
						errors.push(new vscode.Diagnostic(range(value.range), msg, vscode.DiagnosticSeverity.Error));
				}
				else if (typeof obj.pattern.exec == "function")
					if (!obj.pattern.exec(value.value))
						errors.push(new vscode.Diagnostic(range(value.range), "This value does not match the pattern", vscode.DiagnosticSeverity.Warning));
			} else if (obj.enum) {
				if (obj.enum.indexOf(value.value) == -1 && !obj.enumOptional)
					errors.push(new vscode.Diagnostic(range(value.range), "This is not a valid value", vscode.DiagnosticSeverity.Error));
			}
		}
		function scanTag(tag: Tag, obj: CompletionTag, nsName = "") {
			if (obj.tags) {
				var hasTags = false;
				Object.keys(tag.tags).forEach(tagName => {
					hasTags = true;
					if (obj.tags![tagName])
						tag.tags[tagName].forEach(childTag => {
							if (obj.tags![tagName].namespace && obj.tags![tagName].namespace != nsName && tag.range)
								errors.push(new vscode.Diagnostic(range(tag.range), "Invalid namespace", vscode.DiagnosticSeverity.Error));
							scanTag(childTag, obj.tags![tagName]);
						});
				});
				if (obj.requireTags && !hasTags && tag.range)
					errors.push(new vscode.Diagnostic(range(tag.range), "This node must have children", vscode.DiagnosticSeverity.Error));
			}
			if (obj.namespaces)
				Object.keys(tag.namespaces).forEach(nsName => {
					if (obj.namespaces!.indexOf(nsName) != -1)
						scanTag(tag.namespaces[nsName], obj, nsName);
				});
			if (obj.values) {
				tag.values.forEach(value => {
					checkValue(value, obj.values!);
				});
				if (typeof obj.minValues == "number")
					if (tag.values.length < obj.minValues && tag.range)
						errors.push(new vscode.Diagnostic(range(tag.range), "Not enough values. Requires at least " + obj.minValues, vscode.DiagnosticSeverity.Error));
				if (typeof obj.maxValues == "number")
					if (tag.values.length > obj.maxValues && tag.range)
						errors.push(new vscode.Diagnostic(range(tag.range), "Too many values. Allows at most " + obj.maxValues, vscode.DiagnosticSeverity.Error));
			}
			if (obj.attributes)
				Object.keys(tag.attributes).forEach(attributeName => {
					if (obj.attributes![attributeName])
						tag.attributes[attributeName].forEach(attribute => {
							checkValue(attribute, obj.attributes![attributeName].values);
						});
				});
		}
		scanTag(root, dubSchema);
		return errors;
	}
}
