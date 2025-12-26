/// Release ID for serve-d "nightly" release (API ID)
export const nightlyReleaseId = 20717582;

/// Gets the URL for the binary tarball containing DCD, which is preloaded alongside serve-d to ensure DCD is installed
export function getBundledDCDUrl(): string | undefined {
	const latest = "0.16.0";

	if (process.platform === "linux" && process.arch === "x64") {
		return `https://github.com/dlang-community/DCD/releases/download/v${latest}/dcd-v${latest}-linux-x86_64.tar.gz`;
	} else if (process.platform === "linux" && process.arch === "arm64") {
		return `https://github.com/dlang-community/DCD/releases/download/v${latest}/dcd-v${latest}-linux-aarch64.tar.gz`;
	} else if (process.platform === "darwin" && process.arch === "arm64") {
		return `https://github.com/dlang-community/DCD/releases/download/v${latest}/dcd-v${latest}-osx-aarch64.tar.gz`;
	} else if (process.platform === "darwin" && process.arch === "x64") {
		return `https://github.com/dlang-community/DCD/releases/download/v${latest}/dcd-v${latest}-osx-x86_64.tar.gz`;
	} else if (
		process.platform === "win32" &&
		(process.arch === "x64" ||
			process.env.PROCESSOR_ARCHITEW6432 === "AMD64" ||
			process.env.PROCESSOR_ARCHITEW6432 === "IA64")
	) {
		return `https://github.com/dlang-community/DCD/releases/download/v${latest}/dcd-v${latest}-windows-x86_64.zip`;
	} else {
		return undefined;
	}
}
