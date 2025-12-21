# Configuring Code-D

Code-D uses the standard VSCode user settings. Open the user settings and check
out the section `Extensions > D` to view or edit all the settings.

In the JSON settings editor the settings all start with `"d."` for D related
settings, `"dfmt."` for formatter related settings and `"dscanner."` for linting
related settings.

Some features are disabled by default because they are not fully ready for all
use-cases yet or may significantly increase resource usage on low-spec machines.
If you want to, do give these features a try and report issues on
[GitHub](https://github.com/Pure-D/code-d/issues).

Code-D is using a language server protocol called Serve-D to implement all of
its features. Serve-D gets more frequent updates than Code-D and these will
automatically be downloaded whenever a new stable release gets released. If you
don't want to receive automatic updates or want to receive more frequent beta or
nightly updates, configure the `d.servedReleaseChannel` user setting to your
liking and reload the window.
