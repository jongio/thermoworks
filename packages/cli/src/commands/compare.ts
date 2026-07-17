import type { Archive, ArchiveChannel } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

// ─── Argument parsing ────────────────────────────────────────────────────────

/** Parsed arguments for `archives compare`. */
export interface CompareArgs {
	serial: string;
	archiveA: string;
	archiveB: string;
}

/**
 * Parse command-specific args for `archives compare`.
 * Expected: `archives compare SERIAL ARCHIVE_A ARCHIVE_B`
 * Returns null if any required positional is missing.
 */
export function parseCompareArgs(args: string[]): CompareArgs | null {
	const positional: string[] = [];

	for (const arg of args) {
		if (arg && !arg.startsWith("--")) {
			positional.push(arg);
		}
	}

	// positional: ["archives", "compare", SERIAL, ID_A, ID_B]
	const serial = positional[2];
	const archiveA = positional[3];
	const archiveB = positional[4];

	if (!serial || !archiveA || !archiveB) return null;

	return { serial, archiveA, archiveB };
}

// ─── Channel comparison ──────────────────────────────────────────────────────

/** Per-channel comparison metrics for one archive. */
export interface ChannelSummary {
	label: string;
	units: string;
	min: number | null;
	max: number | null;
	last: number | null;
	avg: number | null;
}

/** Side-by-side channel comparison. */
export interface ChannelComparison {
	label: string;
	units: string;
	a: ChannelSummary;
	b: ChannelSummary;
	diff: {
		min: number | null;
		max: number | null;
		last: number | null;
		avg: number | null;
	};
}

function channelLabel(ch: ArchiveChannel): string {
	return ch.label || `Ch ${ch.number ?? "?"}`;
}

function channelAverage(ch: ArchiveChannel): number | null {
	if (ch.recentReadings.length === 0) return null;
	const sum = ch.recentReadings.reduce((acc, r) => acc + r.value, 0);
	return sum / ch.recentReadings.length;
}

function summarizeChannel(ch: ArchiveChannel): ChannelSummary {
	return {
		label: channelLabel(ch),
		units: ch.units ?? "",
		min: ch.minimum?.value ?? null,
		max: ch.maximum?.value ?? null,
		last: ch.value ?? null,
		avg: channelAverage(ch),
	};
}

function numericDiff(a: number | null, b: number | null): number | null {
	if (a == null || b == null) return null;
	return b - a;
}

// ─── Comparison computation ──────────────────────────────────────────────────

/** Top-level comparison result between two archives. */
export interface ComparisonResult {
	serial: string;
	archiveA: {
		id: string;
		label: string;
		start: Date | null;
		end: Date | null;
		durationMs: number | null;
		readingCount: number;
		channelCount: number;
	};
	archiveB: {
		id: string;
		label: string;
		start: Date | null;
		end: Date | null;
		durationMs: number | null;
		readingCount: number;
		channelCount: number;
	};
	durationDiffMs: number | null;
	readingCountDiff: number;
	channels: ChannelComparison[];
}

function archiveDurationMs(archive: Archive): number | null {
	if (!archive.start || !archive.end) return null;
	const ms = archive.end.getTime() - archive.start.getTime();
	return ms >= 0 ? ms : null;
}

/**
 * Compute a structured comparison between two archives. Pure and
 * deterministic for straightforward testing.
 */
export function computeComparison(serial: string, a: Archive, b: Archive): ComparisonResult {
	const durA = archiveDurationMs(a);
	const durB = archiveDurationMs(b);

	const countA = a.count ?? 0;
	const countB = b.count ?? 0;

	const channelsA = a.channels ?? [];
	const channelsB = b.channels ?? [];

	// Build a union of channel labels from both archives, preserving order.
	// Match channels by label (falling back to number).
	const channelMapA = new Map<string, ArchiveChannel>();
	for (const ch of channelsA) channelMapA.set(channelLabel(ch), ch);

	const channelMapB = new Map<string, ArchiveChannel>();
	for (const ch of channelsB) channelMapB.set(channelLabel(ch), ch);

	const seenLabels = new Set<string>();
	const orderedLabels: string[] = [];
	for (const ch of channelsA) {
		const label = channelLabel(ch);
		if (!seenLabels.has(label)) {
			seenLabels.add(label);
			orderedLabels.push(label);
		}
	}
	for (const ch of channelsB) {
		const label = channelLabel(ch);
		if (!seenLabels.has(label)) {
			seenLabels.add(label);
			orderedLabels.push(label);
		}
	}

	const emptyChannel = (label: string, units: string): ChannelSummary => ({
		label,
		units,
		min: null,
		max: null,
		last: null,
		avg: null,
	});

	const channels: ChannelComparison[] = orderedLabels.map((label) => {
		const chA = channelMapA.get(label);
		const chB = channelMapB.get(label);
		const summaryA = chA ? summarizeChannel(chA) : emptyChannel(label, chB?.units ?? "");
		const summaryB = chB ? summarizeChannel(chB) : emptyChannel(label, chA?.units ?? "");
		const units = summaryA.units || summaryB.units;

		return {
			label,
			units,
			a: summaryA,
			b: summaryB,
			diff: {
				min: numericDiff(summaryA.min, summaryB.min),
				max: numericDiff(summaryA.max, summaryB.max),
				last: numericDiff(summaryA.last, summaryB.last),
				avg:
					summaryA.avg != null && summaryB.avg != null
						? Math.round((summaryB.avg - summaryA.avg) * 100) / 100
						: null,
			},
		};
	});

	return {
		serial,
		archiveA: {
			id: a.id,
			label: a.label || a.id,
			start: a.start,
			end: a.end,
			durationMs: durA,
			readingCount: countA,
			channelCount: channelsA.length,
		},
		archiveB: {
			id: b.id,
			label: b.label || b.id,
			start: b.start,
			end: b.end,
			durationMs: durB,
			readingCount: countB,
			channelCount: channelsB.length,
		},
		durationDiffMs: numericDiff(durA, durB),
		readingCountDiff: countB - countA,
		channels,
	};
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/** Format milliseconds as `Nh Nm` or `Nm`. */
function formatDurationMs(ms: number | null): string {
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

function formatTemp(value: number | null, units: string): string {
	if (value == null) return "-";
	return `${value}\u00B0${units}`;
}

function formatDiff(value: number | null, units: string): string {
	if (value == null) return "-";
	const sign = value > 0 ? "+" : "";
	return `${sign}${value}\u00B0${units}`;
}

function formatDurationDiff(ms: number | null): string {
	if (ms == null) return "-";
	const sign = ms > 0 ? "+" : "";
	return `${sign}${formatDurationMs(Math.abs(ms))}`;
}

/** Render a human-readable comparison table. */
export function formatComparison(result: ComparisonResult): string {
	const lines: string[] = [];
	const labelA = result.archiveA.label;
	const labelB = result.archiveB.label;

	lines.push(`Comparing archives for ${result.serial}`);
	lines.push("");

	// Header row
	lines.push(`  ${"".padEnd(16)}  ${labelA.padEnd(20)}  ${labelB.padEnd(20)}  Diff`);
	lines.push(
		`  ${"".padEnd(16)}  ${"".padEnd(20, "\u2500")}  ${"".padEnd(20, "\u2500")}  ${"".padEnd(15, "\u2500")}`,
	);

	// Duration
	lines.push(
		`  ${"Duration".padEnd(16)}  ${formatDurationMs(result.archiveA.durationMs).padEnd(20)}  ${formatDurationMs(result.archiveB.durationMs).padEnd(20)}  ${formatDurationDiff(result.durationDiffMs)}`,
	);

	// Start
	lines.push(
		`  ${"Start".padEnd(16)}  ${formatDateTime(result.archiveA.start).padEnd(20)}  ${formatDateTime(result.archiveB.start).padEnd(20)}`,
	);

	// End
	lines.push(
		`  ${"End".padEnd(16)}  ${formatDateTime(result.archiveA.end).padEnd(20)}  ${formatDateTime(result.archiveB.end).padEnd(20)}`,
	);

	// Readings
	const diffSign = result.readingCountDiff > 0 ? "+" : "";
	lines.push(
		`  ${"Readings".padEnd(16)}  ${String(result.archiveA.readingCount).padEnd(20)}  ${String(result.archiveB.readingCount).padEnd(20)}  ${diffSign}${result.readingCountDiff}`,
	);

	// Channels
	lines.push(
		`  ${"Channels".padEnd(16)}  ${String(result.archiveA.channelCount).padEnd(20)}  ${String(result.archiveB.channelCount).padEnd(20)}`,
	);

	// Per-channel details
	if (result.channels.length > 0) {
		lines.push("");
		lines.push("  Per-channel comparison:");

		for (const ch of result.channels) {
			lines.push("");
			lines.push(`    ${ch.label} (${ch.units || "?"})`);
			lines.push(
				`      ${"Min".padEnd(8)}  ${formatTemp(ch.a.min, ch.units).padEnd(20)}  ${formatTemp(ch.b.min, ch.units).padEnd(20)}  ${formatDiff(ch.diff.min, ch.units)}`,
			);
			lines.push(
				`      ${"Max".padEnd(8)}  ${formatTemp(ch.a.max, ch.units).padEnd(20)}  ${formatTemp(ch.b.max, ch.units).padEnd(20)}  ${formatDiff(ch.diff.max, ch.units)}`,
			);
			lines.push(
				`      ${"Last".padEnd(8)}  ${formatTemp(ch.a.last, ch.units).padEnd(20)}  ${formatTemp(ch.b.last, ch.units).padEnd(20)}  ${formatDiff(ch.diff.last, ch.units)}`,
			);
			lines.push(
				`      ${"Avg".padEnd(8)}  ${formatTemp(ch.a.avg, ch.units).padEnd(20)}  ${formatTemp(ch.b.avg, ch.units).padEnd(20)}  ${formatDiff(ch.diff.avg, ch.units)}`,
			);
		}
	}

	return lines.join("\n");
}

// ─── JSON output ─────────────────────────────────────────────────────────────

function toSeconds(ms: number | null): number | null {
	return ms == null ? null : Math.round(ms / 1000);
}

/** Build a machine-readable comparison object for `--json` output. */
export function toJsonComparison(result: ComparisonResult): Record<string, unknown> {
	function archiveSummary(side: ComparisonResult["archiveA"]): Record<string, unknown> {
		return {
			id: side.id,
			label: side.label,
			start: side.start?.toISOString() ?? null,
			end: side.end?.toISOString() ?? null,
			durationSeconds: toSeconds(side.durationMs),
			readingCount: side.readingCount,
			channelCount: side.channelCount,
		};
	}

	return {
		serial: result.serial,
		archiveA: archiveSummary(result.archiveA),
		archiveB: archiveSummary(result.archiveB),
		durationDiffSeconds: toSeconds(result.durationDiffMs),
		readingCountDiff: result.readingCountDiff,
		channels: result.channels.map((ch) => ({
			label: ch.label,
			units: ch.units,
			a: { min: ch.a.min, max: ch.a.max, last: ch.a.last, avg: ch.a.avg },
			b: { min: ch.b.min, max: ch.b.max, last: ch.b.last, avg: ch.b.avg },
			diff: ch.diff,
		})),
	};
}

// ─── CLI command ─────────────────────────────────────────────────────────────

/**
 * Compare two archived cook sessions for a device, printing a side-by-side
 * table of duration, readings, and per-channel min/max/last/avg.
 */
export async function compare(
	parsedArgs: CompareArgs,
	options: OutputOptions = { json: false },
): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const [archiveA, archiveB] = await Promise.all([
			client.getArchive(parsedArgs.serial, parsedArgs.archiveA),
			client.getArchive(parsedArgs.serial, parsedArgs.archiveB),
		]);

		const result = computeComparison(parsedArgs.serial, archiveA, archiveB);

		if (options.json) {
			outputJson(toJsonComparison(result));
			return;
		}

		console.log(formatComparison(result));
	} finally {
		client.close();
	}
}
