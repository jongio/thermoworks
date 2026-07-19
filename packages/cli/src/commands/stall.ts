import { detectStall, type TemperatureReading, ThermoworksCloud } from "thermoworks-sdk";

import { firstPositional } from "../args.js";
import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Parse a named flag value from args (e.g., "--threshold" "3" -> "3"). */
function getFlagValue(args: string[], flag: string): string | undefined {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

/** Parse a positive number flag, exiting with a message when it is invalid. */
function parsePositiveFlag(raw: string | undefined, name: string): number | undefined {
	if (raw === undefined) return undefined;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		console.error(`${name} must be a positive number, got: ${raw}`);
		process.exit(1);
	}
	return n;
}

/** Parsed options for the stall command. */
export interface StallArgs {
	serial: string;
	thresholdDegrees?: number;
	durationMinutes?: number;
}

/**
 * Parse stall-specific CLI args.
 * Expected: stall SERIAL [--threshold DEG] [--duration MIN]
 * Returns null when the serial is missing.
 */
export function parseStallArgs(args: string[]): StallArgs | null {
	const serial = firstPositional(args, ["--threshold", "--duration"]);
	if (!serial) return null;

	const thresholdDegrees = parsePositiveFlag(getFlagValue(args, "--threshold"), "--threshold");
	const durationMinutes = parsePositiveFlag(getFlagValue(args, "--duration"), "--duration");

	return { serial, thresholdDegrees, durationMinutes };
}

/**
 * Report whether a device is in a stall right now, as a one-shot check for
 * scripts and cron jobs. Pulls the device temperature history, runs stall
 * detection over it, and prints the stall state, when it started, how long it
 * has lasted, and the average plateau temperature. When a stall is active it
 * adds a short wrap suggestion. Use `--json` for machine-readable output.
 */
export async function stall(args: string[], options: OutputOptions): Promise<void> {
	const parsed = parseStallArgs(args);
	if (!parsed) {
		console.error(
			"Usage: thermoworks stall <SERIAL> [--threshold <deg>] [--duration <min>] [--json]",
		);
		process.exit(1);
	}

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const history = await client.getHistory(parsed.serial);
		const readings: TemperatureReading[] = history.readings
			.map((r) => ({ value: r.value, timestamp: new Date(r.timestamp), units: r.units }))
			.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

		if (readings.length < 2) {
			console.error(`Not enough history for ${parsed.serial} to assess a stall.`);
			process.exit(1);
		}

		const result = detectStall(readings, {
			thresholdDegrees: parsed.thresholdDegrees,
			durationMinutes: parsed.durationMinutes,
		});

		if (options.json) {
			outputJson({ serial: parsed.serial, ...result });
			return;
		}

		if (!result.isStalling) {
			console.log(`No stall on ${parsed.serial}. The temperature is still moving.`);
			return;
		}

		const units = readings.at(-1)?.units ?? "F";
		console.log(`Stall on ${parsed.serial}:`);
		console.log(`  Started:    ${result.stallStart}`);
		console.log(`  Duration:   ${result.stallDuration} min`);
		console.log(`  Avg temp:   ${result.avgTemp}\u00B0${units}`);
		console.log(
			"  Suggestion: wrap in foil or butcher paper (the Texas crutch) to push through, or hold steady and ride it out.",
		);
	} finally {
		client.close();
	}
}
