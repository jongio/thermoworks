import type { TemperatureReading } from "./types.js";

// ─── Cook Timeline ───────────────────────────────────────────────────────────

/** A single milestone kind on a cook timeline. */
export type TimelineKind = "start" | "low" | "stall" | "target" | "peak" | "end";

/** A single annotated milestone on a cook timeline. */
export interface TimelineEvent {
	/** What kind of milestone this is. */
	kind: TimelineKind;
	/** Timestamp of the reading that triggered the milestone. */
	timestamp: Date;
	/** Whole minutes from the first reading. */
	minuteOffset: number;
	/** Temperature at the milestone, in Fahrenheit. */
	tempF: number;
	/** Short human-readable description. */
	detail: string;
}

/** A full annotated cook timeline. */
export interface CookTimeline {
	/** Milestones in chronological order. */
	events: TimelineEvent[];
	/** Timestamp of the first reading, or null when there are none. */
	startedAt: Date | null;
	/** Timestamp of the last reading, or null when there are none. */
	endedAt: Date | null;
	/** Whole minutes from first to last reading. */
	durationMinutes: number;
	/** Lowest temperature seen, in Fahrenheit, or null when there are no readings. */
	minTempF: number | null;
	/** Highest temperature seen, in Fahrenheit, or null when there are no readings. */
	maxTempF: number | null;
	/** Whether the target was reached (only meaningful when a target was given). */
	targetReached: boolean;
}

/** Options for {@link buildCookTimeline}. */
export interface TimelineOptions {
	/** Target internal temperature in Fahrenheit. When set, the first crossing is marked. */
	targetF?: number;
	/** Maximum variance (degrees) for the stall window. Default 2. */
	stallThresholdDegrees?: number;
	/** Minimum duration (minutes) for a plateau to count as a stall. Default 30. */
	stallMinutes?: number;
}

const DEFAULT_STALL_THRESHOLD = 2;
const DEFAULT_STALL_MINUTES = 30;

function round(value: number): number {
	return Math.round(value * 10) / 10;
}

function minutesBetween(a: Date, b: Date): number {
	return Math.round((b.getTime() - a.getTime()) / 60_000);
}

interface StallWindow {
	startIndex: number;
	durationMinutes: number;
	avgTempF: number;
}

/**
 * Find the longest contiguous plateau where the temperature stays within
 * `threshold` for at least `minDuration` minutes. Uses a sliding window with
 * monotonic deques so it runs in linear time over the series.
 */
function findLongestStall(
	readings: TemperatureReading[],
	threshold: number,
	minDuration: number,
): StallWindow | null {
	const minDeque: number[] = [];
	const maxDeque: number[] = [];
	let left = 0;
	let best: StallWindow | null = null;

	for (let right = 0; right < readings.length; right++) {
		const value = readings[right]?.value ?? 0;

		while (
			minDeque.length > 0 &&
			(readings[minDeque[minDeque.length - 1] ?? 0]?.value ?? 0) >= value
		) {
			minDeque.pop();
		}
		minDeque.push(right);

		while (
			maxDeque.length > 0 &&
			(readings[maxDeque[maxDeque.length - 1] ?? 0]?.value ?? 0) <= value
		) {
			maxDeque.pop();
		}
		maxDeque.push(right);

		while (
			(readings[maxDeque[0] ?? 0]?.value ?? 0) - (readings[minDeque[0] ?? 0]?.value ?? 0) >
			threshold
		) {
			left++;
			if ((minDeque[0] ?? 0) < left) minDeque.shift();
			if ((maxDeque[0] ?? 0) < left) maxDeque.shift();
		}

		const startReading = readings[left];
		const endReading = readings[right];
		if (!startReading || !endReading) continue;

		const durationMinutes = minutesBetween(startReading.timestamp, endReading.timestamp);
		if (
			durationMinutes >= minDuration &&
			(best === null || durationMinutes > best.durationMinutes)
		) {
			let sum = 0;
			for (let i = left; i <= right; i++) sum += readings[i]?.value ?? 0;
			best = {
				startIndex: left,
				durationMinutes,
				avgTempF: round(sum / (right - left + 1)),
			};
		}
	}

	return best;
}

const NON_ANCHOR_PRIORITY: Record<Exclude<TimelineKind, "start" | "end">, number> = {
	target: 4,
	stall: 3,
	peak: 2,
	low: 1,
};

/**
 * Turn a chronological series of probe readings into an annotated cook timeline.
 *
 * Milestones detected: the start, the low point, the longest stall, the first
 * target crossing (when a target is given), the peak, and the end. Non-anchor
 * milestones that land on the first or last reading are folded into the start
 * and end lines; when two milestones share a reading, the more specific one
 * wins (target over stall over peak over low).
 *
 * Pure and side-effect free. Readings must already be in Fahrenheit and sorted
 * chronologically (oldest first).
 */
export function buildCookTimeline(
	readings: TemperatureReading[],
	options?: TimelineOptions,
): CookTimeline {
	const threshold = options?.stallThresholdDegrees ?? DEFAULT_STALL_THRESHOLD;
	const minStall = options?.stallMinutes ?? DEFAULT_STALL_MINUTES;
	const targetF = options?.targetF;

	if (readings.length === 0) {
		return {
			events: [],
			startedAt: null,
			endedAt: null,
			durationMinutes: 0,
			minTempF: null,
			maxTempF: null,
			targetReached: false,
		};
	}

	const first = readings[0];
	const lastIndex = readings.length - 1;
	const last = readings[lastIndex];
	if (!first || !last) {
		return {
			events: [],
			startedAt: null,
			endedAt: null,
			durationMinutes: 0,
			minTempF: null,
			maxTempF: null,
			targetReached: false,
		};
	}

	let minIndex = 0;
	let maxIndex = 0;
	for (let i = 1; i < readings.length; i++) {
		const v = readings[i]?.value ?? 0;
		if (v < (readings[minIndex]?.value ?? 0)) minIndex = i;
		if (v > (readings[maxIndex]?.value ?? 0)) maxIndex = i;
	}

	let targetIndex = -1;
	if (targetF !== undefined) {
		for (let i = 0; i < readings.length; i++) {
			if ((readings[i]?.value ?? 0) >= targetF) {
				targetIndex = i;
				break;
			}
		}
	}

	const stall = findLongestStall(readings, threshold, minStall);

	// Collect non-anchor candidates, then keep the highest-priority one per index.
	const candidates: {
		index: number;
		kind: Exclude<TimelineKind, "start" | "end">;
		detail: string;
	}[] = [];
	const inMiddle = (index: number): boolean => index > 0 && index < lastIndex;

	if (inMiddle(minIndex)) {
		candidates.push({
			index: minIndex,
			kind: "low",
			detail: `Low point ${round(readings[minIndex]?.value ?? 0)}\u00B0F`,
		});
	}
	if (stall && inMiddle(stall.startIndex)) {
		candidates.push({
			index: stall.startIndex,
			kind: "stall",
			detail: `Stall began near ${stall.avgTempF}\u00B0F, held ${stall.durationMinutes}m`,
		});
	}
	if (targetIndex >= 0 && inMiddle(targetIndex) && targetF !== undefined) {
		candidates.push({
			index: targetIndex,
			kind: "target",
			detail: `Hit target ${round(targetF)}\u00B0F`,
		});
	}
	if (inMiddle(maxIndex)) {
		candidates.push({
			index: maxIndex,
			kind: "peak",
			detail: `Peaked at ${round(readings[maxIndex]?.value ?? 0)}\u00B0F`,
		});
	}

	const bestPerIndex = new Map<number, (typeof candidates)[number]>();
	for (const candidate of candidates) {
		const existing = bestPerIndex.get(candidate.index);
		if (!existing || NON_ANCHOR_PRIORITY[candidate.kind] > NON_ANCHOR_PRIORITY[existing.kind]) {
			bestPerIndex.set(candidate.index, candidate);
		}
	}

	const toEvent = (index: number, kind: TimelineKind, detail: string): TimelineEvent => ({
		kind,
		timestamp: readings[index]?.timestamp ?? first.timestamp,
		minuteOffset: minutesBetween(first.timestamp, readings[index]?.timestamp ?? first.timestamp),
		tempF: round(readings[index]?.value ?? 0),
		detail,
	});

	const events: TimelineEvent[] = [
		toEvent(0, "start", `Cook started at ${round(first.value)}\u00B0F`),
	];

	for (const candidate of [...bestPerIndex.values()].sort((a, b) => a.index - b.index)) {
		events.push(toEvent(candidate.index, candidate.kind, candidate.detail));
	}

	if (lastIndex > 0) {
		events.push(toEvent(lastIndex, "end", `Cook ended at ${round(last.value)}\u00B0F`));
	}

	return {
		events,
		startedAt: first.timestamp,
		endedAt: last.timestamp,
		durationMinutes: minutesBetween(first.timestamp, last.timestamp),
		minTempF: round(readings[minIndex]?.value ?? 0),
		maxTempF: round(readings[maxIndex]?.value ?? 0),
		targetReached: targetIndex >= 0,
	};
}
