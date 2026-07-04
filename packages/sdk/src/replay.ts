import type { HistoricalReading, TemperatureReading } from "./types.js";

/** A reading that can be replayed. Accepts SDK archive or history readings. */
export interface ReplayReading {
	value: number;
	timestamp: Date | string;
	units?: string;
}

/** One frame in a replay sequence. */
export interface ReplayFrame {
	/** Zero-based position in the ordered sequence. */
	index: number;
	value: number;
	units: string;
	/** Original time the reading was recorded. */
	timestamp: Date;
	/** Wall-clock delay before this frame relative to the previous one, in ms. */
	delayMs: number;
	/** Wall-clock offset of this frame from the start of the replay, in ms. */
	offsetMs: number;
}

/** Options controlling how a replay sequence is built. */
export interface ReplayOptions {
	/**
	 * How much faster than real time to replay. A speed of 60 plays a minute of
	 * cook time per wall-clock second. Values <= 0 or non-finite fall back to 1.
	 */
	speed?: number;
}

function toDate(value: Date | string): Date {
	return value instanceof Date ? value : new Date(value);
}

function normalizeSpeed(speed: number | undefined): number {
	if (speed == null || !Number.isFinite(speed) || speed <= 0) return 1;
	return speed;
}

/**
 * Turn a set of readings into a time-ordered replay sequence.
 *
 * Readings with non-finite values or unparseable timestamps are dropped. The
 * remaining readings are sorted by timestamp. Each frame carries the wall-clock
 * delay from the previous frame (the real gap divided by `speed`) and the
 * cumulative offset from the start. The first frame always has a zero delay.
 *
 * Pure and side-effect free, so it can be unit tested without timers.
 */
export function buildReplaySequence(
	readings: ReplayReading[],
	options: ReplayOptions = {},
): ReplayFrame[] {
	const speed = normalizeSpeed(options.speed);

	const valid = readings
		.map((r) => ({ value: r.value, units: r.units ?? "", date: toDate(r.timestamp) }))
		.filter((r) => Number.isFinite(r.value) && !Number.isNaN(r.date.getTime()))
		.sort((a, b) => a.date.getTime() - b.date.getTime());

	const frames: ReplayFrame[] = [];
	let previousTime: number | null = null;
	let offsetMs = 0;

	valid.forEach((r, index) => {
		const time = r.date.getTime();
		const sourceDelta = previousTime == null ? 0 : Math.max(0, time - previousTime);
		const delayMs = sourceDelta / speed;
		offsetMs += delayMs;
		frames.push({
			index,
			value: r.value,
			units: r.units,
			timestamp: r.date,
			delayMs,
			offsetMs,
		});
		previousTime = time;
	});

	return frames;
}

/**
 * Compute the next index when streaming a replay. Returns the next position, or
 * 0 when looping past the end, or null when the sequence is finished (and not
 * looping) or empty.
 */
export function nextReplayIndex(current: number, length: number, loop: boolean): number | null {
	if (length <= 0) return null;
	const next = current + 1;
	if (next < length) return next;
	return loop ? 0 : null;
}

/** Narrow a history reading into a replay reading. */
export function historyReadingToReplay(reading: HistoricalReading): ReplayReading {
	return { value: reading.value, timestamp: reading.timestamp, units: reading.units };
}

/** Narrow an archive reading into a replay reading. */
export function archiveReadingToReplay(reading: TemperatureReading): ReplayReading {
	return { value: reading.value, timestamp: reading.timestamp, units: reading.units };
}
