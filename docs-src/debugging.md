# Tutorial

#menu

## Debugging

code-d itself does not provide any debugging capabilities, you will have to install a debugging extension from the marketplace.

However code-d does provide the build tasks which can be used before debugging so the run button also rebuilds the project.

For this you have multiple options:

You will either want to install the C/C++ extension by Microsoft:

![C/C++](images/ext_cpp.png)

* Good issue support

* Regularly updated

* Debugging using GDB, LLDB and the Visual Studio Debugger

* Supports lightweight natvis and threads

* Can show more variables/scope

If you are on Windows, this is definitely the Extension you want to install so you can use the Visual Studio Debugger, which works without any problems.

**Note: you will have to enable breakpoints for all files for D to work with the C/C++ extension**

or you will need to install the Native Debug extension:

![native debug](images/ext_native_debug.png)

* Zero-Configuration D support

* Debugging using GDB, LLDB or mago-mi

* Some better remote debugging support

------------

Depending on extension you choose to use you will need to check their documentation how to setup everything.

## Choosing a debugger

### Windows

* **Visual Studio Debugger** (recommended)

  This will use the debugger bundled with Visual Studio, which works great for D. This is a great option if you want a zero-hassle configuration that quickly is going to work.

  In order to use this debugger type, you will need to **install Visual Studio** with C/C++ (native Desktop) support, which might not be an option for everybody.

  Extension configuration:

  * `"type": "cppvsdbg"` (C/C++ extension)

* **GDB**

  In order to use GDB on Windows, you will need to install Cygwin or MinGW, which might be difficult for your environment and is not the easiest way to setup.

  You will need to install GDB to be accessible from `PATH` or manually configure the path to your executable in the debugger configuration. (Depending on the extension `miDebuggerPath` or `gdbpath`)

  Extension configuration:

  * `"type": "cppdbg", "MIMode": "gdb"` (C/C++ extension)

  * `"type": "gdb"` (Native Debug extension)

* **LLDB**

  In order to use LLDB on Windows, you will need to compile LLDB from source or obtain an executable from somewhere reliable. This is not the easiest way to setup.

  Extension configuration:

  * `"type": "lldb-mi"` (Native Debug extension)

* **Mago**

  Mago is a debugging engine designed especially for debugging D code. When not having Visual Studio installed this might be a great alternative to use.

  In order to use Mago you will need to install `mago-mi`, which is obtainable from https://github.com/rainers/mago/releases (or [direct mago-mi.exe download link](https://ci.appveyor.com/api/projects/rainers/mago/artifacts/mago-mi.exe?job=Environment%3A%20os%3DVisual%20Studio%202013%2C%20VS%3D14%2C%20APPVEYOR_BUILD_WORKER_IMAGE%3DVisual%20Studio%202015))

  If you don't want to globally install mago-mi, (added to `PATH`) you can specify the path to it using `magomipath`

  Extension configuration:

  * `"type": "mago-mi"` (Native Debug extension)

Official documentation for the C/C++ extension: https://code.visualstudio.com/docs/cpp/cpp-debug

### Linux

* **GDB**

  GDB is a very reliable debugger on linux and should just work out of the box with D. Refer to your distribution's documentation to learn how to install GDB.

  Extension configuration:

  * `"type": "cppdbg", "MIMode": "gdb"` (C/C++ extension)

  * `"type": "gdb"` (Native Debug extension)

* **LLDB**

  LLDB is an alternative debugger which will work especially well when your program is compiled with LDC and might function a little bit differently here and there. Refer to your distribution's documentation to learn how to install LLDB.

  Extension configuration:

  * `"type": "lldb-mi"` (Native Debug extension)

To attach to programs you might want to run
```
echo 0 | sudo tee /proc/sys/kernel/yama/ptrace_scope
```
in order not to enter your password or get a permission denied error whenever using an attach configuration. See https://linux-audit.com/protect-ptrace-processes-kernel-yama-ptrace_scope/

### Mac

* **LLDB** (recommended)

  LLDB is the recommended debugger on Mac. It comes **installed with Xcode** but requires an additional step to be fully usable:

  ```
  ln -s /Applications/Xcode.app/Contents/Developer/usr/bin/lldb-mi /usr/local/bin/lldb-mi
  ```

  Alternatively you can specify the path to lldb-mi inside your debugger configuration (`miDebuggerPath` or `lldbmipath`) every time you create a debug configuration, however this is not recommended if you have many projects.

  Extension configuration:

  * `"type": "cppdbg", "MIMode": "lldb"` (C/C++ extension)

  * `"type": "lldb-mi"` (Native Debug extension)

* **GDB**

  GDB on Mac must be separately installed and might not function correctly in every case. It should be used as fallback but can be made to work.

  Extension configuration:

  * `"type": "cppdbg", "MIMode": "gdb"` (C/C++ extension)

  * `"type": "gdb"` (Native Debug extension)


## Creating a debugging configuration

Open the debug panel and click the cog. Select your installed debug extension and replace the path to the executable to your executable generated in the [Building](building.md) step.

![debugging example](video_debugging.gif)

See the [Visual Studio Code documentation](https://code.visualstudio.com/docs/editor/debugging) for more information.

**NOTE:** if you are using the **C/C++ Extension** you will have to go into your User Settings (`Ctrl-Shift-P -> User Settings`) and enable "Allow Breakpoints everywhere":

![allow breakpoints everywhere](images/settings_breakpoints.png)

## Building before every debug run

First you will need to add a label to your [task definition](building.md#custom-build-tasks):

```js
{
	"label": "dub build", // <-- add a good name here
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

## Next Steps

Using the various [Editor Functionalities](editing.md)
