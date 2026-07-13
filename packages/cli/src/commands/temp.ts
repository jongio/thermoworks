import { ThermoworksCloud, toCelsius, toFahrenheit } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Parse a named flag value from args (e.g., "--channel" "2" → "2"). */
function getFlagValue(args: string[], flag: string): string | undefined {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

/** Validate an optional channel flag is an integer from 1 to 9. */
function parseChannelFlag(raw: string | undefined): number | undefined {
	if (raw === undefined) return undefined;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > 9) {
		console.error(`Invalid channel: ${raw}. Must be an integer from 1 to 9.`);
		process.exit(1);
	}
	return n;
}

type TempUnitOption = "auto" | "F" | "C";

/** Validate the optional unit conversion flag. */
function parseUnitFlag(raw: string | undefined): TempUnitOption {
	if (raw === undefined) return "auto";
	const normalized = raw.toUpperCase();
	if (normalized === "AUTO") return "auto";
	if (normalized === "F" || normalized === "C") return normalized;
	console.error(`Invalid unit: ${raw}. Must be auto, f, or c.`);
	process.exit(1);
}

/** Convert a temperature reading when an explicit output unit is requested. */
function convertReading(value: number, sourceUnits: string | null, unit: TempUnitOption) {
	if (unit === "auto") return { value, units: sourceUnits };
	if (sourceUnits !== "F" && sourceUnits !== "C") {
		console.error(`Cannot convert from ${sourceUnits ?? "unknown"} units.`);
		process.exit(1);
	}
	if (sourceUnits === unit) return { value, units: unit };
	return { value: unit === "F" ? toFahrenheit(value) : toCelsius(value), units: unit };
}

/**
 * Print a single temperature value for scripting.
 *
 * - Without `--channel`: prints the device average temperature.
 * - With `--channel N`: prints that channel's current reading.
 * - With `--unit f|c`: converts the value before printing.
 *
 * Human output is a bare number so it can be piped or captured directly
 * (e.g. `if (( $(thermoworks temp ABC123) > 200 )); then ...`). Use `--json`
 * for `{ serial, channel, value, units }`.
 */
export async function temp(args: string[], options: OutputOptions): Promise<void> {
	const serial = args.find((a) => !a.startsWith("--"));
	if (!serial) {
		console.error("Usage: thermoworks temp <SERIAL> [--channel <1-9>] [--unit auto|f|c] [--json]");
		process.exit(1);
	}

	const channel = parseChannelFlag(getFlagValue(args, "--channel"));
	const rawUnit = getFlagValue(args, "--unit");
	const unit = parseUnitFlag(rawUnit);
	const unitSpecified = rawUnit !== undefined;

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		let value: number | null;
		let units: string | null;

		if (channel !== undefined) {
			const ch = await client.getDeviceChannel(serial, channel);
			value = ch.value;
			units = ch.units;
		} else {
			const avg = await client.getAverageTemperature(serial);
			value = avg?.value ?? null;
			units = avg?.units ?? null;
		}

		if (value == null) {
			console.error(
				channel !== undefined
					? `No reading for channel ${channel} on ${serial}.`
					: `No temperature readings for ${serial}.`,
			);
			process.exit(1);
		}

		const sourceUnits = units;
		const converted = convertReading(value, sourceUnits, unit);

		if (options.json) {
			const payload = unitSpecified
				? {
						serial,
						channel: channel ?? null,
						value: converted.value,
						units: converted.units,
						sourceUnits,
					}
				: { serial, channel: channel ?? null, value: converted.value, units: converted.units };
			outputJson(payload);
			return;
		}

		console.log(String(converted.value));
	} finally {
		client.close();
	}
}
