import vibe.vibe;

void main()
{
	auto settings = new HTTPServerSettings;
	settings.port = 3000;
	settings.bindAddresses = ["::1", "127.0.0.1"];
	listenHTTP(settings, &hello);

	runApplication();
}

void hello(HTTPServerRequest req, HTTPServerResponse res)
{
	res.writeBody("Hello World");
}
