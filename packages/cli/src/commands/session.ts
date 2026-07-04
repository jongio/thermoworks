import { formatTimeAgo, ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";
import { prompt } from "../prompt.js";

export interface SessionOptions extends OutputOptions {
	yes: boolean;
}

/**
 * Parse session-specific flags from remaining args after global flags are stripped.
 * Returns `--label` value, `--yes` flag, and cleaned positional args.
 */
function parseSessionArgs(args: string[]): {
	label: string | undefined;
	yes: boolean;
	positional: string[];
} {
	let label: string | undefined;
	let yes = false;
	const positional: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--label" || arg === "-l") {
			const next = args[++i];
			if (next != null) label = next;
		} else if (arg === "--yes" || arg === "-y") {
			yes = true;
		} else if (arg != null) {
			positional.push(arg);
		}
	}

	return { label, yes, positional };
}

export async function sessionStart(
	serial: string,
	label: string | undefined,
	options: OutputOptions,
): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const result = await client.startSession(serial, label);

		if (options.json) {
			outputJson(result);
			return;
		}

		if (result.success) {
			const msg = label
				? `Session started for ${serial} ("${label}").`
				: `Session started for ${serial}.`;
			console.log(msg);
		} else {
			console.error(`Failed to start session: ${result.error ?? "unknown error"}`);
			process.exit(1);
		}
	} finally {
		client.close();
	}
}

export async function sessionEnd(serial: string, options: OutputOptions): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const result = await client.endSession(serial);

		if (options.json) {
			outputJson(result);
			return;
		}

		if (result.success) {
			console.log(`Session ended for ${serial}.`);
		} else {
			console.error(`Failed to end session: ${result.error ?? "unknown error"}`);
			process.exit(1);
		}
	} finally {
		client.close();
	}
}

export async function sessionClear(serial: string, options: SessionOptions): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	if (!options.yes && !options.json) {
		const answer = await prompt(
			`Clear all session data for ${serial}? This cannot be undone. [y/N] `,
		);
		if (answer.toLowerCase() !== "y") {
			console.log("Cancelled.");
			return;
		}
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const result = await client.clearSession(serial);

		if (options.json) {
			outputJson(result);
			return;
		}

		if (result.success) {
			console.log(`Session data cleared for ${serial}.`);
		} else {
			console.error(`Failed to clear session: ${result.error ?? "unknown error"}`);
			process.exit(1);
		}
	} finally {
		client.close();
	}
}

/** A single active-session entry for the `session status` view. */
interface SessionStatusEntry {
	serial: string;
	deviceLabel: string | null;
	sessionLabel: string | null;
	sessionStart: string;
	elapsedSeconds: number;
}

/** ANSI bold helper for the device header. */
const bold = (text: string): string => `\x1b[1m${text}\x1b[0m`;

/**
 * Show devices that currently have an active monitoring session.
 *
 * - Without a serial: scans every device on the account.
 * - With a serial: scopes to a single device.
 *
 * Read-only: derived from the `sessionStart`/`sessionLabel` fields on the device
 * record. Never starts, ends, or clears a session.
 */
export async function sessionStatus(
	serial: string | undefined,
	options: OutputOptions,
): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const devices = serial ? [await client.getDevice(serial)] : await client.getDevices();
		const now = Date.now();

		const entries: SessionStatusEntry[] = devices
			.filter((d) => d.sessionStart != null)
			.map((d) => {
				const start = d.sessionStart as Date;
				return {
					serial: d.serial,
					deviceLabel: d.label,
					sessionLabel: d.sessionLabel,
					sessionStart: start.toISOString(),
					elapsedSeconds: Math.max(0, Math.floor((now - start.getTime()) / 1000)),
				};
			});

		if (options.json) {
			outputJson(entries);
			return;
		}

		if (entries.length === 0) {
			console.log(serial ? `No active session on ${serial}.` : "No active sessions.");
			return;
		}

		for (const entry of entries) {
			const name = entry.deviceLabel ? `${entry.deviceLabel} (${entry.serial})` : entry.serial;
			const label = entry.sessionLabel ? ` "${entry.sessionLabel}"` : "";
			const ago = formatTimeAgo(new Date(entry.sessionStart));
			console.log(`${bold(name)}${label}  started ${ago}`);
		}
	} finally {
		client.close();
	}
}

/**
 * Route `thermoworks session <subcommand> <serial> [flags]` to the
 * appropriate handler.
 */
export async function session(args: string[], options: OutputOptions): Promise<void> {
	const { label, yes, positional } = parseSessionArgs(args);
	const subcommand = positional[0];
	const serial = positional[1];

	if (subcommand === "status") {
		await sessionStatus(serial, options);
		return;
	}

	if (!subcommand || !serial) {
		console.error(
			"Usage: thermoworks session <start|end|clear|status> SERIAL [--label TEXT] [--yes]",
		);
		process.exit(1);
	}

	const sessionOpts: SessionOptions = { ...options, yes };

	switch (subcommand) {
		case "start":
			await sessionStart(serial, label, options);
			break;
		case "end":
			await sessionEnd(serial, options);
			break;
		case "clear":
			await sessionClear(serial, sessionOpts);
			break;
		default:
			console.error(`Unknown session command: ${subcommand}`);
			console.error(
				"Usage: thermoworks session <start|end|clear|status> SERIAL [--label TEXT] [--yes]",
			);
			process.exit(1);
	}
}
