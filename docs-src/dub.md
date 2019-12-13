# Tutorial

#menu

## DUB Package Manager

code-d offers full integration for the DUB package manager for all development purposes. This includes:

- Full file support for dub.json and dub.sdl
- Dependency management within VSCode
	- Add/Remove/Upgrade dependencies
	- Go to definition, auto complete, etc.
- Building
- Creation

### "DUB Dependencies" Panel

The first entry point to the dub dependencies is the "DUB Dependencies" panel in the files list:

![dub dependencies panel](images/dub_panel.png)

Using the first button dependencies can automatically be added to the dub package file in the project.

![add dub dependencies list](images/dub_dependency_list.png)

Adding a dependency will automatically add it to the dub package file.

To remove or update a dependency, right click it and select the desired option.

When first adding a dependency it will be missing any version from the list:

![dub dependencies panel with missing dependency version](images/missing_dependency_version.png)

This also means that auto completion and other features for this dependency won't work. To fix this, open the command line and enter

```
dub upgrade
```

to make dub download all dependencies.

When done, press the reload button at the right to refresh the local dependencies. (subject to change)

![working dub dependencies panel](images/fixed_dependency_version.png)

Any dependency in this tree can be expanded and collapsed. Additionally it is possible to click on the dependencies to view the locally installed README files:

![readme example of vibe.d](images/dub_panel_full.png)

It will also show much of the other information which can be put into the dub package files. This panel gives a quick and easy overview over the complexity of all dependencies and access to so. Viewing the README files makes it easy to view example code given by the language authors.

### Editing

![dub.json file](images/dub_json_file.png)

Here code-d adds 2 buttons at the top of the bar for easier manipulation:

The left-most button "Convert between dub.json/dub.sdl" will rename and convert the file to the other available format by dub.

![dub.sdl file](images/dub_sdl_file.png)

Be aware that this will remove all comments from a dub.sdl and unknown directives from a dub.json file and reset all indentation.

The middle button "Open project settings" opens a (currently disfunctional) GUI editor for the dub.json file. Note this functionality is only currently implemented for dub.json and not dub.sdl

Auto completion and inline hover documentation in this file will usually guide you through everything you need to know. Refer to the [official documentation](https://dub.pm/package-format-json) for details.

![example big dub.json file](images/dub_json_file_big.png)

### Building

See [building](building.md)

### Next Steps

Create a [web server with vibe.d](vibe-d.md)
