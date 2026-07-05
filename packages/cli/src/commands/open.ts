import { spawn } from "node:child_process";
import { platform } from "node:process";

import { type OutputOptions, outputJson } from "../output.js";

/** A destination the `open` command can launch. */
export interface OpenTarget {
	name: string;
	url: string;
}

/** Known open targets keyed by name. `cloud` is the default. */
export const OPEN_TARGETS: Record<string, OpenTarget> = {
	cloud: { name: "ThermoWorks Cloud", url: "https://cloud.thermoworks.com" },
	web: { name: "ThermoWorks web dashboard", url: "https://jongio.github.io/thermoworks/" },
};

/**
 * Resolve a target name to a destination. Defaults to the cloud app when no
 * target is given. Returns null for an unknown target.
 */
export function resolveOpenTarget(target?: string): OpenTarget | null {
	const key = (target ?? "cloud").toLowerCase();
	return OPEN_TARGETS[key] ?? null;
}

/** Build the platform-specific command that opens a URL in the default browser. */
export function openCommand(
	url: string,
	os: NodeJS.Platform = platform,
): { command: string; args: string[] } {
	if (os === "win32") return { command: "cmd", args: ["/c", "start", "", url] };
	if (os === "darwin") return { command: "open", args: [url] };
	return { command: "xdg-open", args: [url] };
}

/** Launches a command detached from the CLI process. Injectable for tests. */
export type Launcher = (command: string, args: string[]) => void;

const defaultLauncher: Launcher = (command, args) => {
	const child = spawn(command, args, { stdio: "ignore", detached: true });
	// A missing browser launcher should not crash the CLI.
	child.on("error", () => {});
	child.unref();
};

/**
 * Open a ThermoWorks URL in the default browser.
 *
 * `thermoworks open` opens the cloud app. `thermoworks open web` opens the
 * project web dashboard. The URL is always printed first, so the command is
 * still useful over SSH or when no browser is available.
 */
export function open(
	target: string | undefined,
	options: OutputOptions,
	launch: Launcher = defaultLauncher,
): void {
	const dest = resolveOpenTarget(target);
	if (!dest) {
		const known = Object.keys(OPEN_TARGETS).join(", ");
		console.error(`Unknown target: ${target}. Known targets: ${known}`);
		process.exit(1);
		return;
	}

	if (options.json) {
		outputJson({ target: (target ?? "cloud").toLowerCase(), name: dest.name, url: dest.url });
	} else {
		console.log(`Opening ${dest.name}: ${dest.url}`);
	}

	const { command, args } = openCommand(dest.url);
	launch(command, args);
}
