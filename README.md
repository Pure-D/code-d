# Code-D

Adds D language support for visual studio code.

Also [available for Atom](https://github.com/Vild/atomize-d)!

## Features

* Autocompletion
* Code formatting
* Static linting
* Outlining and searching for symbols

## Installation

### Prerequirements:
D compiler with environment varibles set. Downloads [here](https://dlang.org/download.html), details [here](https://wiki.dlang.org/Compilers)

### Dependencies:

code-d will install [workspace-d](https://github.com/Pure-D/workspace-d),
[dcd](https://github.com/Hackerpilot/DCD), [dfmt](https://github.com/Hackerpilot/dfmt),
[dscanner](https://github.com/Hackerpilot/Dscanner) if they are not already installed.

### code-d installation

This assumes [workspace-d](https://github.com/Pure-D/workspace-d) is already installed.

* Automatic:
  Open Visual Studio Code and install _code-d_ extension the normal way:

  ```
  ext install webfreak.code-d
  ```

* Manual (if the automatic way doesn't work)

    ```
    cd ~/.vscode/extensions/
    git clone https://github.com/Pure-D/code-d.git
    cd code-d
    npm install
    tsc -p .
    ```

## License

MIT - Look in [LICENSE.md](LICENSE.md) for more information

## Special Thanks

Thanks to @Hackerpilot for his great software used here and the D package registry
for their great package manager and library "dub"

## Authors

* Dan "Wild" Printzell
* Jan "WebFreak" Jurzitza

## Issues

Please submit issues to [github](https://github.com/Pure-D/code-d)
