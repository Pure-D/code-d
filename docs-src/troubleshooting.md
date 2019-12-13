# Troubleshooting

#menu

## Finding Issues

### Checking for plugin health

First make sure code-d is installed and enabled in the current workspace:

![code-d in the extension tab being enabled and installed](images/extension_installed.png)

Next make sure you have opened some folder in VSCode (this is your workspace) and that you have some D file or dub.json/dub.sdl file. Verify by checking if the serve-d tab in the output panel is there and alive. See chapter [Installation: Verifying Functionality](install.md#verifying-functionality).

### First step to do

If you have changed any configurations or created new projects, etc., a good first step to try to resolve your issues is reloading the window:

![reload command](images/reload.png)

If this didn't fix it, continue on.

### Wrong Syntax Highlighting

Create a minimal reproduction test case and open an issue in this repository with what you see (a screenshot), the code to copy and what you expect should be highlit differently.

### Missing Auto-Completion

**Auto completion completely missing**

If you try to auto complete in a D file and it's completely missing as in only showing words that have been previously typed (indicated by the "abc" icon) and snippets (indicated by rectangles with dotted bottom line):

![missing auto completion](images/missing_auto_complete.png)

Then it might be one of several issues:

- You didn't open VSCode in a folder
- There are problems with your DCD installation
- There are problems with your serve-d installation
- D auto completion is explicitly disabled in user settings

If you are sure it's neither of these, try simply reloading the window to see if it fixes it.

If this doesn't fix your problem, check if your automatically installed DCD installation is working properly: In your user settings there is the DCD Client Path (`d.dcdClientPath`) and DCD Server Path (`d.dcdServerPath`) property. Both point to an executable path which is executed. Try running both executables using the `--version` argument. If one or both don't work properly, manually [download DCD](https://github.com/dlang-community/DCD/releases), extract the executables and update the paths in your user settings. Reload VSCode to apply the changes.

Also check `--version` of the Serve-D path executable (`d.stdlibPath`) to see if this one is working too. You can also obtain precompiled releases for it [here](https://github.com/Pure-D/serve-d/releases).

If both of these are reporting working values, check the log inside the code-d & serve-d output tab. (See section below) If you can't find the issue or have identified it and found it to be reproducible, please [open an issue](https://github.com/Pure-D/code-d/issues/new).

**Missing auto completion of phobos (`std.`, `core.`, `etc.` and built-in methods and types)**

If your symbols inside the current file are all completing properly using proper icons but for example `import std.` doesn't auto-complete and functions also don't show then your phobos import paths (`d.stdlibPath` user setting) are not configured properly.

By default serve-d tries to find the import paths using the dmd configuration if dmd is accessible over the path or some predefined locations in the host system. You can see the full automatic resolution of stdlib paths [here](https://github.com/Pure-D/serve-d/blob/0c6e62865b848f0aa4d1ecf3c214903b8906b74f/source/served/types.d#L136).

You can also see a few default values [in package.json](https://github.com/Pure-D/code-d/blob/aca7e1e9394ba41279394a392cb984852278f105/package.json#L195) which also auto complete if you edit them in your VSCode config.

For specifying the correct directories, all specified directories together should within at least contain the folders `core/`, `etc/`, `std/` and a file called `object.d`. When configured, reload VSCode to make sure all changes are applied.

**Missing auto completion of dub dependencies**

When first opening a project or freshly adding dub dependencies, auto completion for them might be missing.

To fix this, open the "Dub Dependencies" panel in the files view in vscode:

![dub dependencies panel with missing dependency version](images/missing_dependency_version.png)

If you can see a dependency without version number and just a trailing `:` as shown in this screenshot, you know that a dependency is not loaded.

To fix this, simply run your dub project once or run `dub upgrade`. When finished, click the reload button at the right of the dub dependencies panel. When done, it should show the version number and auto completion should automatically work.

![working dub dependencies panel](images/fixed_dependency_version.png)

Note: some dependencies are partially or fully broken for auto completion from the start due to the design of the API or the file layout and its compatibility with DCD. In this case, when the dub dependencies panel looks good, it is not really possible to fix auto completion issues.

**Missing auto completion of local files**

If symbols in the current file are auto completed, but not symbols outside the current file but inside the current project, then you probably have non-matching module names with their file names or a dub configuration not respecting your source folder. Make sure your source folder where the import/module names originate from is a valid relative folder or `"."` and make sure all your modules are named exactly as your file path + file name without the `.d` extension and without the leading `source` folder name.

**Other issues**

Create minimal reproduction steps in a hello world project and [open an issue](https://github.com/Pure-D/code-d/issues/new).

### Language Feature Issues / Crashes

In your user settings first switch the D Serve-D Release Channel (`d.servedReleaseChannel`) to `"nightly"` and **reload the window** to check if your issue isn't already fixed in the current master build. If it still persists, continue with the next paragraph.

If you want to report issues with code-d first verify that it happens with a simple hello world project. Then make sure you have verbose logging enabled in your user settings. Open your User Settings as JSON (from the palette or the left-most button on the top right side of the tabs panel in the user settings GUI) and add the following line to your JSON:

```json
    "serve-d.trace.server": "verbose"
```

VSCode will complain about it being a missing key, but don't worry about this and just insert it anyway:

![verbose config key in vscode config](images/verbose_config_key.png)

When done, **reload the window**, reproduce your problem and immediately copy the output log to keep the log size down. Afterwards [open an issue with the log](https://github.com/Pure-D/code-d/issues/new) pasted into a code block (surrounded by \`\`\`), linked to GitHub Gist or as attachment.

I recommend pasting longer than 50 line logs to [GitHub Gist](https://gist.github.com)

![example output tab](images/verbose_output_tab.png)

Warning: the output tab might contain sensitive information about your code, so do it in a neutral temporary path with a neutral temporary minimal project like the hello world template.

