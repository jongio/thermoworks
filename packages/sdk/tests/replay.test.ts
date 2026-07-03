import { describe, expect, it } from "vitest";

import { buildReplaySequence, nextReplayIndex, type ReplayReading } from "../src/replay.js";

function reading(value: number, iso: string, units = "F"): ReplayReading {
	return { value, timestamp: iso, units };
}

describe("buildReplaySequence", () => {
	it("returns an empty sequence for no readings", () => {
		expect(buildReplaySequence([])).toEqual([]);
	});

	it("returns a single zero-delay frame for one reading", () => {
		const frames = buildReplaySequence([reading(200, "2026-01-01T00:00:00Z")]);
		expect(frames).toHaveLength(1);
		expect(frames[0]?.delayMs).toBe(0);
		expect(frames[0]?.offsetMs).toBe(0);
		expect(frames[0]?.index).toBe(0);
		expect(frames[0]?.value).toBe(200);
	});

	it("orders readings by timestamp", () => {
		const frames = buildReplaySequence([
			reading(3, "2026-01-01T00:02:00Z"),
			reading(1, "2026-01-01T00:00:00Z"),
			reading(2, "2026-01-01T00:01:00Z"),
		]);
		expect(frames.map((f) => f.value)).toEqual([1, 2, 3]);
		expect(frames.map((f) => f.index)).toEqual([0, 1, 2]);
	});

	it("computes delays from the real gap divided by speed", () => {
		const frames = buildReplaySequence(
			[
				reading(1, "2026-01-01T00:00:00Z"),
				reading(2, "2026-01-01T00:01:00Z"), // 60s later
			],
			{ speed: 60 },
		);
		// 60s / 60 = 1s = 1000ms
		expect(frames[1]?.delayMs).toBe(1000);
		expect(frames[1]?.offsetMs).toBe(1000);
	});

	it("accumulates offset across frames", () => {
		const frames = buildReplaySequence(
			[
				reading(1, "2026-01-01T00:00:00Z"),
				reading(2, "2026-01-01T00:00:10Z"),
				reading(3, "2026-01-01T00:00:30Z"),
			],
			{ speed: 10 },
		);
		expect(frames[1]?.delayMs).toBe(1000); // 10s / 10
		expect(frames[2]?.delayMs).toBe(2000); // 20s / 10
		expect(frames[2]?.offsetMs).toBe(3000);
	});

	it("falls back to speed 1 for invalid speeds", () => {
		for (const speed of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
			const frames = buildReplaySequence(
				[reading(1, "2026-01-01T00:00:00Z"), reading(2, "2026-01-01T00:00:01Z")],
				{ speed },
			);
			expect(frames[1]?.delayMs).toBe(1000); // 1s / 1
		}
	});

	it("drops non-finite values and unparseable timestamps", () => {
		const frames = buildReplaySequence([
			reading(Number.NaN, "2026-01-01T00:00:00Z"),
			reading(5, "not-a-date"),
			reading(7, "2026-01-01T00:00:05Z"),
		]);
		expect(frames).toHaveLength(1);
		expect(frames[0]?.value).toBe(7);
	});

	it("accepts Date timestamps", () => {
		const frames = buildReplaySequence([
			{ value: 10, timestamp: new Date("2026-01-01T00:00:00Z") },
			{ value: 20, timestamp: new Date("2026-01-01T00:00:02Z") },
		]);
		expect(frames.map((f) => f.value)).toEqual([10, 20]);
		expect(frames[1]?.delayMs).toBe(2000);
	});
});

describe("nextReplayIndex", () => {
	it("advances to the next index", () => {
		expect(nextReplayIndex(0, 3, false)).toBe(1);
		expect(nextReplayIndex(1, 3, false)).toBe(2);
	});

	it("returns null at the end when not looping", () => {
		expect(nextReplayIndex(2, 3, false)).toBeNull();
	});

	it("wraps to zero at the end when looping", () => {
		expect(nextReplayIndex(2, 3, true)).toBe(0);
	});

	it("returns null for an empty sequence", () => {
		expect(nextReplayIndex(0, 0, true)).toBeNull();
		expect(nextReplayIndex(0, 0, false)).toBeNull();
	});
});
