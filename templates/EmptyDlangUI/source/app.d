import dlangui;

mixin APP_ENTRY_POINT;

/// Entry point for dlangui based application
extern (C) int UIAppMain(string[] args)
{
	// Create window
	// arguments: title, parent, flags = WindowFlag.Resizable, width = 0, height = 0
	Window window = Platform.instance.createWindow("My App", null);

	// Load layout from views/MainWindow.dml and show it
	// Use readText("views/MainWindow.dml") from std.file to allow dynamic layout editting without recompilation
	auto layout = parseML(import("MainWindow.dml"));
	window.mainWidget = layout;

	// Show window
	window.show();

	// Run message loop
	return Platform.instance.enterMessageLoop();
}
