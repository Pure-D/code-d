# 0.17.x

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