import bindbc.sdl;
import bindbc.opengl;

import std.stdio;
import std.string;

int main()
{
	SDLSupport sdlStatus = loadSDL();
	if (sdlStatus != sdlSupport)
	{
		writeln("Failed loading SDL: ", sdlStatus);
		return 1;
	}

	if (SDL_Init(SDL_INIT_VIDEO) < 0)
		throw new SDLException();

	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 1);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 1);

	auto window = SDL_CreateWindow("OpenGL 1.1 App", SDL_WINDOWPOS_UNDEFINED,
			SDL_WINDOWPOS_UNDEFINED, 400, 300, SDL_WINDOW_OPENGL | SDL_WINDOW_SHOWN);
	if (!window)
		throw new SDLException();

	const context = SDL_GL_CreateContext(window);
	if (!context)
		throw new SDLException();

	if (SDL_GL_SetSwapInterval(1) < 0)
		writeln("Failed to set VSync");

	GLSupport glStatus = loadOpenGL();
	if (glStatus < glSupport)
	{
		writeln("Failed loading OpenGL: ", glStatus);
		return 1;
	}

	glMatrixMode(GL_PROJECTION);
	glLoadIdentity();

	glMatrixMode(GL_MODELVIEW);
	glLoadIdentity();

	bool quit = false;
	SDL_Event event;
	while (!quit)
	{
		while (SDL_PollEvent(&event))
		{
			switch (event.type)
			{
			case SDL_QUIT:
				quit = true;
				break;
			default:
				break;
			}
		}

		glClear(GL_COLOR_BUFFER_BIT);

		glBegin(GL_TRIANGLES);
		{
			glColor3f(1, 0, 0);
			glVertex2f(-0.5f, -0.5f);
			glColor3f(0, 1, 0);
			glVertex2f(0.5f, -0.5f);
			glColor3f(0, 0, 1);
			glVertex2f(0, 0.5f);
		}
		glEnd();

		SDL_GL_SwapWindow(window);
	}

	return 0;
}

/// Exception for SDL related issues
class SDLException : Exception
{
	/// Creates an exception from SDL_GetError()
	this(string file = __FILE__, size_t line = __LINE__) nothrow @nogc
	{
		super(cast(string) SDL_GetError().fromStringz, file, line);
	}
}
