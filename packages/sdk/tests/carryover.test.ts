import { describe, expect, it } from "vitest";
import { assessCarryover, carryoverRiseForSize } from "../src/carryover.js";

describe("carryoverRiseForSize", () => {
	it("returns preset rises for each size", () => {
		expect(carryoverRiseForSize("small")).toBe(3);
		expect(carryoverRiseForSize("medium")).toBe(6);
		expect(carryoverRiseForSize("large")).toBe(10);
	});
});

describe("assessCarryover", () => {
	it("computes the pull temperature below the target", () => {
		const result = assessCarryover({ currentTempF: 190, targetTempF: 203, riseF: 10 });
		expect(result.pullTempF).toBe(193);
		expect(result.projectedFinalF).toBe(200);
		expect(result.remainingF).toBe(3);
		expect(result.pullNow).toBe(false);
		expect(result.overshoot).toBe(false);
	});

	it("says pull now once at the pull temperature", () => {
		const result = assessCarryover({ currentTempF: 193, targetTempF: 203, riseF: 10 });
		expect(result.pullTempF).toBe(193);
		expect(result.remainingF).toBe(0);
		expect(result.pullNow).toBe(true);
	});

	it("reports overshoot when the current temperature is past the pull point", () => {
		const result = assessCarryover({ currentTempF: 198, targetTempF: 203, riseF: 10 });
		expect(result.pullNow).toBe(true);
		expect(result.remainingF).toBe(-5);
		expect(result.projectedFinalF).toBe(208);
		expect(result.overshoot).toBe(true);
	});

	it("lands exactly on target when pulled at the current temperature", () => {
		const result = assessCarryover({ currentTempF: 193, targetTempF: 203, riseF: 10 });
		expect(result.projectedFinalF).toBe(203);
		expect(result.overshoot).toBe(false);
	});

	it("treats a zero rise as a plain target", () => {
		const result = assessCarryover({ currentTempF: 200, targetTempF: 203, riseF: 0 });
		expect(result.pullTempF).toBe(203);
		expect(result.remainingF).toBe(3);
		expect(result.projectedFinalF).toBe(200);
		expect(result.pullNow).toBe(false);
	});

	it("clamps a negative rise to zero", () => {
		const result = assessCarryover({ currentTempF: 200, targetTempF: 203, riseF: -5 });
		expect(result.riseF).toBe(0);
		expect(result.pullTempF).toBe(203);
	});

	it("handles fractional readings and rises", () => {
		const result = assessCarryover({ currentTempF: 141.5, targetTempF: 145, riseF: 2.5 });
		expect(result.pullTempF).toBe(142.5);
		expect(result.remainingF).toBeCloseTo(1);
		expect(result.projectedFinalF).toBe(144);
		expect(result.pullNow).toBe(false);
	});

	it("integrates with the size presets", () => {
		const rise = carryoverRiseForSize("small");
		const result = assessCarryover({ currentTempF: 130, targetTempF: 135, riseF: rise });
		expect(result.pullTempF).toBe(132);
		expect(result.remainingF).toBe(2);
	});
});
