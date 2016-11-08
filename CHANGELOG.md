# 0.14.2

* File paths from any custom error messages generated using pragma(msg) will get checked through string import paths now to fix file names (for example compiling diet template files will have the correct path now)
* Running a dub build for linting when a diet file is saved

# 0.14.1

* Switched from .editorconfig to vscode user settings for dfmt formatting settings.
* Updating workspace-d when outdated

## Moving to new vscode dfmt settings

![images/github/dfmt_argument_translation.png](images/github/dfmt_argument_translation.png)