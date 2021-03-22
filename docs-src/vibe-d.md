# Tutorial

#menu

## vibe.d Web App

### Generating the Project

Much like in the [Hello World example](hello-world.md) you first need to use the project generator to create a project. This time select `Basic Web Server` for a basic vibe.d web servers.

![create basic web server](images/create_vibed_project.png)

You will find that several template files have been inserted in your project folder:

![file layout of basic vibe.d web server](images/create_vibed_project_files.png)

In general:

* `public/` contains all the HTTP-accessible static files such as images, stylesheets and scripts.
* `source/` contains all the server-side D code
* `views/` contains all the server-side templates for rendering into HTML

### Running the Web App

Simply hit `Ctrl-Shift-B` to use the build tasks as described in the [Building](building.md) chapter and use the run option or simply enter `dub run` in the integrated terminal.

![dub run](images/tasks_run.png)

The first time this will take a while to fetch and compile all dependencies, but successive runs will be faster.

When now running the application, a web server will be opened which you can access locally:

![vibe.d console output](images/vibed_output.png)

You can now open [http://127.0.0.1:3000/](http://127.0.0.1:3000/) in your browser to look at the example vibe.d app.

![vibe.d website](images/vibed_website.png)

You can explore around in the source code and do modifications. Once done, close the server using `Ctrl-C` in the terminal and rebuild and start it again.

### Diet Template Files

vibe.d uses a template format called [Diet](https://vibed.org/templates/diet) which is based off [pugjs](https://pugjs.org/api/getting-started.html). It is an indentation based language emitting HTML or XML code which can contain D code which is compiled in and run at runtime.

See documentation: [diet reference](https://vibed.org/templates/diet)

```dt
doctype html
html
	head
		title My Website
		link(rel="stylesheet", href="/css/style.css")
	body
		h1 Hello World!
		p Edit
			code views/index.dt
			| to edit this template
		a(href="/api/users") Example REST API
```

code-d provides full auto completion support for HTML5 tags and attributes. Additionally it fully supports auto completing inline D code inside diet template files.

