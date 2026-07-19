import {
	type ArchiveChannel,
	analyzePitStability,
	type PitStabilityResult,
	type TemperatureReading,
	ThermoworksCloud,
	toFahrenheit,
} from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Parsed options for the stability command. */
export interface StabilityCommandOptions {
	serial?: string;
	archive?: string;
	channel?: string;
	targetF?: number;
	bandF?: number;
}

/** Parse args after `stability`. Returns an error message on failure. */
export function parseStabilityArgs(args: string[]): StabilityCommandOptions | { error: string } {
	const result: StabilityCommandOptions = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		if (arg === "--archive") {
			const value = args[++i];
			if (value === undefined) return { error: "--archive requires an id" };
			result.archive = value;
		} else if (arg === "--channel") {
			const value = args[++i];
			if (value === undefined) return { error: "--channel requires a channel number" };
			result.channel = value;
		} else if (arg === "--target") {
			const value = args[++i];
			if (value === undefined) return { error: "--target requires a value" };
			const n = Number(value);
			if (!Number.isFinite(n)) return { error: `--target must be a number, got "${value}"` };
			result.targetF = n;
		} else if (arg === "--band") {
			const value = args[++i];
			if (value === undefined) return { error: "--band requires a value" };
			const n = Number(value);
			if (!Number.isFinite(n) || n <= 0) {
				return { error: `--band must be a positive number, got "${value}"` };
			}
			result.bandF = n;
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

function formatDuration(minutes: number): string {
	const rounded = Math.round(minutes);
	const hours = Math.floor(rounded / 60);
	const mins = rounded % 60;
	if (hours > 0) return `${hours}h ${mins}m`;
	return `${mins}m`;
}

function formatTemp(value: number | null): string {
	return value == null ? "-" : `${roundTemp(value)}°F`;
}

/** Format stability stats as human-readable text. */
export function formatStability(result: PitStabilityResult, heading: string): string {
	const lines = [
		heading,
		`  Target:       ${roundTemp(result.targetF)}°F ±${roundTemp(result.bandF)}°F (${roundTemp(
			result.lowLimitF,
		)}-${roundTemp(result.highLimitF)}°F)`,
		`  Duration:     ${formatDuration(result.durationMinutes)} (${result.sampleCount} samples)`,
		`  In band:      ${formatDuration(result.inBandMinutes)} (${result.inBandPercent}%)`,
		`  High:         ${formatDuration(result.highMinutes)}`,
		`  Low:          ${formatDuration(result.lowMinutes)}`,
		`  Avg/min/max:  ${formatTemp(result.averageTempF)} / ${formatTemp(result.minTempF)} / ${formatTemp(
			result.maxTempF,
		)}`,
	];

	if (result.longestExcursion) {
		lines.push(
			`  Longest miss: ${result.longestExcursion.direction} for ${formatDuration(
				result.longestExcursion.durationMinutes,
			)}, peaked at ${formatTemp(result.longestExcursion.peakTempF)}`,
		);
	} else {
		lines.push("  Longest miss: none");
	}

	return `${lines.join("\n")}\n`;
}

function toFahrenheitReadings(readings: TemperatureReading[]): TemperatureReading[] {
	return readings.map((reading) => ({
		value: reading.units === "C" ? toFahrenheit(reading.value) : reading.value,
		timestamp: reading.timestamp,
		units: "F",
	}));
}

function chooseChannel(
	channels: ArchiveChannel[],
	channelNumber: string | undefined,
	archiveId: string,
): ArchiveChannel | { error: string } {
	if (channelNumber) {
		return (
			channels.find((channel) => channel.number === channelNumber) ?? {
				error: `No channel "${channelNumber}" in archive ${archiveId}.`,
			}
		);
	}
	return (
		channels.find((channel) => channel.recentReadings.length > 0) ?? {
			error: `Archive ${archiveId} has no channel readings.`,
		}
	);
}

/**
 * Analyze how steadily an archived pit channel held a target temperature.
 */
export async function stability(args: string[], options: OutputOptions): Promise<void> {
	const usage =
		"Usage: thermoworks stability <SERIAL> --target F [--band F] [--archive ID] [--channel N] [--json]";
	const parsed = parseStabilityArgs(args);
	if ("error" in parsed) {
		console.error(parsed.error);
		console.error(usage);
		process.exit(1);
	}
	if (!parsed.serial || parsed.targetF === undefined) {
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
		const archive = parsed.archive
			? await client.getArchive(parsed.serial, parsed.archive)
			: (await client.getArchives(parsed.serial, { limit: 1 }))[0];

		if (!archive) {
			console.error(`No archives found for device ${parsed.serial}.`);
			process.exit(1);
		}

		const selected = chooseChannel(archive.channels ?? [], parsed.channel, archive.id);
		if ("error" in selected) {
			console.error(selected.error);
			process.exit(1);
		}

		if (selected.recentReadings.length === 0) {
			console.error(`Channel ${selected.number ?? "?"} in archive ${archive.id} has no readings.`);
			process.exit(1);
		}

		const readings = toFahrenheitReadings(selected.recentReadings);
		const result = analyzePitStability(readings, {
			targetF: parsed.targetF,
			bandF: parsed.bandF,
		});

		if (options.json) {
			outputJson({
				serial: parsed.serial,
				archiveId: archive.id,
				channel: selected.number,
				...result,
			});
			return;
		}

		const label = selected.label || `Ch ${selected.number ?? "?"}`;
		const heading = `Pit stability for ${archive.label || archive.id} - ${label}`;
		process.stdout.write(formatStability(result, heading));
	} finally {
		client.close();
	}
}
