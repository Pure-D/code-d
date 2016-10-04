import derelict.sdl2.sdl;
import derelict.opengl3.gl3;

import std.stdio;
import std.string;

/// Exception for SDL related issues
class SDLException : Exception
{
	/// Creates an exception from SDL_GetError()
	this(string file = __FILE__, size_t line = __LINE__) nothrow @nogc
	{
		super(cast(string) SDL_GetError().fromStringz, file, line);
	}
}

void main()
{
	DerelictSDL2.load();
	DerelictGL3.load();

	if (SDL_Init(SDL_INIT_VIDEO) < 0)
		throw new SDLException();

	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3);
	SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 2);

	auto window = SDL_CreateWindow("OpenGL 3.2 App", SDL_WINDOWPOS_UNDEFINED,
			SDL_WINDOWPOS_UNDEFINED, 400, 300, SDL_WINDOW_OPENGL | SDL_WINDOW_SHOWN);
	if (!window)
		throw new SDLException();

	const context = SDL_GL_CreateContext(window);
	if (!context)
		throw new SDLException();

	if (SDL_GL_SetSwapInterval(1) < 0)
		writeln("Failed to set VSync");

	DerelictGL3.reload();

	loadScene();

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

		renderScene();

		SDL_GL_SwapWindow(window);
	}

	unloadScene();
}

//dfmt off
const float[] vertexBufferPositions = [
	-0.5f, -0.5f, 0,
	0.5f, -0.5f, 0,
	0, 0.5f, 0
];
const float[] vertexBufferColors = [
	1, 0, 0,
	0, 1, 0,
	0, 0, 1
];
//dfmt on
GLuint vertexBuffer;
GLuint colorBuffer;
GLuint programID;
GLuint vertexArrayID;

void loadScene()
{
	// create OpenGL buffers for vertex position and color data
	glGenVertexArrays(1, &vertexArrayID);
	glBindVertexArray(vertexArrayID);

	// load position data
	glGenBuffers(1, &vertexBuffer);
	glBindBuffer(GL_ARRAY_BUFFER, vertexBuffer);
	glBufferData(GL_ARRAY_BUFFER, float.sizeof * vertexBufferPositions.length,
			vertexBufferPositions.ptr, GL_STATIC_DRAW);

	// load color data
	glGenBuffers(1, &colorBuffer);
	glBindBuffer(GL_ARRAY_BUFFER, colorBuffer);
	glBufferData(GL_ARRAY_BUFFER, float.sizeof * vertexBufferColors.length,
			vertexBufferColors.ptr, GL_STATIC_DRAW);

	GLint result;
	int infoLogLength;

	// compile shaders
	GLuint vertexShaderID = glCreateShader(GL_VERTEX_SHADER);
	const(char*) vertSource = import("shader.vert").toStringz;
	glShaderSource(vertexShaderID, 1, &vertSource, null);
	glCompileShader(vertexShaderID);
	glGetShaderiv(vertexShaderID, GL_COMPILE_STATUS, &result);
	glGetShaderiv(vertexShaderID, GL_INFO_LOG_LENGTH, &infoLogLength);
	if (infoLogLength > 0)
	{
		char* errorMessage;
		glGetShaderInfoLog(vertexShaderID, infoLogLength, null, errorMessage);
		writeln(errorMessage[0 .. infoLogLength]);
	}

	GLuint fragmentShaderID = glCreateShader(GL_FRAGMENT_SHADER);
	const(char*) fragSource = import("shader.frag").toStringz;
	glShaderSource(fragmentShaderID, 1, &fragSource, null);
	glCompileShader(fragmentShaderID);
	glGetShaderiv(fragmentShaderID, GL_COMPILE_STATUS, &result);
	glGetShaderiv(fragmentShaderID, GL_INFO_LOG_LENGTH, &infoLogLength);
	if (infoLogLength > 0)
	{
		char* errorMessage;
		glGetShaderInfoLog(fragmentShaderID, infoLogLength, null, errorMessage);
		writeln(errorMessage[0 .. infoLogLength]);
	}

	// link shaders
	programID = glCreateProgram();
	glAttachShader(programID, vertexShaderID);
	glAttachShader(programID, fragmentShaderID);
	glLinkProgram(programID);
	glGetProgramiv(programID, GL_LINK_STATUS, &result);
	glGetProgramiv(programID, GL_INFO_LOG_LENGTH, &infoLogLength);
	if (infoLogLength > 0)
	{
		char* errorMessage;
		glGetProgramInfoLog(programID, infoLogLength, null, errorMessage);
		writeln(errorMessage[0 .. infoLogLength]);
	}

	// Delete unused compiled shaders because program is linked already
	glDetachShader(programID, vertexShaderID);
	glDetachShader(programID, fragmentShaderID);

	glDeleteShader(vertexShaderID);
	glDeleteShader(fragmentShaderID);
}

void unloadScene()
{
	glDeleteBuffers(1, &vertexBuffer);
	glDeleteBuffers(1, &colorBuffer);
	glDeleteVertexArrays(1, &vertexArrayID);
	glDeleteProgram(programID);
}

void renderScene()
{
	glClear(GL_COLOR_BUFFER_BIT);

	glUseProgram(programID);

	glEnableVertexAttribArray(0);
	glBindBuffer(GL_ARRAY_BUFFER, vertexBuffer);
	glVertexAttribPointer(0, // attribute 0. No particular reason for 0, but must match the layout in the shader.
			3, // size
			GL_FLOAT, // type
			false, // normalized?
			0, // stride
			null  // array buffer offset
			);
	glEnableVertexAttribArray(1);
	glBindBuffer(GL_ARRAY_BUFFER, colorBuffer);
	glVertexAttribPointer(1, // attribute 1
			3, // size
			GL_FLOAT, // type
			false, // normalized?
			0, // stride
			null  // array buffer offset
			);
	// Draw the triangle!
	glDrawArrays(GL_TRIANGLES, 0, 3); // Starting from vertex 0; 3 vertices total -> 1 triangle
	glDisableVertexAttribArray(0);
	glDisableVertexAttribArray(1);
}
