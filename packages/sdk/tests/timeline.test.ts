import { describe, expect, it } from "vitest";
import { buildCookTimeline } from "../src/timeline.js";
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

describe("buildCookTimeline", () => {
	it("returns an empty timeline for no readings", () => {
		const result = buildCookTimeline([]);
		expect(result).toEqual({
			events: [],
			startedAt: null,
			endedAt: null,
			durationMinutes: 0,
			minTempF: null,
			maxTempF: null,
			targetReached: false,
		});
	});

	it("charts start and end for a two-point cook", () => {
		const result = buildCookTimeline([makeReading(70, 0), makeReading(203, 120)]);
		expect(result.events.map((e) => e.kind)).toEqual(["start", "end"]);
		expect(result.startedAt).toEqual(new Date("2026-07-01T12:00:00Z"));
		expect(result.durationMinutes).toBe(120);
		expect(result.minTempF).toBe(70);
		expect(result.maxTempF).toBe(203);
	});

	it("collapses a single reading into a start only", () => {
		const result = buildCookTimeline([makeReading(150, 0)]);
		expect(result.events.map((e) => e.kind)).toEqual(["start"]);
		expect(result.durationMinutes).toBe(0);
	});

	it("marks the peak between start and end", () => {
		const readings = [
			makeReading(70, 0),
			makeReading(120, 30),
			makeReading(250, 60),
			makeReading(200, 90),
		];
		const result = buildCookTimeline(readings);
		const peak = result.events.find((e) => e.kind === "peak");
		expect(peak).toBeDefined();
		expect(peak?.tempF).toBe(250);
		expect(peak?.minuteOffset).toBe(60);
	});

	it("marks the first target crossing", () => {
		const readings = [
			makeReading(70, 0),
			makeReading(150, 30),
			makeReading(203, 60),
			makeReading(210, 90),
		];
		const result = buildCookTimeline(readings, { targetF: 200 });
		const target = result.events.find((e) => e.kind === "target");
		expect(target?.minuteOffset).toBe(60);
		expect(target?.tempF).toBe(203);
		expect(result.targetReached).toBe(true);
	});

	it("reports targetReached false when the target is never hit", () => {
		const readings = [makeReading(70, 0), makeReading(150, 60), makeReading(180, 120)];
		const result = buildCookTimeline(readings, { targetF: 203 });
		expect(result.targetReached).toBe(false);
		expect(result.events.some((e) => e.kind === "target")).toBe(false);
	});

	it("detects a stall plateau in the middle of the cook", () => {
		const readings: TemperatureReading[] = [makeReading(70, 0)];
		// Ramp up to the stall.
		readings.push(makeReading(150, 30));
		// Hold near 160 for 60 minutes.
		for (let m = 40; m <= 100; m += 10) {
			readings.push(makeReading(160 + (m % 20 === 0 ? 1 : 0), m));
		}
		// Break the stall and finish.
		readings.push(makeReading(190, 130));
		readings.push(makeReading(203, 160));

		const result = buildCookTimeline(readings, { stallMinutes: 30, stallThresholdDegrees: 2 });
		const stall = result.events.find((e) => e.kind === "stall");
		expect(stall).toBeDefined();
		expect(stall?.detail).toContain("Stall");
	});

	it("prefers target over peak when they land on the same reading", () => {
		const readings = [
			makeReading(70, 0),
			makeReading(150, 30),
			makeReading(250, 60),
			makeReading(240, 90),
		];
		// Peak and target both fall on index 2.
		const result = buildCookTimeline(readings, { targetF: 250 });
		const middle = result.events.filter((e) => e.kind !== "start" && e.kind !== "end");
		const atSixty = middle.filter((e) => e.minuteOffset === 60);
		expect(atSixty).toHaveLength(1);
		expect(atSixty[0]?.kind).toBe("target");
	});

	it("keeps events in chronological order", () => {
		const readings = [
			makeReading(70, 0),
			makeReading(60, 20),
			makeReading(160, 60),
			makeReading(250, 120),
			makeReading(203, 150),
		];
		const result = buildCookTimeline(readings, { targetF: 200 });
		const offsets = result.events.map((e) => e.minuteOffset);
		const sorted = [...offsets].sort((a, b) => a - b);
		expect(offsets).toEqual(sorted);
	});

	it("folds a low point at the first reading into the start", () => {
		const readings = [makeReading(50, 0), makeReading(150, 60), makeReading(203, 120)];
		const result = buildCookTimeline(readings);
		// The low is the very first reading, so no separate low event.
		expect(result.events.some((e) => e.kind === "low")).toBe(false);
		expect(result.minTempF).toBe(50);
	});
});
