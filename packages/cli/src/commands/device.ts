import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

const USAGE =
	"Usage: thermoworks device <rename|reset-minmax> <SERIAL> [--name TEXT | --channel N]";

/**
 * Parse device-specific flags from args, separating flags from positional args.
 * Returns `--name` value, raw `--channel` value, and cleaned positional args.
 */
function parseDeviceArgs(args: string[]): {
	name: string | undefined;
	channelRaw: string | undefined;
	positional: string[];
} {
	let name: string | undefined;
	let channelRaw: string | undefined;
	const positional: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--name") {
			const next = args[++i];
			if (next != null) name = next;
		} else if (arg === "--channel") {
			const next = args[++i];
			if (next != null) channelRaw = next;
		} else if (arg != null) {
			positional.push(arg);
		}
	}

	return { name, channelRaw, positional };
}

/** Validate channel is an integer between 1 and 9. */
function parseChannel(raw: string | undefined): number {
	if (raw === undefined) {
		console.error("Missing required flag: --channel <1-9>");
		process.exit(1);
	}
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > 9) {
		console.error(`Invalid channel: ${raw}. Must be an integer from 1 to 9.`);
		process.exit(1);
	}
	return n;
}

/** Rename a device. */
async function deviceRename(
	serial: string,
	name: string | undefined,
	options: OutputOptions,
): Promise<void> {
	if (!name) {
		console.error("Missing required flag: --name <text>");
		process.exit(1);
	}

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const result = await client.renameDevice(serial, name);

		if (options.json) {
			outputJson(result);
			return;
		}

		if (result.success) {
			console.log(`Renamed ${serial} to "${name}".`);
		} else {
			console.error(`Failed to rename device: ${result.error ?? "unknown error"}`);
			process.exit(1);
		}
	} finally {
		client.close();
	}
}

/** Reset min/max readings for a device channel. */
async function deviceResetMinMax(
	serial: string,
	channelRaw: string | undefined,
	options: OutputOptions,
): Promise<void> {
	const channel = parseChannel(channelRaw);

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const result = await client.resetMinMax(serial, channel);

		if (options.json) {
			outputJson(result);
			return;
		}

		if (result.success) {
			console.log(`Min/max reset for ${serial} channel ${channel}.`);
		} else {
			console.error(`Failed to reset min/max: ${result.error ?? "unknown error"}`);
			process.exit(1);
		}
	} finally {
		client.close();
	}
}

/**
 * Route `thermoworks device <subcommand> <serial> [flags]` to the
 * appropriate handler.
 */
export async function device(args: string[], options: OutputOptions): Promise<void> {
	const { name, channelRaw, positional } = parseDeviceArgs(args);
	const subcommand = positional[0];
	const serial = positional[1];

	if (!subcommand || !serial) {
		console.error(USAGE);
		process.exit(1);
	}

	switch (subcommand) {
		case "rename":
			await deviceRename(serial, name, options);
			break;
		case "reset-minmax":
			await deviceResetMinMax(serial, channelRaw, options);
			break;
		default:
			console.error(`Unknown device command: ${subcommand}`);
			console.error(USAGE);
			process.exit(1);
	}
}
