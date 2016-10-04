import gtk.MainWindow;
import gtk.Label;
import gtk.Main;

void main(string[] args)
{
	// Initializes gtk runtime
	Main.init(args);

	// Creates a MainWindow
	MainWindow window = new MainWindow("My App");
	window.setDefaultSize(400, 300);
	// Adds a new label to the layout
	window.add(new Label("Hello World"));
	// Shows all widgets added to the layout
	window.showAll();

	// Starts message loop and displays MainWindow
	Main.run();
}
