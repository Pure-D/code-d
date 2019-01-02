Don't forget to join our discord server [![Join on Discord](https://discordapp.com/api/guilds/242094594181955585/widget.png?style=shield)](https://discord.gg/Bstj9bx)

# 0.20.2

When compiling serve-d from source, don't inline (fixes fatal OSX bug)

# 0.20.1

Upgrade serve-d to 0.4.1, fix installation of serve-d and DCD deleting itself.

# 0.20.0

## Invalid dub configurations and dependencies don't fatally crash serve-d anymore.

You can now just fix your syntax mistakes and save the file again (or maybe twice for good measure) and it will magically just start working again!

Dependency issues also no longer cause issues as they are now loaded and upgraded in-memory if there are any missing, keeping your working directory clean while making sure that everything is working.

## Embedded Documentation View

Don't open your browser to browse phobos and other project documentation anymore.

You can now browse through the online documentation of Phobos and all your dub dependencies using the new embedded documentation browser powered by [dpldocs.info](https://dpldocs.info).

Just open up your command palette and search for `Search dpldocs for Phobos & Dependency documentation` or press `Ctrl-Q Ctrl-Q` by default. You can also map this to a keyboard shortcut to make this even easier to access.

This is a really useful command, try it out!

## Diet templates

vibe.d Diet templates have gotten a lot of love.

New features include:

* Auto-Completion + Calltips of D code inside diet + HTML Tag & Attribute Name & Value completions
* Proper language config (autoclosing quotes)

## New Syntax Highlighting

If you were often frustrated with how random the old syntax highlighting was, it has now been made a lot more consistent and less buggy in general.

Check out a comparision on https://twitter.com/WebFreak001/status/1079446928256053249

## Implement interface improvements

The implement interface code action will no longer insert duplicate code and a lot more tests have been added to ensure correctness.

If you do OOP, try it out by simply extending an interface or abstract class and going on the inherited symbol with your cursor.

## Completion improvements

If you have `d.argumentSnippets` enabled, you will now have a much cleaner experience. Types and default values are no longer passed inside the snippets, so only variable names are put in inside the function arguments.

This makes it much easier to especially write OOP code or code where your variables are often called the same thing as the arguments.

Additionally autocompletion no longer shows duplicates of the same symbols. The documentation and definition of all symbols with same name, kind are merged into one for the autocompletion.

You can revert this back to a slightly modified version using `"d.completeNoDupes": false`, symbols with same name, kind and definition are always merged now however.

## Convert between dub JSON and SDL

You can now convert dub package recipes between JSON/SDL using a click on the convert button in the toolbar or by running the "Convert between dub.json/dub.sdl" command while having the recipe open. You can still undo after conversion if it missed something or you noticed you had comments it removed.

## Other Things

The server now tries to restart more. It now only doesn't restart after 20 restart fails in one minute instead of 5 fails in 3 minutes.

Implemented proper outline view and with that also breadcrumbs. See [#201](https://github.com/Pure-D/code-d/issues/201)

Fixed an SDL parsing issue with comments not consuming line endings. Comments won't affect parsing of the next line anymore.

When opening a file, it will get linted by D-Scanner immediately.

serve-d upgrade to 0.4.0

DCD upgrade to 0.10.1

Coverage and GC decorations (red/green background tint and allocation code lenses) can now be toggled with the new `d.enableCoverageDecoration` and `d.enableGCProfilerDecorations` settings respectively. Coverage will always still show in the statusbar.

Status bar items will now only be shown when a D file is opened. You can revert this to the old behaviour by setting `d.alwaysShowDubStatusButtons` to `true` in your user or workspace settings to bring back dub buttons and you can enable `d.alwaysShowCoverageStatus` to do the same to the coverage status indicator.

The installation of DCD is fixed and reloading after installation is no longer required.

Minor stuff:

* removed long gone dscannerPath and dfmtPath from the settings (as they are integrated into serve-d and have been ignored ever since)

# 0.19.0

* Workspace symbol search now shows all symbols starting with the search query.
* DScanner issues can now be disabled per workspace and per line of code (using `@suppress(all)`, `@suppress(dscanner.xxx)` or `@supress(xxx)` in the same line as the issue, a code fix helps removing it)
* Build tasks replace the old compile buttons in the status bar (Ctrl-Shift-B)

serve-d upgrade to 0.3.0

# 0.18.1

Fixed fsworkspace provider and `d.extraRoots` not working. (serve-d update to 0.2.1)

# 0.18.0

## Update to workspace-d v3!

This release finally includes multi workspace support. You can manually add instances using the new `d.extraRoots` setting and prevent automatic instance detection partially using `d.disabledRootGlobs` or disable it fully using `"d.scanAllFolders": false` to get back to the old behaviour (but still with working multi-root workspaces).

Some bugs may occur and some old ones may have been fixed during this transition. Please report issues to the [code-d github repository](https://github.com/Pure-D/code-d/issues).

Project dependent settings such as the status bar buttons or the dub dependencies are linked to the project containing the file you are currently editing.

Minor things:
* Dependency upgrades (dub to 1.10.0, dfmt to 0.8.2, dscanner to 0.5.7)
* Settings are now properly categorized for multi-workspace projects and some settings can be set in all cases and some only in user settings.
* DCD is now fetched from the official github releases (0.9.9)
* dub.json completion now properly inserts quotes
* some dub startup errors were fixed
* import timing takes into account possible second-run optimizations.
* some requests in code-d were previously decoded wrong, causing silent ignoring of some configuration and parameters. This has been fixed with a single character.

# 0.17.2

Fixed a bug where `d.betaStream` would have recloned serve-d on every startup if the latest commit has been made on a 10th of any month or later or if the last digit of the current compiled serve-d date was less than the commit date.

Upgrade language client to 4.1.3

# 0.17.1

DCD Installation fixes, especially on windows.

# 0.17.0

The switch to serve-d / Microsoft Language Server Protocol!

* Added dub dependencies view in the UI that shows a dependency tree in the currently opened project
* New syntax highlighting using [ysgard/d-struct](https://github.com/ysgard/d-struct) grammar
* automatic module naming: when you rename a file you are currently in or create a new file a module statement will be added/changed
* the English, German and Japanese translations are finally used! Thanks to @SeijiFujita for the Japanese translation
* dfmt and dscanner are now included in serve-d and workspace-d and no longer need to be installed
* Fancy new ddoc renderer when hovering over symbols
* Live DScanner linting: you get errors from dscanner while you type now
* dscanner.ini auto completion of sections, fields & values
* ddoc auto completion: press ctrl-space before a function definition and select the /// or the /** completion option to get a documentation template with arguments and sections
* added sort imports command only sorting the "block" (separated by whitespaces) and not all imports in the file for more user control (but not compatible with the dscanner sortedness linting)
* When autocompleting functions automatically insert the signature as snippet which can be navigated using tab. (configuration d.argumentSnippets)
* Automatically implement classes and interfaces using the new `Implement selected interface/base class` command or by using the code actions
* All imports are annotated with a code lens to show how long they need to import. For this just a dmd call using just the import is called multiple times (up to 500ms per import).
* DCD Compilation is fixed (especially on windows)

Minor changes:
* Installing dependencies uses the dubPath setting now for dub
* dub.json auto completion was broken in an vscode update, should work again now
* Added `d.enableStaticLinting` & `d.enableFormatting`
* Dub installer upgraded to 1.4.0
* Dependent programs are now installed without user confirmation by default
  * Use `"d.aggressiveUpdate": false` to disable this behaviour.
  * On linux files are installed into `~/.local/share/code-d` or as fallback (and also on mac) into `~/.code-d`. On Windows files are installed into `%APPDATA%/code-d`
* Will now install dub before trying to compile dependencies
* If no D compiler is present the browser will be opened on the D download page
* Dedicated output channel in the output tab for error messages & alike
* Current parameter in calltips is more exact now
* Goto definition got more efficient

# 0.16.2

* Fix dub.json/dub.sdl snippets on vscode 1.13.0 and above

# 0.16.1

* Auto-fix broken tool paths when upgrading code-d

# 0.16.0

* Fixed windows dscanner exe path
* Fixed goto definition in unopened files
* Better default stdlibPath values (platform dependent) + snippets for it
* Import fixer will suggest stdlib & works with UFCS
* Bump to workspace-d 2.10.0
	* Primarily makes importer better
	* Finds outdated DCD/Dscanner/dfmt now (warnings/update not yet implemented in code-d)

# 0.15.1

* Fixed installation on macOS

# 0.15.0

* Installer uses the http.proxy settings now
* Better error checks for invalid executables
* "line is longer than" error now starts at the correct column
* Fixed installer with portable/custom git/vscode installation
* Auto fix for suggested imports from compiler
* Dscanner symbol search fix for missing symbols from compiler

# 0.14.2

* File paths from any custom error messages generated using pragma(msg) will get checked through string import paths now to fix file names (for example compiling diet template files will have the correct path now)
* Running a dub build for linting when a diet file is saved

# 0.14.1

* Switched from .editorconfig to vscode user settings for dfmt formatting settings.
* Updating workspace-d when outdated

## Moving to new vscode dfmt settings

![images/github/dfmt_argument_translation.png](images/github/dfmt_argument_translation.png)
