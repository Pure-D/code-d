# Debugging Projects

First install at least one of these 3 debugging extensions from the VSCode marketplace:

- C++
- CodeLLDB
- Native Debug

Check out the Debugging section in the User Guide for more details about these and which to pick if you are unsure.

First create a launch.json file:

![Create a launch.json using the sidebar](../images/create-launch-json.png)

Then follow up by selecting either

- D (code-d: Native Debug / C++ / CodeLLDB)
- DUB (code-d: Native Debug / C++ / CodeLLDB)

Selecting the `D` variant will just run some D executable you have built before.

Selecting the `DUB` variant will build the project using DUB before running the
configured executable.

Now you can review the settings that were auto generated and you should be able
to hit the start button to start debugging.
