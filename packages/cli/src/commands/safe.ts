import {
	assessPasteurization,
	type PasteurizationResult,
	type Protein,
	ThermoworksCloud,
	toFahrenheit,
} from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

const PROTEINS: Protein[] = ["poultry", "beef", "pork"];

/** Parsed options for the safe command. */
export interface SafeOptions {
	serial?: string;
	channel?: number;
	manualTemperatureF?: number;
	protein: Protein;
	heldMinutes: number;
}

/** Parse a manual temperature value with an optional F/C suffix. Bare values are Fahrenheit. */
export function parseManualTemperature(raw: string | undefined): number | null {
	if (!raw) return null;
	const match = /^(-?\d+(?:\.\d+)?)([fFcC]?)$/.exec(raw.trim());
	if (!match) return null;
	const value = Number(match[1]);
	if (!Number.isFinite(value)) return null;
	const unit = (match[2] ?? "F").toUpperCase();
	if (unit === "C") return toFahrenheit(value);
	if (unit === "F" || unit === "") return value;
	return null;
}

/** Parse args after `safe`. Returns an error message on failure. */
export function parseSafeArgs(args: string[]): SafeOptions | { error: string } {
	const result: SafeOptions = { protein: "poultry", heldMinutes: 0 };

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		if (arg === "--channel") {
			const value = args[++i];
			if (value === undefined) return { error: "--channel requires a value" };
			const n = Number(value);
			if (!Number.isInteger(n) || n < 1 || n > 9) {
				return { error: `--channel must be an integer from 1 to 9, got "${value}"` };
			}
			result.channel = n;
		} else if (arg === "--temp") {
			const value = args[++i];
			if (value === undefined) return { error: "--temp requires a value" };
			const temperature = parseManualTemperature(value);
			if (temperature === null) {
				return { error: `--temp must be a number with optional f or c suffix, got "${value}"` };
			}
			result.manualTemperatureF = temperature;
		} else if (arg === "--protein") {
			const value = args[++i];
			if (value === undefined) return { error: "--protein requires a value" };
			if (!PROTEINS.includes(value as Protein)) {
				return { error: `--protein must be one of: ${PROTEINS.join(", ")}` };
			}
			result.protein = value as Protein;
		} else if (arg === "--held") {
			const value = args[++i];
			if (value === undefined) return { error: "--held requires a value" };
			const held = Number(value);
			if (!Number.isFinite(held) || held < 0) {
				return { error: `--held must be a non-negative number of minutes, got "${value}"` };
			}
			result.heldMinutes = held;
		} else if (arg.startsWith("--")) {
			return { error: `Unknown option: ${arg}` };
		} else if (result.serial === undefined) {
			result.serial = arg;
		} else {
			return { error: `Unexpected argument: ${arg}` };
		}
	}

	if (result.manualTemperatureF !== undefined && result.serial !== undefined) {
		return { error: "--temp cannot be combined with a device serial" };
	}
	if (result.manualTemperatureF !== undefined && result.channel !== undefined) {
		return { error: "--temp cannot be combined with --channel" };
	}

	return result;
}

function roundMinutes(minutes: number): number {
	return minutes >= 10 ? Math.round(minutes) : Math.round(minutes * 10) / 10;
}

/** Format a pasteurization result as human-readable lines. */
export function formatSafe(result: PasteurizationResult, channelLabel: string): string {
	const temp = `${Math.round(result.temperatureF)}\u00B0F`;
	const proteinLabel = result.protein.charAt(0).toUpperCase() + result.protein.slice(1);
	const lines = [`${proteinLabel} on ${channelLabel}: ${temp}`];

	if (result.instant) {
		lines.push(`  Safe now. At or above the instant-safe target of ${result.instantTempF}\u00B0F.`);
	} else if (result.requiredMinutes === null || result.remainingMinutes === null) {
		lines.push(
			`  Too low to pasteurize by holding. Cook to the instant-safe target of ${result.instantTempF}\u00B0F.`,
		);
	} else if (result.safe) {
		lines.push(
			`  Safe now. Held ${roundMinutes(result.heldMinutes)} min, needed ${roundMinutes(
				result.requiredMinutes,
			)} min at this temperature.`,
		);
	} else {
		lines.push(
			`  Safe in ${roundMinutes(result.remainingMinutes)} min. Needs ${roundMinutes(
				result.requiredMinutes,
			)} min held at ${temp} (held ${roundMinutes(result.heldMinutes)} min so far).`,
		);
	}

	lines.push("  Estimate only. Follow official food-safety guidance.");
	return `${lines.join("\n")}\n`;
}

/**
 * Report food-safety pasteurization progress for a probe. Reads the current
 * channel temperature and, using USDA time-at-temperature data, reports whether
 * the food is safe now or how long it must hold at this temperature.
 *
 * Pass `--held <minutes>` to say how long the probe has already held at or above
 * the current temperature (for example from a watch session). Human output is
 * two short lines; use `--json` for a machine-readable result.
 *
 * Pass `--temp <value>[f|c]` to run the same assessment for a manual reading
 * without logging in.
 */
export async function safe(args: string[], options: OutputOptions): Promise<void> {
	const parsed = parseSafeArgs(args);
	if ("error" in parsed) {
		console.error(parsed.error);
		console.error(
			"Usage: thermoworks safe <SERIAL> [--channel <1-9>] [--protein poultry|beef|pork] [--held <minutes>] [--json]\n" +
				"       thermoworks safe --temp <value>[f|c] [--protein poultry|beef|pork] [--held <minutes>] [--json]",
		);
		process.exit(1);
	}

	if (parsed.manualTemperatureF !== undefined) {
		const result = assessPasteurization({
			temperatureF: parsed.manualTemperatureF,
			holdMinutes: parsed.heldMinutes,
			protein: parsed.protein,
		});

		if (options.json) {
			outputJson({
				serial: null,
				channel: null,
				...result,
			});
			return;
		}

		process.stdout.write(formatSafe(result, "manual temperature"));
		return;
	}

	if (!parsed.serial) {
		console.error(
			"Usage: thermoworks safe <SERIAL> [--channel <1-9>] [--protein poultry|beef|pork] [--held <minutes>] [--json]\n" +
				"       thermoworks safe --temp <value>[f|c] [--protein poultry|beef|pork] [--held <minutes>] [--json]",
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
		let value: number | null;
		let units: string | null;

		if (parsed.channel !== undefined) {
			const ch = await client.getDeviceChannel(parsed.serial, parsed.channel);
			value = ch.value;
			units = ch.units;
		} else {
			const avg = await client.getAverageTemperature(parsed.serial);
			value = avg?.value ?? null;
			units = avg?.units ?? null;
		}

		if (value == null) {
			console.error(
				parsed.channel !== undefined
					? `No reading for channel ${parsed.channel} on ${parsed.serial}.`
					: `No temperature readings for ${parsed.serial}.`,
			);
			process.exit(1);
		}

		const temperatureF = units === "C" ? toFahrenheit(value) : value;
		const result = assessPasteurization({
			temperatureF,
			holdMinutes: parsed.heldMinutes,
			protein: parsed.protein,
		});

		if (options.json) {
			outputJson({
				serial: parsed.serial,
				channel: parsed.channel ?? null,
				...result,
			});
			return;
		}

		const channelLabel =
			parsed.channel !== undefined ? `channel ${parsed.channel}` : "device average";
		process.stdout.write(formatSafe(result, channelLabel));
	} finally {
		client.close();
	}
}
