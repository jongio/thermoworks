import {
	assessCooling,
	type CoolingAssessment,
	type CoolingSample,
	FDA_STAGE1_START_F,
	type HistoricalReading,
	ThermoworksCloud,
	toFahrenheit,
} from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Parsed options for the cooldown command. */
export interface CooldownCommandOptions {
	serial?: string;
	readings?: CoolingSample[];
	stage1LimitHours?: number;
	stage2LimitHours?: number;
}

function parseReadingsList(raw: string): CoolingSample[] | { error: string } {
	const samples: CoolingSample[] = [];
	const parts = raw
		.split(",")
		.map((p) => p.trim())
		.filter((p) => p.length > 0);

	if (parts.length === 0) {
		return { error: "--readings needs at least one temp@minutes pair" };
	}

	for (const part of parts) {
		const [tempRaw, minutesRaw] = part.split("@");
		if (tempRaw === undefined || minutesRaw === undefined) {
			return { error: `--readings entry "${part}" must look like temp@minutes` };
		}
		const tempF = Number(tempRaw);
		const minutes = Number(minutesRaw);
		if (!Number.isFinite(tempF)) {
			return { error: `--readings temperature "${tempRaw}" is not a number` };
		}
		if (!Number.isFinite(minutes) || minutes < 0) {
			return { error: `--readings minutes "${minutesRaw}" must be zero or greater` };
		}
		samples.push({ tempF, minutes });
	}

	return samples;
}

/** Parse args after `cooldown`. Returns an error message on failure. */
export function parseCooldownArgs(args: string[]): CooldownCommandOptions | { error: string } {
	const result: CooldownCommandOptions = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		if (arg === "--readings") {
			const value = args[++i];
			if (value === undefined) return { error: "--readings requires a value" };
			const parsed = parseReadingsList(value);
			if ("error" in parsed) return parsed;
			result.readings = parsed;
		} else if (arg === "--stage1-limit") {
			const value = args[++i];
			if (value === undefined) return { error: "--stage1-limit requires a value" };
			const n = Number(value);
			if (!Number.isFinite(n) || n <= 0) {
				return { error: `--stage1-limit must be a positive number of hours, got "${value}"` };
			}
			result.stage1LimitHours = n;
		} else if (arg === "--stage2-limit") {
			const value = args[++i];
			if (value === undefined) return { error: "--stage2-limit requires a value" };
			const n = Number(value);
			if (!Number.isFinite(n) || n <= 0) {
				return { error: `--stage2-limit must be a positive number of hours, got "${value}"` };
			}
			result.stage2LimitHours = n;
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

/** Convert device history readings into Fahrenheit cooling samples. */
export function historyToCoolingSamples(readings: HistoricalReading[]): CoolingSample[] {
	if (readings.length === 0) return [];
	const firstReading = readings[0];
	if (!firstReading) return [];
	const startMs = new Date(firstReading.timestamp).getTime();

	return readings.map((reading) => {
		const tempF = reading.units === "C" ? toFahrenheit(reading.value) : reading.value;
		const minutes = (new Date(reading.timestamp).getTime() - startMs) / (1000 * 60);
		return { tempF, minutes };
	});
}

function formatMinutes(minutes: number): string {
	const whole = Math.round(minutes);
	if (whole < 60) return `${whole} min`;
	const hours = Math.floor(whole / 60);
	const rest = whole % 60;
	return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function formatStage(stage: CoolingAssessment["stage1"], fromF: number, label: string): string {
	const target = `${Math.round(stage.targetF)}\u00B0F`;
	const from = `${Math.round(fromF)}\u00B0F`;
	const limit = formatMinutes(stage.limitMinutes);

	if (!stage.reached) {
		return `  ${label} (${from} to ${target}): not reached in the data. Limit is ${limit}.`;
	}

	const elapsed = formatMinutes(stage.elapsedMinutes ?? 0);
	if (stage.withinLimit) {
		const spare = formatMinutes(stage.marginMinutes ?? 0);
		return `  ${label} (${from} to ${target}): reached in ${elapsed}, ${spare} to spare. PASS`;
	}
	const over = formatMinutes(Math.abs(stage.marginMinutes ?? 0));
	return `  ${label} (${from} to ${target}): reached in ${elapsed}, ${over} over the ${limit} limit. FAIL`;
}

/** Format a cooling assessment as human-readable lines. */
export function formatCooling(assessment: CoolingAssessment, source: string): string {
	if (!assessment.entered) {
		return `Cooling check for ${source}: no reading has dropped to ${Math.round(
			FDA_STAGE1_START_F,
		)}\u00B0F yet, so the cooling clock has not started.\n`;
	}

	const verdict = assessment.safe
		? "Safe. Both stages met the FDA cooling deadlines."
		: "Not safe. At least one stage missed its deadline.";
	const lines = [`Cooling check for ${source}: ${verdict}`];

	if (assessment.entryUncertain) {
		lines.push(
			`  Heads up: the first reading was already at ${Math.round(
				assessment.entryTempF ?? 0,
			)}\u00B0F, so the real danger-zone entry may be earlier than shown.`,
		);
	}

	lines.push(formatStage(assessment.stage1, FDA_STAGE1_START_F, "Stage 1"));
	lines.push(formatStage(assessment.stage2, FDA_STAGE1_START_F, "Stage 2"));

	return `${lines.join("\n")}\n`;
}

/**
 * Check a cooling curve against the FDA two-stage cooling rule: food should
 * drop from 135F to 70F within two hours, and to 41F within six hours total.
 *
 * Reads the device's recent history, or pass `--readings "135@0,70@90,41@300"`
 * (temperatures in Fahrenheit, minutes elapsed) to run the check offline. Tune
 * the deadlines with `--stage1-limit` and `--stage2-limit` in hours.
 */
export async function cooldown(args: string[], options: OutputOptions): Promise<void> {
	const usage =
		"Usage: thermoworks cooldown <SERIAL> [--stage1-limit <hours>] [--stage2-limit <hours>] [--json]\n" +
		'   or: thermoworks cooldown --readings "135@0,70@90,41@300" [--json]';
	const parsed = parseCooldownArgs(args);
	if ("error" in parsed) {
		console.error(parsed.error);
		console.error(usage);
		process.exit(1);
	}

	const coolingOptions = {
		stage1LimitHours: parsed.stage1LimitHours,
		stage2LimitHours: parsed.stage2LimitHours,
	};

	// Offline path: assess the readings the user supplied, no login needed.
	if (parsed.readings) {
		const assessment = assessCooling(parsed.readings, coolingOptions);
		if (options.json) {
			outputJson({ source: "readings", ...assessment });
			return;
		}
		process.stdout.write(formatCooling(assessment, "supplied readings"));
		return;
	}

	if (!parsed.serial) {
		console.error("Provide a device serial or --readings.");
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
		const samples = historyToCoolingSamples(data.readings);

		if (samples.length === 0) {
			console.error(`No history available for ${parsed.serial}.`);
			process.exit(1);
		}

		const assessment = assessCooling(samples, coolingOptions);

		if (options.json) {
			outputJson({ serial: parsed.serial, ...assessment });
			return;
		}

		process.stdout.write(formatCooling(assessment, parsed.serial));
	} finally {
		client.close();
	}
}
