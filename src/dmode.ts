import { DocumentFilter } from "vscode";

export const D_MODE: DocumentFilter = { language: "d", scheme: "file" };
export const DML_MODE: DocumentFilter = { language: "dml", scheme: "file" };
export const DSCRIPT_MODE: DocumentFilter = { language: "dscript", scheme: "file" };
export const SDL_MODE: DocumentFilter = { language: "sdl", scheme: "file" };
export const DUB_MODE: DocumentFilter = { pattern: "**/dub.{sdl,json}", scheme: "file" };
export const DSCANNER_INI_MODE: DocumentFilter = { pattern: "**/dscanner.ini", scheme: "file" };
export const DIET_MODE: DocumentFilter = { language: "diet", scheme: "file" };
export const PROFILEGC_MODE: DocumentFilter = { pattern: "**/profilegc.log", scheme: "file" };