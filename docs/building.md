<!-- Documentation generated from docs-src/building.md -->

# Tutorial

<div style="float: right; margin-left: 1em; padding: 1em; border: 1px solid white; position: relative; z-index: 10; outline: 1px solid black;">

* [Home](index.md)
* [Installation](install.md)
* [Tutorial](intro-to-d.md)
	* [Intro to D](intro-to-d.md)
	* [Hello World](hello-world.md)
	* **[Building](building.md)**
	* [Debugging](debugging.md)
	* [Editing](editing.md)
	* [DUB Package Manager](dub.md)
	* [vibe.d Web App](vibe-d.md)
	* [Configuring non-DUB projects](non-dub.md)
* [Troubleshooting](troubleshooting.md)
* [Changelog](../CHANGELOG.md)

</div>

## Building

code-d transparently embeds DUB projects into the VSCode build tasks system.

To build and run your project within VSCode, press `Ctrl-Shift-B` or `Run Build Task` in the command palette. This will bring up a list of supported build operations.

![build list](images/build_list.png)

When you select a build task, for example `"Run <project name>"`, it will pop up in the integrated command line in VSCode:

![command run output](images/build_run_output.png)

By default code-d passes all the currently configured build arguments to DUB. At the bottom bar it's possible to change all these arguments to manipulate build and plugin behavior. From left to right:

### Configuration

![application or library configuration](images/build_configuration.png)

In here you can select the configuration of your application to run. You can manually define any configurations you want and they will replace the built-in ones by default.

DUB provides an `application` configuration and a `library` configuration by default:

* the `application` configuration includes all source files and runs your program as executable file.

* the `library` configuration is nearly the same, except it will generate a statically linkable library for use in other applications. By default it also doesn't compile in the main source file (source/app.d)

The configurations `application` and `library` are usually automatically picked. When only running `dub build` or `dub run` it will always pick `application` if a main source file exists. Otherwise when no main source file exists, or when the project is used as a dependency in another project, it will use the `library` configuration.

See https://dub.pm/package-format-json.html#configurations

### Architecture Type

![x86 or x86_64 arch type](images/build_arch.png)

The architecture determines for which platform architecture the binary is going to be generated. Commonly these include:

* `x86` for 32-bit apps on an Intel (based) CPU

* `x86_64` for 64-bit apps on an Intel (based) CPU

Depending on the selected compiler this might include more architectures for cross compiling.

### Build Type

![list of supported build types](images/build_types.png)

You can select a build type out of a predefined list or anything else which is defined in the dub package file. The build types change how the compiler is invoked for building and are combinations of build options.

See https://dub.pm/package-format-json.html#build-types

### Compiler

![input field for compiler](images/build_compiler.png)

To change which compiler is being used for running your program, you can click the compiler button. In here you can enter any compiler you want to use which you have locally installed.

Enter either a short name like `ldc2`, `dmd` or `gdc` in here if you have the compilers installed and available in your `PATH`.

If you only have portable installations of your compilers, enter a full path like `C:\D\dmd2\windows\bin\dmd.exe` in here.

## Custom Build Tasks

It's possible to customize the default build tasks which you have available. Simply use the `Configure Task` command (or the siblings of it)

![available task commands](images/task_configure.png)

Then select the task you want your custom task to be based off:

![dub tasks to pick from](images/task_configure_list.png)

A `tasks.json` file will be generated with the new task in there as placeholder.

![generated dub task](images/task_generated.png)

Optionally to be able to disambiguate between automatically generated tasks and your custom specified task, remove the `"_generated": true` from the task definition to change the name from `dub-auto` to `dub`.

You can use the built-in dub types to have a simple configuration for dub or you can also define custom shell commands which use the D problem matcher to show issues in code when running. You can check out the documentation by [Microsoft](https://go.microsoft.com/fwlink/?LinkId=733558) on this.

Use the auto completion and validation to discover possible fields and values in the custom tasks.

```js
{
	// See https://go.microsoft.com/fwlink/?LinkId=733558 
	// for the documentation about the tasks.json format
	"version": "2.0.0",
	"tasks": [
		{
			"type": "dub",
			"run": false,
			"problemMatcher": [
				"$dmd"
			],
			"group": "build"
		}
	]
}
```

## Next Steps

[Debugging](debugging.md) your application
