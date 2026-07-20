import type { TemperatureReading } from "./types.js";

/** Options for {@link analyzePitStability}. */
export interface PitStabilityOptions {
	/** Desired pit temperature in Fahrenheit. */
	readonly targetF: number;
	/** Allowed degrees above or below target. */
	readonly bandF?: number;
}

/** A continuous out-of-band period. */
export interface PitStabilityExcursion {
	readonly direction: "high" | "low";
	readonly startedAt: Date;
	readonly endedAt: Date;
	readonly durationMinutes: number;
	readonly peakTempF: number;
}

/** Time-in-band statistics for a pit temperature series. */
export interface PitStabilityResult {
	readonly targetF: number;
	readonly bandF: number;
	readonly lowLimitF: number;
	readonly highLimitF: number;
	readonly startedAt: Date | null;
	readonly endedAt: Date | null;
	readonly durationMinutes: number;
	readonly sampleCount: number;
	readonly inBandMinutes: number;
	readonly highMinutes: number;
	readonly lowMinutes: number;
	readonly inBandPercent: number;
	readonly averageTempF: number | null;
	readonly minTempF: number | null;
	readonly maxTempF: number | null;
	readonly longestExcursion: PitStabilityExcursion | null;
}

const DEFAULT_BAND_F = 15;

function round(value: number): number {
	return Math.round(value * 10) / 10;
}

function minutesBetween(a: Date, b: Date): number {
	return Math.max(0, (b.getTime() - a.getTime()) / 60_000);
}

function classify(value: number, lowLimitF: number, highLimitF: number): "in" | "high" | "low" {
	if (value < lowLimitF) return "low";
	if (value > highLimitF) return "high";
	return "in";
}

/**
 * Analyze how tightly pit readings held a target temperature.
 *
 * Readings are sorted chronologically before analysis. Each sample owns the time
 * until the next sample, which matches how archive charts are usually read.
 */
export function analyzePitStability(
	readings: TemperatureReading[],
	options: PitStabilityOptions,
): PitStabilityResult {
	const targetF = options.targetF;
	const bandF = options.bandF ?? DEFAULT_BAND_F;
	if (!Number.isFinite(targetF)) throw new Error(`Target must be a number, got: ${targetF}`);
	if (!Number.isFinite(bandF) || bandF <= 0) {
		throw new Error(`Band must be a positive number of degrees, got: ${bandF}`);
	}

	const lowLimitF = targetF - bandF;
	const highLimitF = targetF + bandF;
	if (readings.length === 0) {
		return {
			targetF,
			bandF,
			lowLimitF,
			highLimitF,
			startedAt: null,
			endedAt: null,
			durationMinutes: 0,
			sampleCount: 0,
			inBandMinutes: 0,
			highMinutes: 0,
			lowMinutes: 0,
			inBandPercent: 0,
			averageTempF: null,
			minTempF: null,
			maxTempF: null,
			longestExcursion: null,
		};
	}

	const sorted = [...readings].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
	const first = sorted[0];
	const last = sorted[sorted.length - 1];
	if (!first || !last) throw new Error("No readings to analyze.");
	const values = sorted.map((reading) => reading.value);
	const minTempF = Math.min(...values);
	const maxTempF = Math.max(...values);
	const averageTempF = values.reduce((sum, value) => sum + value, 0) / values.length;

	let inBandMinutes = 0;
	let highMinutes = 0;
	let lowMinutes = 0;
	let current: PitStabilityExcursion | null = null;
	const excursions: PitStabilityExcursion[] = [];

	function closeCurrent(): void {
		if (current) {
			excursions.push({ ...current, durationMinutes: round(current.durationMinutes) });
			current = null;
		}
	}

	function extendExcursion(
		direction: "high" | "low",
		startedAt: Date,
		endedAt: Date,
		durationMinutes: number,
		tempF: number,
	): void {
		if (current?.direction !== direction) {
			closeCurrent();
			current = {
				direction,
				startedAt,
				endedAt,
				durationMinutes: 0,
				peakTempF: tempF,
			};
		}
		current = {
			...current,
			endedAt,
			durationMinutes: current.durationMinutes + durationMinutes,
			peakTempF:
				direction === "high"
					? Math.max(current.peakTempF, tempF)
					: Math.min(current.peakTempF, tempF),
		};
	}

	for (let i = 0; i < sorted.length - 1; i++) {
		const reading = sorted[i];
		const next = sorted[i + 1];
		if (!reading || !next) continue;
		const minutes = minutesBetween(reading.timestamp, next.timestamp);
		if (minutes === 0) continue;

		const bucket = classify(reading.value, lowLimitF, highLimitF);
		if (bucket === "in") {
			inBandMinutes += minutes;
			closeCurrent();
		} else if (bucket === "high") {
			highMinutes += minutes;
			extendExcursion("high", reading.timestamp, next.timestamp, minutes, reading.value);
		} else {
			lowMinutes += minutes;
			extendExcursion("low", reading.timestamp, next.timestamp, minutes, reading.value);
		}
	}
	closeCurrent();

	const durationMinutes = round(minutesBetween(first.timestamp, last.timestamp));
	const longestExcursion =
		excursions.length === 0
			? null
			: excursions.reduce((best, item) =>
					item.durationMinutes > best.durationMinutes ? item : best,
				);

	return {
		targetF,
		bandF,
		lowLimitF,
		highLimitF,
		startedAt: first.timestamp,
		endedAt: last.timestamp,
		durationMinutes,
		sampleCount: sorted.length,
		inBandMinutes: round(inBandMinutes),
		highMinutes: round(highMinutes),
		lowMinutes: round(lowMinutes),
		inBandPercent: durationMinutes > 0 ? round((inBandMinutes / durationMinutes) * 100) : 0,
		averageTempF: round(averageTempF),
		minTempF: round(minTempF),
		maxTempF: round(maxTempF),
		longestExcursion,
	};
}
