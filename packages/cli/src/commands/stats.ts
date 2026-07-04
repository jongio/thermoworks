import { type Archive, ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Parsed arguments specific to the `stats` command. */
export interface StatsArgs {
	serial: string;
	limit?: number;
}

/**
 * Parse command-specific args for `stats`.
 * Expected: `stats SERIAL [--limit N]`
 * Returns null if serial is missing.
 */
export function parseStatsArgs(args: string[]): StatsArgs | null {
	const positional: string[] = [];
	let limit: number | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--limit") {
			const next = args[++i];
			if (next) limit = Number.parseInt(next, 10);
		} else if (arg && !arg.startsWith("--")) {
			positional.push(arg);
		}
	}

	// positional[0] is "stats" (the command name), positional[1] is the serial
	const serial = positional[1];
	if (!serial) return null;

	return { serial, limit };
}

/** A named cook session paired with its duration in milliseconds. */
export interface SessionDuration {
	id: string;
	label: string;
	durationMs: number;
}

/** Aggregated statistics across a device's archived cook sessions. */
export interface CookStats {
	totalArchives: number;
	sessionsWithDuration: number;
	totalDurationMs: number;
	averageDurationMs: number | null;
	medianDurationMs: number | null;
	longest: SessionDuration | null;
	shortest: SessionDuration | null;
	totalReadings: number;
	earliestStart: Date | null;
	latestEnd: Date | null;
}

function durationMs(archive: Archive): number | null {
	if (!archive.start || !archive.end) return null;
	const ms = archive.end.getTime() - archive.start.getTime();
	return ms >= 0 ? ms : null;
}

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
	}
	return sorted[mid] as number;
}

/**
 * Compute aggregate statistics from a list of archives. Archives without a
 * usable start and end are counted in `totalArchives` but excluded from the
 * duration figures. Pure and deterministic for straightforward testing.
 */
export function computeStats(archives: Archive[]): CookStats {
	const durations: SessionDuration[] = [];
	let totalReadings = 0;
	let earliestStart: Date | null = null;
	let latestEnd: Date | null = null;

	for (const archive of archives) {
		totalReadings += archive.count ?? 0;

		if (archive.start && (!earliestStart || archive.start < earliestStart)) {
			earliestStart = archive.start;
		}
		if (archive.end && (!latestEnd || archive.end > latestEnd)) {
			latestEnd = archive.end;
		}

		const ms = durationMs(archive);
		if (ms != null) {
			durations.push({ id: archive.id, label: archive.label || archive.id, durationMs: ms });
		}
	}

	const durationValues = durations.map((d) => d.durationMs);
	const totalDurationMs = durationValues.reduce((sum, ms) => sum + ms, 0);

	let longest: SessionDuration | null = null;
	let shortest: SessionDuration | null = null;
	for (const session of durations) {
		if (!longest || session.durationMs > longest.durationMs) longest = session;
		if (!shortest || session.durationMs < shortest.durationMs) shortest = session;
	}

	return {
		totalArchives: archives.length,
		sessionsWithDuration: durations.length,
		totalDurationMs,
		averageDurationMs: durations.length > 0 ? totalDurationMs / durations.length : null,
		medianDurationMs: median(durationValues),
		longest,
		shortest,
		totalReadings,
		earliestStart,
		latestEnd,
	};
}

/** Format a millisecond duration as a compact `Nh Nm` (or `Nm`) string. */
export function formatDurationMs(ms: number | null): string {
	if (ms == null) return "-";
	const totalMinutes = Math.round(ms / 60000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

function formatDateTime(date: Date | null): string {
	if (!date) return "-";
	return date.toLocaleString();
}

/** Render cook statistics as human-readable text. */
export function formatStats(serial: string, stats: CookStats): string {
	const lines: string[] = [];
	lines.push(`Cook statistics for ${serial}`);
	lines.push("");
	lines.push(`  Archived sessions:   ${stats.totalArchives}`);

	if (stats.sessionsWithDuration === 0) {
		lines.push("");
		lines.push("  No sessions with a recorded start and end to summarize.");
		return lines.join("\n");
	}

	lines.push(`  Sessions with times: ${stats.sessionsWithDuration}`);
	lines.push(`  Total cook time:     ${formatDurationMs(stats.totalDurationMs)}`);
	lines.push(`  Average cook time:   ${formatDurationMs(stats.averageDurationMs)}`);
	lines.push(`  Median cook time:    ${formatDurationMs(stats.medianDurationMs)}`);
	lines.push(`  Total readings:      ${stats.totalReadings}`);

	if (stats.longest) {
		lines.push(
			`  Longest cook:        ${formatDurationMs(stats.longest.durationMs)}  (${stats.longest.label})`,
		);
	}
	if (stats.shortest) {
		lines.push(
			`  Shortest cook:       ${formatDurationMs(stats.shortest.durationMs)}  (${stats.shortest.label})`,
		);
	}

	lines.push(`  First session start: ${formatDateTime(stats.earliestStart)}`);
	lines.push(`  Last session end:    ${formatDateTime(stats.latestEnd)}`);

	return lines.join("\n");
}

function toSeconds(ms: number | null): number | null {
	return ms == null ? null : Math.round(ms / 1000);
}

/** Build a machine-readable stats object for `--json` output. */
export function toJsonStats(serial: string, stats: CookStats): Record<string, unknown> {
	return {
		serial,
		totalArchives: stats.totalArchives,
		sessionsWithDuration: stats.sessionsWithDuration,
		totalDurationSeconds: toSeconds(stats.totalDurationMs),
		averageDurationSeconds: toSeconds(stats.averageDurationMs),
		medianDurationSeconds: toSeconds(stats.medianDurationMs),
		totalReadings: stats.totalReadings,
		longest: stats.longest
			? {
					id: stats.longest.id,
					label: stats.longest.label,
					durationSeconds: toSeconds(stats.longest.durationMs),
				}
			: null,
		shortest: stats.shortest
			? {
					id: stats.shortest.id,
					label: stats.shortest.label,
					durationSeconds: toSeconds(stats.shortest.durationMs),
				}
			: null,
		earliestStart: stats.earliestStart ? stats.earliestStart.toISOString() : null,
		latestEnd: stats.latestEnd ? stats.latestEnd.toISOString() : null,
	};
}

/**
 * Summarize a device's archived cook sessions: session count, total, average,
 * and median duration, longest and shortest cooks, total readings, and the
 * overall date range.
 */
export async function stats(
	parsedArgs: StatsArgs,
	options: OutputOptions = { json: false },
): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const archiveList = await client.getArchives(
			parsedArgs.serial,
			parsedArgs.limit ? { limit: parsedArgs.limit } : undefined,
		);
		const computed = computeStats(archiveList);

		if (options.json) {
			outputJson(toJsonStats(parsedArgs.serial, computed));
			return;
		}

		console.log(formatStats(parsedArgs.serial, computed));
	} finally {
		client.close();
	}
}
