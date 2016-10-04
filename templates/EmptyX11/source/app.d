import x11.X;
import x11.Xlib;

void main()
{
	Display* display = XOpenDisplay(null); // Open default display (most of the time this is :0)
	if (!display)
		throw new Exception("Cannot open display");
	scope (exit)
		XCloseDisplay(display);

	auto screen = DefaultScreen(display);
	// Create window
	auto window = XCreateSimpleWindow(display, RootWindow(display, screen), 10,
			10, 100, 100, 1, BlackPixel(display, screen), WhitePixel(display, screen));

	XSelectInput(display, window, ExposureMask | KeyPressMask); // Enable events
	XMapWindow(display, window); // Show window

	string message = "Hello World";

	XEvent event;
	while (true)
	{
		XNextEvent(display, &event);
		if (event.type == Expose)
		{
			XDrawString(display, window, DefaultGC(display, screen), 10, 10,
					cast(char*) message.ptr, cast(int) message.length);
		}
		if (event.type == KeyPress)
			break;
	}
}
