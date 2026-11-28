#!/usr/bin/env sh
if [ -z ${PODMAN+x} ]; then
	PODMAN=podman
fi

${PODMAN} run \
	-v '.':'/code-d' \
	--init \
	'docker.io/node:24' \
	sh -euxc '
		cd /code-d
		[ -d node_modules ] || npm install --save-dev
		npx lint-staged
	'
