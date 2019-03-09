import * as path from "path"
import * as fs from "fs"
var rimraf = require("rimraf");

function determineOutputFolder(): string | undefined {
	if (process.platform == "linux") {
		if (!(<any>process.env).HOME)
			return undefined;

		if (fs.existsSync(path.join((<any>process.env).HOME, ".local", "share")))
			return path.join((<any>process.env).HOME, ".local", "share", "code-d");
		else
			return path.join((<any>process.env).HOME, ".code-d");
	}
	else if (process.platform == "win32") {
		if (!(<any>process.env).APPDATA)
			return undefined;

		return path.join((<any>process.env).APPDATA, "code-d");
	}
	else {
		return undefined;
	}
}

var codedFolder = determineOutputFolder();
if (codedFolder) {
	console.log("Deleting code-d binaries folder:", codedFolder);
	rimraf.sync(codedFolder);
}
