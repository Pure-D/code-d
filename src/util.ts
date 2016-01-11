var request = require("request");

export function uploadCode(title: string, syntax: string, code: string): Thenable<string> {
	return new Promise((resolve, reject) => {
		request.post('http://dpaste.com/api/v2/', { form: { content: code, syntax: syntax, title: title, expiry_days: 7 } }, (err, httpResponse, body) => {
			if (err)
				return reject(err);
			resolve(body);
		});
	});
}