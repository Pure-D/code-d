# Code-D

Join the chat: [![Join on Discord](https://discordapp.com/api/guilds/242094594181955585/widget.png?style=shield)](https://discord.gg/Bstj9bx)

Adds advanced IDE support for the [D Programming Language](https://dlang.org) to Visual Studio Code. Powered by [serve-d](https://github.com/Pure-D/serve-d).

Also [available for Atom](https://github.com/Pure-D/atomize-d)!

## Features

- Auto-Completion
- Code formatting
- Static linting + Build linting
- Outlining and searching for symbols
- Refactorings for code diagnostics
- and [much more](https://github.com/Pure-D/code-d/wiki)

## Special Thanks

### Corporate Sponsors

Development on code-d/serve-d tools is sponsored by

| [![Weka.IO Logo](sponsors/weka.png)](https://weka.io) |
| :---------------------------------------------------: |
|            **[Weka.IO](https://weka.io)**             |

If you are looking for a Job with D, check out the companies listed above!

_For professional D consulting, programming services or corporate support with D IDE tools, DUB and the ecosystem, contact me through [dlang@wfr.software](mailto:dlang@wfr.software)_

### Individual Sponsors

**Thanks to the following big GitHub sponsors** financially supporting the code-d/serve-d tools:

| [![ZyeByte's GitHub avatar](https://avatars.githubusercontent.com/u/102230672?s=96&v=4)](<(https://github.com/zyebytevt)>) |
| :------------------------------------------------------------------------------------------------------------------------: |
|                                         [@zyebytevt](https://github.com/zyebytevt)                                         |

<!-- additional thanks to the following sponsors:

* Display Name ([@...](https://github.com/username)) -->

_[become a sponsor](https://github.com/sponsors/WebFreak001)_

### Development

Thanks to @Hackerpilot for his great IDE software that serve-d built upon.

Thanks to the D package registry, especially @s-ludwig for their great package manager and library "dub".

Thanks to all contributors to [code-d](https://github.com/Pure-D/code-d/graphs/contributors) and [serve-d](https://github.com/Pure-D/serve-d/graphs/contributors).

## Installation

### Prerequirements:

D compiler with environment variables set. Downloads [here](https://dlang.org/download.html), details [here](https://wiki.dlang.org/Compilers)

### code-d installation

- Automatic:
  Open Visual Studio Code and install the _code-d_ extension the normal way:

  ```
  ext install webfreak.code-d
  ```

  Or search for code-d and select the "D Programming Language (code-d)" extension from the list.

- Manual (if the automatic way doesn't work)

  ```
  # discouraged if you are trying out code-d, you should preferably install it from the marketplace

  cd ~/.vscode/extensions/
  git clone https://github.com/Pure-D/code-d.git
  cd code-d
  npm install
  npx tsc -p .
  ```

code-d will automatically install [serve-d](https://github.com/Pure-D/serve-d),
[dcd](https://github.com/dlang-community/DCD) and [dub](https://code.dlang.org/download)
if they are not already installed.

## License

MIT - Look in [LICENSE.md](LICENSE.md) for more information

## Issues

Please submit issues to [github](https://github.com/Pure-D/code-d)

## Special developer config

use `"d.forceUpdateServeD": true` to force an outdated prompt on startup.

use `"d.forceCompileServeD": true` to force compilation of serve-d instead of downloading pre-compiled releases.
