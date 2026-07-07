import { describe, expect, it } from "vitest";
import { detectRapidChange, detectStall } from "../src/stall-detection.js";
import type { TemperatureReading } from "../src/types.js";

/** Helper to create a reading at a given minute offset from a base time. */
function makeReading(
	value: number,
	minuteOffset: number,
	base = new Date("2026-07-01T12:00:00Z"),
): TemperatureReading {
	const timestamp = new Date(base.getTime() + minuteOffset * 60 * 1000);
	return { value, timestamp, units: "F" };
}

// =============================================================================
// detectStall
// =============================================================================

describe("detectStall", () => {
	it("returns no stall for empty readings array", () => {
		const result = detectStall([]);
		expect(result).toEqual({
			isStalling: false,
			stallStart: null,
			stallDuration: 0,
			avgTemp: null,
		});
	});

	it("returns no stall for a single reading", () => {
		const result = detectStall([makeReading(155, 0)]);
		expect(result).toEqual({
			isStalling: false,
			stallStart: null,
			stallDuration: 0,
			avgTemp: null,
		});
	});

	it("returns no stall when temperature varies by more than threshold", () => {
		const readings = [
			makeReading(150, 0),
			makeReading(152, 10),
			makeReading(155, 20),
			makeReading(158, 30),
			makeReading(162, 40),
		];
		const result = detectStall(readings);
		expect(result.isStalling).toBe(false);
	});

	it("returns no stall when duration is below durationMinutes", () => {
		// Temperatures within 2 degrees but only 20 minutes of data
		const readings = [
			makeReading(155, 0),
			makeReading(155.5, 5),
			makeReading(156, 10),
			makeReading(155.8, 15),
			makeReading(155.3, 20),
		];
		const result = detectStall(readings);
		expect(result.isStalling).toBe(false);
	});

	it("detects stall when temperature stays within threshold for required duration", () => {
		// 35 minutes of readings within 2 degrees
		const readings = [
			makeReading(155, 0),
			makeReading(155.5, 5),
			makeReading(156, 10),
			makeReading(155.8, 15),
			makeReading(155.2, 20),
			makeReading(155.9, 25),
			makeReading(156.1, 30),
			makeReading(155.7, 35),
		];
		const result = detectStall(readings);
		expect(result.isStalling).toBe(true);
		expect(result.stallStart).toBe(new Date("2026-07-01T12:00:00Z").toISOString());
		expect(result.stallDuration).toBe(35);
		expect(result.avgTemp).toBeCloseTo(155.65, 1);
	});

	it("detects stall at exactly threshold boundary (2 degrees variance)", () => {
		// Exactly 2 degrees variation over 31 minutes (at boundary)
		const readings = [
			makeReading(155, 0),
			makeReading(156, 10),
			makeReading(157, 20),
			makeReading(156, 31),
		];
		const result = detectStall(readings);
		expect(result.isStalling).toBe(true);
		expect(result.stallDuration).toBe(31);
	});

	it("does not detect stall when variance is just over threshold", () => {
		// 2.1 degrees variation over 35 minutes
		const readings = [
			makeReading(155, 0),
			makeReading(156, 10),
			makeReading(157.1, 20),
			makeReading(156.5, 30),
			makeReading(155.5, 35),
		];
		const result = detectStall(readings);
		// The window from the end that stays within 2 degrees may be shorter than 30 min
		// From reading at t=20 (157.1) to t=35 (155.5) = 1.6 difference, only 15 min
		expect(result.isStalling).toBe(false);
	});

	it("respects custom thresholdDegrees option", () => {
		// Only detects with higher threshold
		const readings = [
			makeReading(150, 0),
			makeReading(153, 10),
			makeReading(152, 20),
			makeReading(151, 30),
			makeReading(153, 35),
		];
		// Default threshold (2) won't detect because range is 3 degrees
		expect(detectStall(readings).isStalling).toBe(false);
		// Custom threshold of 4 should detect
		expect(detectStall(readings, { thresholdDegrees: 4 }).isStalling).toBe(true);
	});

	it("respects custom durationMinutes option", () => {
		// 20 minutes of stable temps
		const readings = [
			makeReading(155, 0),
			makeReading(155.5, 5),
			makeReading(156, 10),
			makeReading(155.8, 15),
			makeReading(155.5, 20),
		];
		// Default duration (30 min) won't trigger
		expect(detectStall(readings).isStalling).toBe(false);
		// Custom duration of 15 min should trigger
		expect(detectStall(readings, { durationMinutes: 15 }).isStalling).toBe(true);
	});

	it("correctly identifies stall start when initial readings are volatile", () => {
		// First readings are volatile, then plateau begins
		const readings = [
			makeReading(140, 0),
			makeReading(148, 5),
			makeReading(155, 10),
			makeReading(155.5, 15),
			makeReading(156, 20),
			makeReading(155.8, 25),
			makeReading(155.2, 30),
			makeReading(155.9, 35),
			makeReading(156.1, 40),
			makeReading(155.7, 45),
		];
		const result = detectStall(readings);
		expect(result.isStalling).toBe(true);
		// Stall should start at or after the point where variance stays within 2 degrees
		expect(result.stallStart).not.toBeNull();
		// Duration should be at least 30 minutes
		expect(result.stallDuration).toBeGreaterThanOrEqual(30);
	});

	it("computes correct avgTemp across the stall window", () => {
		const readings = [
			makeReading(200, 0),
			makeReading(200, 10),
			makeReading(200, 20),
			makeReading(200, 30),
			makeReading(200, 40),
		];
		const result = detectStall(readings);
		expect(result.isStalling).toBe(true);
		expect(result.avgTemp).toBe(200);
	});
});

// =============================================================================
// detectRapidChange
// =============================================================================

describe("detectRapidChange", () => {
	it("returns no rapid change for empty readings array", () => {
		const result = detectRapidChange([]);
		expect(result).toEqual({ isRapid: false, direction: null, rate: 0 });
	});

	it("returns no rapid change for a single reading", () => {
		const result = detectRapidChange([makeReading(155, 0)]);
		expect(result).toEqual({ isRapid: false, direction: null, rate: 0 });
	});

	it("detects rapid rising change", () => {
		// +10 degrees in 5 minutes = 10 degrees/5min
		const readings = [makeReading(150, 0), makeReading(160, 5)];
		const result = detectRapidChange(readings);
		expect(result.isRapid).toBe(true);
		expect(result.direction).toBe("rising");
		expect(result.rate).toBe(10);
	});

	it("detects rapid falling change", () => {
		// -8 degrees in 5 minutes = -8 degrees/5min
		const readings = [makeReading(160, 0), makeReading(152, 5)];
		const result = detectRapidChange(readings);
		expect(result.isRapid).toBe(true);
		expect(result.direction).toBe("falling");
		expect(result.rate).toBe(-8);
	});

	it("returns no rapid change when rate is below threshold", () => {
		// +3 degrees in 5 minutes = 3 degrees/5min (below default threshold of 5)
		const readings = [makeReading(150, 0), makeReading(153, 5)];
		const result = detectRapidChange(readings);
		expect(result.isRapid).toBe(false);
		expect(result.direction).toBeNull();
		expect(result.rate).toBe(3);
	});

	it("detects at exactly threshold boundary", () => {
		// +5 degrees in 5 minutes = exactly 5 degrees/5min (at threshold)
		const readings = [makeReading(150, 0), makeReading(155, 5)];
		const result = detectRapidChange(readings);
		expect(result.isRapid).toBe(true);
		expect(result.direction).toBe("rising");
		expect(result.rate).toBe(5);
	});

	it("returns no rapid change when rate is just under threshold", () => {
		// +4.9 degrees in 5 minutes
		const readings = [makeReading(150, 0), makeReading(154.9, 5)];
		const result = detectRapidChange(readings);
		expect(result.isRapid).toBe(false);
		expect(result.rate).toBe(4.9);
	});

	it("normalizes rate to degrees per 5 minutes regardless of actual interval", () => {
		// +10 degrees in 10 minutes = 5 degrees/5min
		const readings = [makeReading(150, 0), makeReading(160, 10)];
		const result = detectRapidChange(readings);
		expect(result.isRapid).toBe(true);
		expect(result.rate).toBe(5);
	});

	it("uses only the last two readings when multiple are provided", () => {
		const readings = [
			makeReading(100, 0),
			makeReading(200, 5), // huge jump (ignored, not last pair)
			makeReading(201, 10), // +1 in 5 min (not rapid)
		];
		const result = detectRapidChange(readings);
		expect(result.isRapid).toBe(false);
		expect(result.rate).toBe(1);
	});

	it("respects custom rateThreshold option", () => {
		const readings = [
			makeReading(150, 0),
			makeReading(153, 5), // +3 degrees/5min
		];
		// Default threshold (5) won't trigger
		expect(detectRapidChange(readings).isRapid).toBe(false);
		// Custom threshold of 2 should trigger
		expect(detectRapidChange(readings, { rateThreshold: 2 }).isRapid).toBe(true);
	});

	it("handles zero time interval gracefully", () => {
		const base = new Date("2026-07-01T12:00:00Z");
		const readings: TemperatureReading[] = [
			{ value: 150, timestamp: base, units: "F" },
			{ value: 160, timestamp: base, units: "F" },
		];
		const result = detectRapidChange(readings);
		expect(result).toEqual({ isRapid: false, direction: null, rate: 0 });
	});
});
