import { detectRapidChange, detectStall, type StallOptions } from "./stall-detection.js";
import type { TemperatureReading } from "./types.js";

// ─── Wrap Advisor ────────────────────────────────────────────────────────────

/** The wrap call returned by the advisor. */
export type WrapRecommendation = "wrap-now" | "hold" | "below-window" | "at-target" | "no-data";

/** Default temperature (in Fahrenheit) at which the wrap window opens. */
export const DEFAULT_WRAP_AT_F = 160;

/** Default rate (degrees per 5 minutes) below which a climb counts as stalled out. */
export const DEFAULT_SLOW_RATE = 1;

/** Input for {@link assessWrap}. Readings are assumed to be in Fahrenheit. */
export interface WrapInput {
	/** Chronological readings (oldest first), values in Fahrenheit. */
	readings: TemperatureReading[];
	/** Target internal temperature in Fahrenheit. */
	targetF: number;
	/** Temperature at which the wrap window opens. Default 160. */
	wrapAtF?: number;
	/** Sensitivity for the underlying stall detection. */
	stallOptions?: StallOptions;
	/** Rate (degrees per 5 minutes) at or below which a climb is treated as stalled. Default 1. */
	slowRateThreshold?: number;
}

/** Result of a wrap assessment. */
export interface WrapResult {
	/** The wrap call. */
	recommendation: WrapRecommendation;
	/** Human-readable reasoning behind the call. */
	reason: string;
	/** Most recent temperature in Fahrenheit, or null when there are no readings. */
	currentTempF: number | null;
	/** Target internal temperature in Fahrenheit. */
	targetTempF: number;
	/** Temperature at which the wrap window opens. */
	wrapAtF: number;
	/** Whether the readings indicate an active stall. */
	isStalling: boolean;
	/** Duration of the detected stall in minutes (0 when not stalling). */
	stallDuration: number;
	/** Current rate of change in degrees per 5 minutes. */
	ratePer5Min: number;
}

function round(value: number): number {
	return Math.round(value * 10) / 10;
}

/**
 * Decide whether to wrap the cook now (the "Texas crutch").
 *
 * The advisor reads a trailing series of probe temperatures and combines the
 * current temperature, the wrap window, stall detection, and rate of change
 * into a single call:
 *
 * - `below-window`: under the wrap temperature, so let the bark set first.
 * - `wrap-now`: inside the wrap window and either stalled or barely climbing.
 * - `hold`: inside the wrap window but still climbing well, so wrapping is optional.
 * - `at-target`: at or above the target, so pull and rest instead.
 * - `no-data`: no readings available yet.
 *
 * Pure and side-effect free. Readings must already be in Fahrenheit and sorted
 * chronologically (oldest first).
 */
export function assessWrap(input: WrapInput): WrapResult {
	const wrapAtF = input.wrapAtF ?? DEFAULT_WRAP_AT_F;
	const slowRate = input.slowRateThreshold ?? DEFAULT_SLOW_RATE;
	const { readings, targetF } = input;

	const stall = detectStall(readings, input.stallOptions);
	const rapid = detectRapidChange(readings);
	const last = readings.at(-1);
	const current = last ? last.value : null;

	const base = {
		targetTempF: targetF,
		wrapAtF,
		isStalling: stall.isStalling,
		stallDuration: stall.stallDuration,
		ratePer5Min: rapid.rate,
	};

	if (current == null) {
		return {
			recommendation: "no-data",
			reason: "No readings yet. Start the cook and check back once temperatures are flowing.",
			currentTempF: null,
			...base,
		};
	}

	if (current >= targetF) {
		return {
			recommendation: "at-target",
			reason: `At ${round(current)}\u00B0F, already at or above the ${round(targetF)}\u00B0F target. Pull and rest instead of wrapping.`,
			currentTempF: current,
			...base,
		};
	}

	if (current < wrapAtF) {
		return {
			recommendation: "below-window",
			reason: `At ${round(current)}\u00B0F, below the ${wrapAtF}\u00B0F wrap window. Let the bark set first.`,
			currentTempF: current,
			...base,
		};
	}

	if (stall.isStalling) {
		const at = round(stall.avgTemp ?? current);
		return {
			recommendation: "wrap-now",
			reason: `Stalled ${stall.stallDuration}m near ${at}\u00B0F. Wrapping now pushes through the stall.`,
			currentTempF: current,
			...base,
		};
	}

	if (rapid.rate <= slowRate) {
		return {
			recommendation: "wrap-now",
			reason: `Climb stalled to ${round(rapid.rate)}\u00B0F/5min inside the wrap window. Wrapping speeds the finish.`,
			currentTempF: current,
			...base,
		};
	}

	return {
		recommendation: "hold",
		reason: `Still climbing ${round(rapid.rate)}\u00B0F/5min at ${round(current)}\u00B0F. Wrap is optional; hold for more bark.`,
		currentTempF: current,
		...base,
	};
}
