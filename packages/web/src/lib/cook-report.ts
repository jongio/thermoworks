import type { Archive, ArchiveChannel } from "thermoworks-sdk";

export interface CookAnnotation {
	readonly id: string;
	readonly timestamp: Date;
	readonly label: string;
	readonly note?: string;
}

export interface CookReportSummary {
	readonly durationMs: number;
	readonly minTemp: number | null;
	readonly maxTemp: number | null;
	readonly units: string | null;
	readonly timeAtTargetMs: number | null;
	readonly targetTemp: number | null;
	readonly targetTolerance: number | null;
}

export interface CookReport {
	readonly sessionId: string;
	readonly title: string;
	readonly start: Date | null;
	readonly end: Date | null;
	readonly channels: ArchiveChannel[];
	readonly annotations: CookAnnotation[];
	readonly summary: CookReportSummary;
}

export interface BuildCookReportOptions {
	readonly annotations?: readonly CookAnnotation[];
	readonly targetTemp?: number | null;
	readonly targetTolerance?: number | null;
}

const DEFAULT_TARGET_TOLERANCE = 5;

function enabledChannels(channels: readonly ArchiveChannel[] | null | undefined): ArchiveChannel[] {
	return (channels ?? []).filter((channel) => channel.enabled !== false);
}

function readingTimes(channels: readonly ArchiveChannel[]): number[] {
	const times: number[] = [];
	for (const channel of channels) {
		for (const reading of channel.recentReadings) {
			const time = reading.timestamp.getTime();
			if (Number.isFinite(time)) times.push(time);
		}
	}
	return times;
}

function resolveRange(archive: Archive, channels: readonly ArchiveChannel[]) {
	const times = readingTimes(channels);
	const startTime = archive.start?.getTime() ?? Math.min(...times);
	const endTime = archive.end?.getTime() ?? Math.max(...times);
	const hasStart = Number.isFinite(startTime);
	const hasEnd = Number.isFinite(endTime);
	return {
		start: hasStart ? new Date(startTime) : null,
		end: hasEnd ? new Date(endTime) : null,
		durationMs: hasStart && hasEnd ? Math.max(0, endTime - startTime) : 0,
	};
}

function summarizeTemperatures(channels: readonly ArchiveChannel[]) {
	let minTemp = Number.POSITIVE_INFINITY;
	let maxTemp = Number.NEGATIVE_INFINITY;
	let units: string | null = null;

	for (const channel of channels) {
		for (const reading of channel.recentReadings) {
			if (!Number.isFinite(reading.value)) continue;
			minTemp = Math.min(minTemp, reading.value);
			maxTemp = Math.max(maxTemp, reading.value);
			units ??= reading.units;
		}
	}

	return {
		minTemp: Number.isFinite(minTemp) ? minTemp : null,
		maxTemp: Number.isFinite(maxTemp) ? maxTemp : null,
		units,
	};
}

function calculateTimeAtTarget(
	channel: ArchiveChannel | undefined,
	targetTemp: number | null,
	targetTolerance: number | null,
): number | null {
	if (!channel || targetTemp == null || targetTolerance == null) return null;
	const readings = [...channel.recentReadings].sort(
		(a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
	);
	let total = 0;
	for (let index = 0; index < readings.length - 1; index++) {
		const current = readings[index];
		const next = readings[index + 1];
		if (!current || !next) continue;
		const startsAtTarget = Math.abs(current.value - targetTemp) <= targetTolerance;
		if (!startsAtTarget) continue;
		const delta = next.timestamp.getTime() - current.timestamp.getTime();
		if (Number.isFinite(delta) && delta > 0) total += delta;
	}
	return total;
}

export function buildCookReport(
	archive: Archive,
	options: BuildCookReportOptions = {},
): CookReport {
	const channels = enabledChannels(archive.channels);
	const range = resolveRange(archive, channels);
	const temps = summarizeTemperatures(channels);
	const targetTemp = options.targetTemp ?? null;
	const targetTolerance =
		targetTemp == null ? null : (options.targetTolerance ?? DEFAULT_TARGET_TOLERANCE);
	const annotations = [...(options.annotations ?? [])].sort(
		(a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
	);

	return {
		sessionId: archive.id,
		title: archive.label ?? archive.deviceLabel ?? "Cook session",
		start: range.start,
		end: range.end,
		channels,
		annotations,
		summary: {
			durationMs: range.durationMs,
			minTemp: temps.minTemp,
			maxTemp: temps.maxTemp,
			units: temps.units,
			timeAtTargetMs: calculateTimeAtTarget(channels[0], targetTemp, targetTolerance),
			targetTemp,
			targetTolerance,
		},
	};
}

export function formatReportDuration(ms: number | null | undefined): string {
	if (!ms || ms <= 0) return "0m";
	const totalMinutes = Math.floor(ms / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours === 0) return `${minutes}m`;
	if (minutes === 0) return `${hours}h`;
	return `${hours}h ${minutes}m`;
}
