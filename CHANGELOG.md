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