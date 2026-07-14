import {
	assessWrap,
	DEFAULT_WRAP_AT_F,
	type TemperatureReading,
	ThermoworksCloud,
	toFahrenheit,
	type WrapResult,
} from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Parsed options for the wrap command. */
export interface WrapCommandOptions {
	serial?: string;
	targetF?: number;
	wrapAtF?: number;
	limit?: number;
}

/** Parse args after `wrap`. Returns an error message on failure. */
export function parseWrapArgs(args: string[]): WrapCommandOptions | { error: string } {
	const result: WrapCommandOptions = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		if (arg === "--target") {
			const value = args[++i];
			if (value === undefined) return { error: "--target requires a value" };
			const n = Number(value);
			if (!Number.isFinite(n)) {
				return { error: `--target must be a number, got "${value}"` };
			}
			result.targetF = n;
		} else if (arg === "--wrap-at") {
			const value = args[++i];
			if (value === undefined) return { error: "--wrap-at requires a value" };
			const n = Number(value);
			if (!Number.isFinite(n)) {
				return { error: `--wrap-at must be a number, got "${value}"` };
			}
			result.wrapAtF = n;
		} else if (arg === "--limit") {
			const value = args[++i];
			if (value === undefined) return { error: "--limit requires a value" };
			const n = Number(value);
			if (!Number.isInteger(n) || n < 1) {
				return { error: `--limit must be a positive integer, got "${value}"` };
			}
			result.limit = n;
		} else if (arg.startsWith("--")) {
			return { error: `Unknown option: ${arg}` };
		} else if (result.serial === undefined) {
			result.serial = arg;
		} else {
			return { error: `Unexpected argument: ${arg}` };
		}
	}

	return result;
}

function roundTemp(value: number): number {
	return Math.round(value * 10) / 10;
}

const HEADLINES: Record<WrapResult["recommendation"], string> = {
	"wrap-now": "Wrap now",
	hold: "Hold off",
	"below-window": "Too early",
	"at-target": "Done",
	"no-data": "No data",
};

/** Format a wrap result as human-readable lines. */
export function formatWrap(result: WrapResult, serial: string): string {
	const headline = HEADLINES[result.recommendation];
	const lines = [`Wrap check for ${serial}: ${headline}`, `  ${result.reason}`];

	if (result.currentTempF !== null) {
		const statusBits = [
			`current ${roundTemp(result.currentTempF)}\u00B0F`,
			`target ${roundTemp(result.targetTempF)}\u00B0F`,
			`wrap window ${roundTemp(result.wrapAtF)}\u00B0F`,
		];
		lines.push(`  ${statusBits.join(", ")}`);
		if (result.isStalling) {
			lines.push(`  Stalled for ${result.stallDuration}m.`);
		} else {
			lines.push(`  Rate ${roundTemp(result.ratePer5Min)}\u00B0F/5min.`);
		}
	}

	return `${lines.join("\n")}\n`;
}

/**
 * Advise whether to wrap the cook now (the "Texas crutch"). Reads the trailing
 * probe history for a device, then combines the current temperature, the wrap
 * window, stall detection, and rate of change into a single call: wrap now,
 * hold, too early, or done.
 *
 * Readings come from the device history series, matching `history` and `graph`.
 * Pass `--wrap-at <F>` to move the wrap window (default 160), `--limit <N>` to
 * look at only the most recent N readings, and `--json` for a machine-readable
 * result.
 */
export async function wrap(args: string[], options: OutputOptions): Promise<void> {
	const usage =
		"Usage: thermoworks wrap <SERIAL> --target <F> [--wrap-at <F>] [--limit <N>] [--json]";
	const parsed = parseWrapArgs(args);
	if ("error" in parsed) {
		console.error(parsed.error);
		console.error(usage);
		process.exit(1);
	}

	if (!parsed.serial) {
		console.error(usage);
		process.exit(1);
	}

	if (parsed.targetF === undefined) {
		console.error("--target is required");
		console.error(usage);
		process.exit(1);
	}

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const data = await client.getHistory(parsed.serial);
		const source = parsed.limit ? data.readings.slice(-parsed.limit) : data.readings;
		const readings: TemperatureReading[] = source.map((r) => ({
			value: r.units === "C" ? toFahrenheit(r.value) : r.value,
			timestamp: new Date(r.timestamp),
			units: "F",
		}));

		const result = assessWrap({
			readings,
			targetF: parsed.targetF,
			wrapAtF: parsed.wrapAtF ?? DEFAULT_WRAP_AT_F,
		});

		if (options.json) {
			outputJson({
				serial: parsed.serial,
				readingCount: readings.length,
				...result,
			});
			return;
		}

		process.stdout.write(formatWrap(result, parsed.serial));
	} finally {
		client.close();
	}
}
