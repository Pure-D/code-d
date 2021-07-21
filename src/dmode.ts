import vscode = require("vscode");

export const D_MODE: vscode.DocumentFilter = { language: "d", scheme: "file" };
export const DML_MODE: vscode.DocumentFilter = { language: "dml", scheme: "file" };
export const DSCRIPT_MODE: vscode.DocumentFilter = { language: "dscript", scheme: "file" };
export const SDL_MODE: vscode.DocumentFilter = { language: "sdl", scheme: "file" };
export const DUB_MODE: vscode.DocumentFilter = { pattern: "**/dub.{sdl,json}", scheme: "file" };
export const DSCANNER_INI_MODE: vscode.DocumentFilter = { pattern: "**/dscanner.ini", scheme: "file" };
export const DIET_MODE: vscode.DocumentFilter = { language: "diet", scheme: "file" };
export const PROFILEGC_MODE: vscode.DocumentFilter = { pattern: "**/profilegc.log", scheme: "file" };