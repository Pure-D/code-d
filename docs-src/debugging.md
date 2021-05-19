# Tutorial

#menu

## Debugging

code-d itself does not provide any debugging capabilities. At least one of the listed extensions needs to be installed from the marketplace.

However code-d does provide build tasks which can be used before debugging so the debug action also rebuilds the project as well as debug configuration wrappers for quick setup and pretty printing.

There exist multiple extension options for debugging. Installing all of them is possible to make code-d choose the best available, but may increase startup time of VSCode.

### C/C++ extension by Microsoft: (ms-vscode.cpptools)

![C/C++](images/ext_cpp.png)

* Good issue support

* Regularly updated

* Debugging using GDB, LLDB and the Visual Studio Debugger

* Supports lightweight natvis for GDB/LLDB

* Includes full Visual Studio Debugger with full natvis support

* Can show more variables/scope

### Native Debug extension by WebFreak: (webfreak.code-debug)

![native debug](images/ext_native_debug.png)

* Debugging using GDB, LLDB or mago-mi

* Some better remote debugging support

### CodeLLDB extension by vadimcn: (vadimcn.vscode-lldb)

![CodeLLDB](images/ext_code_lldb.png)

* Debugging using LLDB only

* Better visualization support

* Communicates faster with debugger, may give debugging performance improvements

* Can show more variables/scope

---------

## Creating a debugging configuration

### Introduction to debugging

To start off debugging your project, switch to the "Run and Debug" panel in the sidebar. (Ctrl-Shift-D)

If you start off fresh in a new project without an existing debug configuration, use the [create a launch.json file](command:workbench.action.debug.configure) button and select D or DUB from the list:

![click create a launch.json file](images/debug_fresh.png)

![select a launch configuration preset](images/debug_fresh2.png)

Alternatively if you already have a debug configuration, open `.vscode/launch.json` or click the cog in the debug panel to open it:

![open launch.json by clicking the cog in the run and debug panel](images/debug_existing.png)

From here, edit the launch.json and use auto-complete to read about documentation for fields and what you can insert.

See the [Visual Studio Code documentation](https://code.visualstudio.com/docs/editor/debugging) for more information.

### Using code-d

code-d ships with debug wrappers, which automatically loads the best installed recommended debug extension for the current system. To start out using code-d, start with the following debug configuration:

```js
// DUB
{
	"type": "code-d",
	"request": "launch",
	"name": "Debug D project",
	"cwd": "${command:dubWorkingDirectory}",
	"program": "${command:dubTarget}"
}
```

```js
// Other D enabled debugging
{
	"type": "code-d",
	"request": "launch",
	"name": "Debug D project",
	"cwd": "${workspaceFolder}",
	"program": "./executableBinaryName"
}
```

The following custom variables are available for the launch configuration:

* `${command:dubPackageName}` - the name of the currently active DUB package
* `${command:dubPackagePath}` - the absolute path to the currently active DUB package
* `${command:dubWorkingDirectory}` - the absolute path to the configured working directory of the currently active DUB package
* `${command:dubTarget}` - the absolute path to the currently active DUB package binary destination
* `${command:dubTargetPath}` - the absolute path to the currently active DUB package binary folder
* `${command:dubTargetName}` - the name of the target executable including platform suffix for the currently active DUB package

The "currently active DUB package" in the variables above means the DUB package associated with the last D file that was or is being edited. In case of projects with a single DUB configuration this will always be the project itself. In case of multiple opened folders or a folder with multiple dub.json/dub.sdl files, it will be the project associated with the last active D file loaded.

If any D files for dependencies were opened before, they will not be considered as active DUB projects unless the dependency folders themselves are also opened within vscode.

The following JSON fields can be configured with the `code-d` debug type:

#### `"cwd"`

Absolute path to the program cwd.

For an automatic path using the currently active DUB project use `${command:dubWorkingDirectory}`

For the current vscode workspace path use `${workspaceFolder}`

#### `"program"`

Absolute or relative path to the program to run.

For an automatic path using the currently active DUB project use `${command:dubTarget}`

For a path relative to the chosen `cwd` use `./programName`

For a path relative to the current vscode workspace path use `${workspaceFolder}/programName`

#### `"args"`

Command line arguments to pass to the program. Can be a string which is passed as-is to Native Debug or parsed for C++. Can also be an array which is concatenated using the platform variable or current executing platform on Native Debug or passed as-is for C++. Using a string for this on Native Debug means you can use pipes and such as they are handled by GDB.

#### `"config"`

Debug configuration members to overwrite launch settings.

All fields in this object will override the automatically generated fields in the resulting generated debug configuration.

#### `"dubBuild"`

Boolean to build the active dub project before launching if `true`. Makes most sense with `${command:dubTarget}` program value.

For more control or other building tasks than simply running DUB, use VSCode's `preLaunchTask` field.

#### `"platform"`

Optional string to override the native nodejs process.platform. Changes how the debugger is invoked like how arguments are escaped, etc.

#### `"debugger"`

Changes which debugger engine / backend to use from the installed debuggers.

### Manually

You can create debug configurations manually using the installed debug extensions, however this will not load the D specific debugging extensions. The debugger comparison below contains the settings JSON to use them.

See the [Visual Studio Code documentation](https://code.visualstudio.com/docs/editor/debugging) for more information.

## Building before every debug run

### DUB

For the most simple DUB projects use `"dubBuild": true` in your `code-d` type debug configuration. Otherwise follow the guide below.

### Manually

First you will need to add a label to your [task definition](building.md#custom-build-tasks):

```js
{
	"label": "dub build default", // <-- add a good name here
	"type": "dub",
	"run": false,
	"problemMatcher": [
		"$dmd"
	],
	"group": "build"
}
```

Now in your debugging configuration, add a `"preLaunchTask"` with your given label:

```js
{
	"version": "0.2.0",
	"configurations": [
		{
			...,
			"preLaunchTask": "dub build"
		}
	]
}
```

When you now hit debug, it will automatically build your application before building. When no sources are changed this is done very quickly.

You can now also debug using the button in the status bar:

![status bar button](images/debug_status_bar.png)

## Choosing a debugger (Manual Configuration)

### Recommendation Summary

* **Windows**: VS debugger or GDB through C/C++ (ms-vscode.cpptools)

* **Linux**: GDB or LLDB from usual distribution sources

  depending on the debugger install C/C++ (ms-vscode.cpptools) or CodeLLDB (vadimcn.vscode-lldb)

* **Mac**: install CodeLLDB (vadimcn.vscode-lldb)

---

### Windows

* **Visual Studio Debugger** (recommended)

  This will use the debugger bundled with Visual Studio, which works well for D. This is a great option if you want a zero-hassle configuration that quickly is going to work.

  In order to use this debugger type, you will need to **install Visual Studio** with C/C++ (native Desktop) support, which might not be an option for everybody.

  Manual Extension configuration:

  * `"type": "cppvsdbg"` (C/C++ extension)

* **GDB**

  In order to use GDB on Windows, you will need to install Cygwin or MinGW, which might be difficult for your environment and is not the easiest way to setup.

  You will need to install GDB to be accessible from `PATH` or manually configure the path to your executable in the debugger configuration. (Depending on the extension `miDebuggerPath` or `gdbpath`)

  GDB versions 9.1 and above add support for D which includes demangling of function names, so having an up-to-date installation is recommended.

  Manual Extension configuration:

  * `"type": "cppdbg", "MIMode": "gdb"` (C/C++ extension)

  * `"type": "gdb"` (Native Debug extension)

* **Mago**

  Mago is a debugging engine designed especially for debugging D code. When not having Visual Studio installed this might be a great alternative to use.

  In order to use Mago you will need to install `mago-mi`, which is obtainable from https://github.com/rainers/mago/releases (or [direct mago-mi.exe download link](https://ci.appveyor.com/api/projects/rainers/mago/artifacts/mago-mi.exe?job=Environment%3A%20os%3DVisual%20Studio%202013%2C%20VS%3D14%2C%20APPVEYOR_BUILD_WORKER_IMAGE%3DVisual%20Studio%202015))

  If you don't want to globally install mago-mi, (added to `PATH`) you can specify the path to it using `magomipath`

  Manual Extension configuration:

  * `"type": "mago-mi"` (Native Debug extension)

Official documentation for the C/C++ extension: https://code.visualstudio.com/docs/cpp/cpp-debug

---

### Linux

* **LLDB** (recommended)

  LLDB is a relatively new debugger which will work especially well when your program is compiled with LDC and functions a little bit differently compared to GDB. Refer to your distribution's documentation to learn how to install LLDB. Using CodeLLDB on Windows automatically installs LLDB.

  Manual Extension configuration:

  * `"type": "lldb"` (CodeLLDB)

  * `"type": "cppdbg", "MIMode": "lldb"` (C/C++ extension)

  * `"type": "lldb-mi"` (Native Debug extension)

* **GDB**

  GDB is a very reliable debugger on linux and should just work out of the box with D. Refer to your distribution's documentation to learn how to install GDB.

  GDB versions 9.1 and above add support for D which includes demangling of function names, so having an up-to-date installation is recommended.

  Manual Extension configuration:

  * `"type": "cppdbg", "MIMode": "gdb"` (C/C++ extension)

  * `"type": "gdb"` (Native Debug extension)

To attach to programs without needing to enter the super user password it's possible to run
```
echo 0 | sudo tee /proc/sys/kernel/yama/ptrace_scope
```
This can also solve permission denied error whenever using an attach configuration.

See https://linux-audit.com/protect-ptrace-processes-kernel-yama-ptrace_scope/

---

### Mac

* **LLDB** (recommended)

  LLDB is the recommended debugger on Mac. It comes **installed with Xcode**.

  Manual Extension configuration:

  * `"type": "lldb"` (CodeLLDB)

  The C/C++ extension and Native Debug extensions requires an additional step to be fully usable:

  ```
  ln -s /Applications/Xcode.app/Contents/Developer/usr/bin/lldb-mi /usr/local/bin/lldb-mi
  ```

  Alternatively you can specify the path to lldb-mi inside your debugger configuration (`miDebuggerPath` or `lldbmipath`) every time you create a debug configuration, however this is not recommended if you have many projects.

  Manual Extension configuration:

  * `"type": "cppdbg", "MIMode": "lldb"` (C/C++ extension)

  * `"type": "lldb-mi"` (Native Debug extension)

* **GDB**

  GDB on Mac must be separately installed and might not function correctly in every case. It should be used as fallback but can be made to work.

  GDB versions 9.1 and above add support for D which includes demangling of function names, so having an up-to-date installation is recommended.

  Manual Extension configuration:

  * `"type": "cppdbg", "MIMode": "gdb"` (C/C++ extension)

  * `"type": "gdb"` (Native Debug extension)


## Next Steps

Using the various [Editor Functionalities](editing.md)
