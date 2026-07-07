import type { TemperatureReading } from "./types.js";

// ─── Stall Detection ─────────────────────────────────────────────────────────

/** Options for configuring stall detection sensitivity. */
export interface StallOptions {
	/** Maximum temperature variance (in degrees) to consider a stall. Default: 2. */
	thresholdDegrees?: number;
	/** Minimum duration (in minutes) of low variance to qualify as a stall. Default: 30. */
	durationMinutes?: number;
}

/** Result of stall detection analysis. */
export interface StallResult {
	/** Whether the readings indicate an active stall. */
	isStalling: boolean;
	/** ISO timestamp of when the stall began, or null if not stalling. */
	stallStart: string | null;
	/** Duration of the stall in minutes (0 if not stalling). */
	stallDuration: number;
	/** Average temperature during the stall window, or null if not stalling. */
	avgTemp: number | null;
}

/**
 * Analyze a series of temperature readings to detect a stall (plateau).
 *
 * A stall is identified when the temperature varies by less than
 * `thresholdDegrees` over a trailing window of at least `durationMinutes`.
 * Readings must be sorted chronologically (oldest first).
 */
export function detectStall(readings: TemperatureReading[], options?: StallOptions): StallResult {
	const threshold = options?.thresholdDegrees ?? 2;
	const minDuration = options?.durationMinutes ?? 30;

	const noStall: StallResult = {
		isStalling: false,
		stallStart: null,
		stallDuration: 0,
		avgTemp: null,
	};

	if (readings.length < 2) return noStall;

	// Walk backwards from the most recent reading to find the longest trailing
	// window where max - min temperature stays within threshold.
	const last = readings.at(-1);
	if (!last) return noStall;

	let windowMin = last.value;
	let windowMax = last.value;
	let stallStartIndex = readings.length - 1;

	for (let i = readings.length - 2; i >= 0; i--) {
		const reading = readings[i];
		if (!reading) break;
		const candidateMin = Math.min(windowMin, reading.value);
		const candidateMax = Math.max(windowMax, reading.value);

		if (candidateMax - candidateMin > threshold) break;

		windowMin = candidateMin;
		windowMax = candidateMax;
		stallStartIndex = i;
	}

	const startReading = readings[stallStartIndex];
	const endReading = readings.at(-1);
	if (!startReading || !endReading) return noStall;

	const durationMs = endReading.timestamp.getTime() - startReading.timestamp.getTime();
	const durationMinutes = durationMs / (1000 * 60);

	if (durationMinutes < minDuration) return noStall;

	// Compute average temperature across the stall window.
	let sum = 0;
	const count = readings.length - stallStartIndex;
	for (let i = stallStartIndex; i < readings.length; i++) {
		const r = readings[i];
		if (r) sum += r.value;
	}
	const avgTemp = Math.round((sum / count) * 10) / 10;

	return {
		isStalling: true,
		stallStart: startReading.timestamp.toISOString(),
		stallDuration: Math.round(durationMinutes),
		avgTemp,
	};
}

// ─── Rapid Change Detection ──────────────────────────────────────────────────

/** Options for configuring rapid change detection sensitivity. */
export interface RapidChangeOptions {
	/** Rate threshold in degrees per 5 minutes. Default: 5. */
	rateThreshold?: number;
}

/** Result of rapid change detection analysis. */
export interface RapidChangeResult {
	/** Whether the recent rate of change exceeds the threshold. */
	isRapid: boolean;
	/** Direction of the rapid change, or null if not rapid. */
	direction: "rising" | "falling" | null;
	/** Current rate of change in degrees per 5 minutes. */
	rate: number;
}

/**
 * Analyze recent temperature readings to detect rapid changes.
 *
 * Computes the rate of change between the two most recent readings,
 * normalized to degrees per 5 minutes. If only one or zero readings
 * are provided, returns a zero-rate result.
 */
export function detectRapidChange(
	readings: TemperatureReading[],
	options?: RapidChangeOptions,
): RapidChangeResult {
	const threshold = options?.rateThreshold ?? 5;

	const noChange: RapidChangeResult = { isRapid: false, direction: null, rate: 0 };

	if (readings.length < 2) return noChange;

	const prev = readings.at(-2);
	const curr = readings.at(-1);
	if (!prev || !curr) return noChange;

	const deltaTemp = curr.value - prev.value;
	const deltaMs = curr.timestamp.getTime() - prev.timestamp.getTime();

	// Guard against zero or negative time intervals.
	if (deltaMs <= 0) return noChange;

	// Normalize to degrees per 5 minutes.
	const fiveMinMs = 5 * 60 * 1000;
	const ratePer5Min = Math.round((deltaTemp / deltaMs) * fiveMinMs * 10) / 10;

	const isRapid = Math.abs(ratePer5Min) >= threshold;

	return {
		isRapid,
		direction: isRapid ? (ratePer5Min > 0 ? "rising" : "falling") : null,
		rate: ratePer5Min,
	};
}
