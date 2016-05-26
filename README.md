# Code-D

Adds D language support for visual studio code.

Also [available for Atom](https://github.com/Vild/atomize-d)!

## Features

* Autocompletion
* Code formatting
* Static linting
* Outlining and searching for symbols

## Installation

### Dependencies:

Code-d needs its backend, [workspace-d](https://github.com/Pure-D/workspace-d). 
Installing it will automatically detect or install the necessary D tools 
([dcd](https://github.com/Hackerpilot/DCD), [dfmt](https://github.com/Hackerpilot/dfmt), [dscanner](https://github.com/Hackerpilot/Dscanner)).

### Automatic code-d installation

Open VS Code and install code-d extension the normal way.

### Manual code-d installation (if the installer doesn't work)

```
cd ~/.vscode/extensions/
git clone https://github.com/Pure-D/code-d.git
cd code-d
npm install
node ./node_modules/vscode/bin/compile
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