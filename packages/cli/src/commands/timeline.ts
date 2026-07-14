import {
	buildCookTimeline,
	type CookTimeline,
	type TemperatureReading,
	ThermoworksCloud,
	toFahrenheit,
} from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Parsed options for the timeline command. */
export interface TimelineCommandOptions {
	serial?: string;
	archive?: string;
	channel?: string;
	targetF?: number;
}

/** Parse args after `timeline`. Returns an error message on failure. */
export function parseTimelineArgs(args: string[]): TimelineCommandOptions | { error: string } {
	const result: TimelineCommandOptions = {};

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
			if (!Number.isFinite(n)) {
				return { error: `--target must be a number, got "${value}"` };
			}
			result.targetF = n;
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

/** Format a whole-minute offset as H:MM. */
export function formatClock(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${hours}:${String(mins).padStart(2, "0")}`;
}

const KIND_LABELS: Record<CookTimeline["events"][number]["kind"], string> = {
	start: "start",
	low: "low",
	stall: "stall",
	target: "target",
	peak: "peak",
	end: "end",
};

/** Format a timeline as human-readable lines. */
export function formatTimeline(timeline: CookTimeline, heading: string): string {
	if (timeline.events.length === 0) {
		return `${heading}\n  No readings to chart.\n`;
	}

	const clockWidth = Math.max(...timeline.events.map((e) => formatClock(e.minuteOffset).length));
	const labelWidth = Math.max(...timeline.events.map((e) => KIND_LABELS[e.kind].length));

	const lines = [heading];
	for (const event of timeline.events) {
		const clock = formatClock(event.minuteOffset).padStart(clockWidth);
		const label = KIND_LABELS[event.kind].padEnd(labelWidth);
		lines.push(`  ${clock}  ${roundTemp(event.tempF)}\u00B0F  ${label}  ${event.detail}`);
	}

	if (timeline.minTempF !== null && timeline.maxTempF !== null) {
		lines.push(
			`  Min ${roundTemp(timeline.minTempF)}\u00B0F, max ${roundTemp(timeline.maxTempF)}\u00B0F over ${timeline.durationMinutes}m.`,
		);
	}

	return `${lines.join("\n")}\n`;
}

function toFahrenheitReadings(readings: TemperatureReading[]): TemperatureReading[] {
	return readings.map((r) => ({
		value: r.units === "C" ? toFahrenheit(r.value) : r.value,
		timestamp: r.timestamp,
		units: "F",
	}));
}

/**
 * Turn a saved archive into an annotated, chronological cook timeline. Marks the
 * start, the low point, the longest stall, the target crossing, the peak, and
 * the end so you can see the shape of a cook at a glance.
 *
 * Defaults to the latest archive. Pass `--archive <id>` for a specific one,
 * `--channel <n>` to pick a probe, `--target <F>` to mark the target crossing,
 * and `--json` for a machine-readable timeline.
 */
export async function timeline(args: string[], options: OutputOptions): Promise<void> {
	const usage =
		"Usage: thermoworks timeline <SERIAL> [--archive ID] [--channel N] [--target F] [--json]";
	const parsed = parseTimelineArgs(args);
	if ("error" in parsed) {
		console.error(parsed.error);
		console.error(usage);
		process.exit(1);
	}

	if (!parsed.serial) {
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

		const channels = archive.channels ?? [];
		const chosen = parsed.channel
			? channels.find((c) => c.number === parsed.channel)
			: channels.find((c) => c.recentReadings.length > 0);

		if (!chosen) {
			console.error(
				parsed.channel
					? `No channel "${parsed.channel}" in archive ${archive.id}.`
					: `Archive ${archive.id} has no channel readings.`,
			);
			process.exit(1);
		}

		const readings = toFahrenheitReadings(chosen.recentReadings);
		const result = buildCookTimeline(readings, { targetF: parsed.targetF });

		if (options.json) {
			outputJson({
				serial: parsed.serial,
				archiveId: archive.id,
				channel: chosen.number,
				...result,
			});
			return;
		}

		const label = chosen.label || `Ch ${chosen.number ?? "?"}`;
		const heading = `Timeline for ${archive.label || archive.id} - ${label} (${readings.length} readings)`;
		process.stdout.write(formatTimeline(result, heading));
	} finally {
		client.close();
	}
}
