#!/usr/bin/env sh
if [ -z ${PODMAN+x} ]; then
	PODMAN=podman
fi

${PODMAN} run \
	-v '.':'/code-d' \
	--init \
	'docker.io/node:24' \
	sh -euxc '
		npm install --allow-scripts=@vscode/vsce-sign -g @vscode/vsce
		cd /code-d
		npm install
		npm exec @vscode/vsce package
	'
