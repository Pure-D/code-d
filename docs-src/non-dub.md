# Tutorial

#menu

## Configuring non-DUB projects

By default code-d loads the project folder itself and then each dub project in child folders as separate root.

Without dub by default it will only load the project folder itself as root but it's possible to specify multiple roots in one folder for multiple projects in one folder. For this, specify `d.extraRoots` in your workspace settings with relative paths to each folder that is supposed to be treated as separate project.

In each root code-d checks if one of the following folders exist if there is no dub and the `d.projectImportPaths` user setting is not set:
- `source/`
- `src/`

The first one off that list is going to be picked as source directory for that root. If none of those exist, the folder itself is going to be used as directory for sources. By specifying `d.projectImportPaths` it is possible to override this behavior to use a custom defined source folder path. All paths in `d.projectImportPaths` are relative to the project folder and all roots will have the same import paths with this.

![example showing root source files](images/default_srcs.png)

You can see that imports from local files are auto-completed with no problems. However when trying to use files from external folders (such as here, the `ext/` folder) the auto completion will not find these symbols.

To fix this, change `d.projectImportPaths` to `[".", "ext"]` in your workspace settings:

```json
{
	"d.projectImportPaths": [".", "ext"]
}
```

![project import paths](images/project_import_paths.png)

By setting this all external dependencies specified will now load properly:

![working auto complete](images/all_srcs.png)

### Building

If you have a very simple script without any extra dependencies outside the source folder itself, you can run each file using RDMD:

![run file with rdmd](images/run_with_rdmd.png)

However this will not work in this case with extra custom dependencies if they are used as it will not pick them up for the imports.

Otherwise you will have to define your own scripts or build tools and best integrate them in the [build task definitions](https://go.microsoft.com/fwlink/?LinkId=733558) so you can use them for [debugging](debugging.md).
