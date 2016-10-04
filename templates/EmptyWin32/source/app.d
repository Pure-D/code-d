import core.runtime;
import core.sys.windows.windows;
import std.string;

extern (Windows) int WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance,
		LPSTR lpCmdLine, int nCmdShow)
{
	int result;

	try
	{
		Runtime.initialize();
		result = myWinMain(hInstance, hPrevInstance, lpCmdLine, nCmdShow);
		Runtime.terminate();
	}
	catch (Throwable e)
	{
		MessageBoxA(null, e.toString().toStringz(), null, MB_ICONEXCLAMATION);
		result = 0;
	}

	return result;
}

int myWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nCmdShow)
{
	MSG msg = MSG(null);
	WNDCLASS wc = WNDCLASS(0);
	wc.lpfnWndProc = &WndProc;
	wc.hInstance = hInstance;
	wc.hbrBackground = cast(HBRUSH)(COLOR_BACKGROUND);
	wc.lpszClassName = "myappclass";
	if (!RegisterClass(&wc))
		return 1;

	const(wchar)* windowTitle = "My App";
	if (!CreateWindow(wc.lpszClassName, windowTitle,
			WS_OVERLAPPEDWINDOW | WS_VISIBLE, 0, 0, 400, 300, null, null, hInstance, null))
		return 2;

	while (GetMessage(&msg, null, 0, 0) > 0)
		DispatchMessage(&msg);

	return 0;
}

extern (Windows) auto WndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam)
{
	switch (message)
	{
	case WM_CLOSE:
		PostQuitMessage(0);
		break;
	default:
		return DefWindowProc(hWnd, message, wParam, lParam);
	}
	return 0;
}
