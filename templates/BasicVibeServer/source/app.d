import vibe.vibe;

void main()
{
	auto settings = new HTTPServerSettings;
	settings.port = 3000;
	settings.bindAddresses = ["::1", "127.0.0.1"];
	// Enables sessions which are stored in memory
	// RedisSessionStore can also be used when connected with a Redis database.

	// Additional Session Stores: (third party)
	// MongoDB Session Store - available via the dependency `mongostore`
	settings.sessionStore = new MemorySessionStore;

	auto router = new URLRouter;
	// calls index function when / is accessed
	router.get("/", &index);
	// Serves files out of public folder
	router.get("*", serveStaticFiles("./public/"));

	// Binds an instance of MyAPIImplementation to the /api/ prefix. All endpoints will have /api/ prefixed.
	router.registerRestInterface(new MyAPIImplementation, "/api/");

	listenHTTP(settings, router);

	runApplication();
}

void index(HTTPServerRequest req, HTTPServerResponse res)
{
	res.render!("index.dt");
}

// Dummy REST API

/// Dummy user
struct User
{
	/// First & Last Name
	string name;
	/// Age of this user
	int age;
}

// API interface (required for registerRestInterface. Also makes API more easily documentable and allows for REST API clients)
interface MyAPI
{
	User getUser();
	User[] getUsers();
}

class MyAPIImplementation : MyAPI
{
	// GET /api/user
	User getUser()
	{
		return User("John Doe", 21);
	}

	// GET /api/users
	User[] getUsers()
	{
		return [User("John Doe", 21), User("Peter Doe", 23), User("Mary Doe", 22)];
	}
}
