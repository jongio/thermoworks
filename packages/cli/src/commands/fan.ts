import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Parse a named flag value from args (e.g., "--target" "225" → "225"). */
function getFlagValue(args: string[], flag: string): string | undefined {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

const USAGE =
	"Usage: thermoworks fan <SERIAL> | fan set <SERIAL> --target <temp> | fan enable|disable <SERIAL>";

/** Show the current fan controller state for a device. */
async function fanStatus(serial: string, options: OutputOptions): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const state = await client.getFanState(serial);

		if (state === null) {
			if (options.json) {
				outputJson(null);
				return;
			}
			console.log(`No fan controller found for device ${serial}.`);
			return;
		}

		if (options.json) {
			outputJson(state);
			return;
		}

		console.log(`Fan controller for ${serial}:`);
		console.log(`  Connected:   ${state.connected ? "yes" : "no"}`);
		console.log(`  Connection:  ${state.connection ? "enabled" : "disabled"}`);
		console.log(`  Target temp: ${state.setTemp !== null ? state.setTemp : "not set"}`);
		console.log(`  Channel:     ${state.fanChannel ?? "none"}`);
		console.log(`  State:       ${state.state ?? "unknown"}`);
	} finally {
		client.close();
	}
}

/** Set the fan controller target temperature. */
async function fanSet(args: string[], options: OutputOptions): Promise<void> {
	const serial = args[0];
	if (!serial) {
		console.error(USAGE);
		process.exit(1);
	}

	const targetRaw = getFlagValue(args, "--target");
	if (targetRaw === undefined) {
		console.error("Missing required flag: --target <temp>");
		process.exit(1);
	}

	const target = Number(targetRaw);
	if (!Number.isFinite(target)) {
		console.error(`Invalid target temperature: ${targetRaw}. Must be a finite number.`);
		process.exit(1);
	}

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const result = await client.setFanTarget(serial, target);

		if (options.json) {
			outputJson(result);
			return;
		}

		if (result.success) {
			console.log(`Fan target temperature set to ${target} for ${serial}.`);
		} else {
			console.error(`Failed to set fan target: ${result.error ?? "unknown error"}`);
			process.exit(1);
		}
	} finally {
		client.close();
	}
}

/** Enable or disable the fan controller. */
async function fanToggle(serial: string, enabled: boolean, options: OutputOptions): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const result = await client.setFanEnabled(serial, enabled);

		if (options.json) {
			outputJson(result);
			return;
		}

		const action = enabled ? "enabled" : "disabled";
		if (result.success) {
			console.log(`Fan controller ${action} for ${serial}.`);
		} else {
			console.error(
				`Failed to ${enabled ? "enable" : "disable"} fan: ${result.error ?? "unknown error"}`,
			);
			process.exit(1);
		}
	} finally {
		client.close();
	}
}

/**
 * Route `thermoworks fan <SERIAL>` or `thermoworks fan <subcommand> <SERIAL> [flags]`
 * to the appropriate handler.
 */
export async function fan(args: string[], options: OutputOptions): Promise<void> {
	const subcommand = args[0];

	if (!subcommand) {
		console.error(USAGE);
		process.exit(1);
	}

	switch (subcommand) {
		case "set":
			await fanSet(args.slice(1), options);
			break;
		case "enable": {
			const serial = args[1];
			if (!serial) {
				console.error(USAGE);
				process.exit(1);
			}
			await fanToggle(serial, true, options);
			break;
		}
		case "disable": {
			const serial = args[1];
			if (!serial) {
				console.error(USAGE);
				process.exit(1);
			}
			await fanToggle(serial, false, options);
			break;
		}
		default:
			// Treat subcommand as a SERIAL for the status view
			await fanStatus(subcommand, options);
			break;
	}
}
