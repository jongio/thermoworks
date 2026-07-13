import { describe, expect, it } from "vitest";
import type { TemperatureReading } from "../src/types.js";
import { assessWrap, DEFAULT_WRAP_AT_F } from "../src/wrap-advisor.js";

/** Helper to create a reading at a given minute offset from a base time. */
function makeReading(
	value: number,
	minuteOffset: number,
	base = new Date("2026-07-01T12:00:00Z"),
): TemperatureReading {
	const timestamp = new Date(base.getTime() + minuteOffset * 60 * 1000);
	return { value, timestamp, units: "F" };
}

/** Flat readings at `value` every 5 minutes for `spanMinutes`. */
function flatSeries(value: number, spanMinutes: number): TemperatureReading[] {
	const out: TemperatureReading[] = [];
	for (let m = 0; m <= spanMinutes; m += 5) {
		out.push(makeReading(value, m));
	}
	return out;
}

describe("assessWrap", () => {
	it("returns no-data for an empty series", () => {
		const result = assessWrap({ readings: [], targetF: 203 });
		expect(result.recommendation).toBe("no-data");
		expect(result.currentTempF).toBeNull();
		expect(result.wrapAtF).toBe(DEFAULT_WRAP_AT_F);
	});

	it("says below-window when the current temp is under the wrap point", () => {
		const readings = [makeReading(145, 0), makeReading(150, 5)];
		const result = assessWrap({ readings, targetF: 203 });
		expect(result.recommendation).toBe("below-window");
		expect(result.currentTempF).toBe(150);
		expect(result.reason).toContain("below the 160");
	});

	it("says at-target when the current temp is at or above the target", () => {
		const readings = [makeReading(200, 0), makeReading(205, 5)];
		const result = assessWrap({ readings, targetF: 203 });
		expect(result.recommendation).toBe("at-target");
		expect(result.currentTempF).toBe(205);
	});

	it("says wrap-now when stalled inside the wrap window", () => {
		const readings = flatSeries(165, 40);
		const result = assessWrap({ readings, targetF: 203 });
		expect(result.recommendation).toBe("wrap-now");
		expect(result.isStalling).toBe(true);
		expect(result.stallDuration).toBe(40);
		expect(result.reason).toContain("Stalled");
	});

	it("says wrap-now when the climb has nearly flattened inside the window", () => {
		const readings = [
			makeReading(161, 0),
			makeReading(162, 5),
			makeReading(163, 10),
			makeReading(164, 15),
		];
		const result = assessWrap({ readings, targetF: 203 });
		expect(result.recommendation).toBe("wrap-now");
		expect(result.isStalling).toBe(false);
		expect(result.ratePer5Min).toBe(1);
		expect(result.reason).toContain("Climb stalled");
	});

	it("says hold when still climbing well inside the window", () => {
		const readings = [makeReading(160, 0), makeReading(165, 5), makeReading(170, 10)];
		const result = assessWrap({ readings, targetF: 203 });
		expect(result.recommendation).toBe("hold");
		expect(result.currentTempF).toBe(170);
		expect(result.ratePer5Min).toBe(5);
		expect(result.reason).toContain("climbing");
	});

	it("honors a custom wrap window", () => {
		const readings = [makeReading(150, 0), makeReading(158, 5)];
		// Default window would call this below-window; a lower wrap-at opens it.
		const result = assessWrap({ readings, targetF: 203, wrapAtF: 155 });
		expect(result.wrapAtF).toBe(155);
		expect(result.recommendation).not.toBe("below-window");
	});

	it("honors a custom slow-rate threshold", () => {
		// Climbing 3F per 5 min inside the window. Default slow rate (1) => hold.
		const readings = [makeReading(163, 0), makeReading(166, 5), makeReading(169, 10)];
		expect(assessWrap({ readings, targetF: 203 }).recommendation).toBe("hold");
		// Raise the slow-rate threshold above the climb rate => wrap-now.
		const result = assessWrap({ readings, targetF: 203, slowRateThreshold: 4 });
		expect(result.recommendation).toBe("wrap-now");
	});
});
