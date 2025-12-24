import * as path from "path";
import * as fs from "fs";
import * as rimraf from "rimraf";

function determineOutputFolder(): string | undefined {
	if (process.platform == "linux") {
		if (!process.env.HOME) return undefined;

		if (fs.existsSync(path.join(process.env.HOME, ".local", "share")))
			return path.join(process.env.HOME, ".local", "share", "code-d");
		else return path.join(process.env.HOME, ".code-d");
	} else if (process.platform == "win32") {
		if (!process.env.APPDATA) return undefined;

		return path.join(process.env.APPDATA, "code-d");
	} else {
		return undefined;
	}
}

const codedFolder = determineOutputFolder();
if (codedFolder) {
	console.log("Deleting code-d binaries folder:", codedFolder);
	rimraf.sync(codedFolder);
}
