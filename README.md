# Code-D

Join the chat: [![Join on Discord](https://discordapp.com/api/guilds/242094594181955585/widget.png?style=shield)](https://discord.gg/Bstj9bx)

Adds D language support for visual studio code.

> It works pretty good - Wild 2018

Also [available for Atom](https://github.com/Pure-D/atomize-d)!

## Features

* Autocompletion
* Code formatting
* Static linting
* Outlining and searching for symbols
* and [much more](https://github.com/Pure-D/code-d/wiki)

## Special Thanks

**Thanks to the following big GitHub sponsors** financially supporting the code-d/serve-d tools:

* Jaen ([@jaens](https://github.com/jaens))

_[become a sponsor](https://github.com/sponsors/WebFreak001)_

## Installation

### Prerequirements:
D compiler with environment variables set. Downloads [here](https://dlang.org/download.html), details [here](https://wiki.dlang.org/Compilers)

### code-d installation

* Automatic:
  Open Visual Studio Code and install the _code-d_ extension the normal way:

  ```
  ext install webfreak.code-d
  ```

  Or search for code-d and select the "D Programming Language (code-d)" extension from the list.

* Manual (if the automatic way doesn't work)

    ```
    # discouraged if you are trying out code-d, you should preferably install it from the marketplace

    cd ~/.vscode/extensions/
    git clone https://github.com/Pure-D/code-d.git
    cd code-d
    npm install
    # requires `npm install -g typescript` once
    tsc -p .
    ```

code-d will automatically install [serve-d](https://github.com/Pure-D/serve-d),
[dcd](https://github.com/dlang-community/DCD) and [dub](https://code.dlang.org/download)
if they are not already installed.

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
