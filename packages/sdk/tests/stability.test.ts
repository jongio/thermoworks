import { describe, expect, it } from "vitest";

import { analyzePitStability } from "../src/stability.js";
import type { TemperatureReading } from "../src/types.js";

const base = new Date("2026-07-01T12:00:00.000Z");

function reading(value: number, minuteOffset: number): TemperatureReading {
	return { value, units: "F", timestamp: new Date(base.getTime() + minuteOffset * 60_000) };
}

describe("analyzePitStability", () => {
	it("returns empty stats for no readings", () => {
		expect(analyzePitStability([], { targetF: 250 })).toMatchObject({
			durationMinutes: 0,
			sampleCount: 0,
			inBandPercent: 0,
			averageTempF: null,
			longestExcursion: null,
		});
	});

	it("calculates time in band and excursions", () => {
		const result = analyzePitStability(
			[
				reading(250, 0),
				reading(260, 10),
				reading(270, 20),
				reading(245, 30),
				reading(230, 40),
				reading(250, 50),
			],
			{ targetF: 250, bandF: 5 },
		);

		expect(result.durationMinutes).toBe(50);
		expect(result.inBandMinutes).toBe(20);
		expect(result.highMinutes).toBe(20);
		expect(result.lowMinutes).toBe(10);
		expect(result.inBandPercent).toBe(40);
		expect(result.minTempF).toBe(230);
		expect(result.maxTempF).toBe(270);
		expect(result.longestExcursion).toMatchObject({
			direction: "high",
			durationMinutes: 20,
			peakTempF: 270,
		});
	});

	it("sorts readings before analysis", () => {
		const result = analyzePitStability([reading(270, 20), reading(250, 0), reading(250, 10)], {
			targetF: 250,
			bandF: 5,
		});
		expect(result.startedAt?.toISOString()).toBe("2026-07-01T12:00:00.000Z");
		expect(result.durationMinutes).toBe(20);
	});

	it("treats band boundaries as in band", () => {
		const result = analyzePitStability([reading(235, 0), reading(265, 10), reading(250, 20)], {
			targetF: 250,
			bandF: 15,
		});
		expect(result.inBandMinutes).toBe(20);
		expect(result.longestExcursion).toBeNull();
	});

	it("throws for bad options", () => {
		expect(() => analyzePitStability([reading(250, 0)], { targetF: Number.NaN })).toThrow(
			/target/i,
		);
		expect(() => analyzePitStability([reading(250, 0)], { targetF: 250, bandF: 0 })).toThrow(
			/band/i,
		);
	});
});
