import { CodedAPI, SnippetLevel } from "code-d-api";

export function builtinPlugins(instance: CodedAPI) {
	// vibe.d:http snippets
	instance.registerDependencyBasedSnippets(["vibe-d:http"], [
		{
			levels: [SnippetLevel.method],
			shortcut: "viberouter",
			title: "vibe.d router",
			documentation: "Basic router instance code with GET / path.\n\nReference: https://vibed.org/api/vibe.http.router/URLRouter",
			snippet: 'auto ${1:router} = new URLRouter();\n${1:router}.get("/", &${2:index});'
		},
		{
			levels: [SnippetLevel.method],
			shortcut: "vibeserver",
			title: "vibe.d HTTP server",
			documentation: "Basic vibe.d HTTP server startup code.\n\nReference: https://vibed.org/api/vibe.http.server/",
			snippet: 'auto ${3:settings} = new HTTPServerSettings();\n'
				+ '${3:settings}.port = ${1:3000};\n'
				+ '${3:settings}.bindAddresses = ${2:["::1", "127.0.0.1"]};\n'
				+ '\n'
				+ 'auto ${4:router} = new URLRouter();\n'
				+ '${4:router}.get("/", &${5:index});\n'
				+ '\n'
				+ 'listenHTTP(${3:settings}, ${4:router});\n'
		},
		{
			levels: [SnippetLevel.method],
			shortcut: "vibeget",
			title: "vibe.d GET request",
			documentation: "Code for a simple low-level async GET request.\n\nReference: https://vibed.org/api/vibe.http.client/requestHTTP",
			snippet: 'requestHTTP(URL("$1"), null, (scope HTTPClientResponse res) {\n\t${2:// TODO: check res.statusCode and read response into parent scope variables.}\n});'
		},
		{
			levels: [SnippetLevel.method],
			shortcut: "viberequest",
			title: "vibe.d HTTP request (POST/GET/PUT/...)",
			documentation: "Code for a simple low-level async HTTP request.\n\nReference: https://vibed.org/api/vibe.http.client/requestHTTP",
			snippet: 'requestHTTP(URL("$1"), (scope HTTPClientRequest req) {\n\treq.method = HTTPMethod.${2:POST};\n\t${3:// TODO: write request body}\n}, (scope HTTPClientResponse res) {\n\t${4:// TODO: check res.statusCode and read response into parent scope variables.}\n});'
		},
		{
			levels: [SnippetLevel.method],
			shortcut: "vibegetstring",
			title: "vibe.d GET request into string",
			documentation: "Code for a simple async GET request storing the full response body in a string.\n\nReference: https://vibed.org/api/vibe.http.client/requestHTTP",
			snippet: 'string ${1:text};\nrequestHTTP(URL("$2"), null, (scope HTTPClientResponse res) {\n\t${3:// TODO: check res.statusCode}\n\t${1:text} = res.bodyReader.readAllUTF8();\n});'
		},
		{
			levels: [SnippetLevel.method],
			shortcut: "vibegetjson",
			title: "vibe.d GET request as json",
			documentation: "Code for a simple async GET request storing the full response body in a string.\n\nReference: https://vibed.org/api/vibe.http.client/requestHTTP",
			snippet: 'Json ${1:json};\nrequestHTTP(URL("$2"), null, (scope HTTPClientResponse res) {\n\t${3:// TODO: check res.statusCode}\n\t${1:json} = res.readJson(); // TODO: possibly want to add .deserializeJson!T\n});'
		},
	]);
}
