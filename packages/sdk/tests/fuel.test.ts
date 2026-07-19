import { describe, expect, it } from "vitest";
import { estimateFuel, listFuelTypes } from "../src/fuel.js";

describe("listFuelTypes", () => {
	it("returns the supported fuel types", () => {
		expect(listFuelTypes()).toEqual(["pellet", "charcoal", "wood"]);
	});
});

describe("estimateFuel - burn rate tiers", () => {
	it("picks the pellet rate for the temperature band", () => {
		expect(estimateFuel(225, 1).burnRateLbPerHour).toBe(0.75);
		expect(estimateFuel(275, 1).burnRateLbPerHour).toBe(1.25);
		expect(estimateFuel(375, 1).burnRateLbPerHour).toBe(2.25);
		expect(estimateFuel(500, 1).burnRateLbPerHour).toBe(3);
	});

	it("uses the tier boundary inclusively", () => {
		// 250 is the top of the lowest pellet band.
		expect(estimateFuel(250, 1).burnRateLbPerHour).toBe(0.75);
		// 251 spills into the next band.
		expect(estimateFuel(251, 1).burnRateLbPerHour).toBe(1.25);
	});

	it("picks charcoal and wood rates by type", () => {
		expect(estimateFuel(250, 1, { fuelType: "charcoal" }).burnRateLbPerHour).toBe(0.6);
		expect(estimateFuel(500, 1, { fuelType: "charcoal" }).burnRateLbPerHour).toBe(2.5);
		expect(estimateFuel(250, 1, { fuelType: "wood" }).burnRateLbPerHour).toBe(2);
		expect(estimateFuel(500, 1, { fuelType: "wood" }).burnRateLbPerHour).toBe(4);
	});
});

describe("estimateFuel - totals and buffer", () => {
	it("multiplies the rate by the hours", () => {
		const estimate = estimateFuel(225, 12);
		// 0.75 lb/hr * 12 h = 9 lb.
		expect(estimate.totalLb).toBe(9);
	});

	it("rounds the recommended amount up to the next half pound with a buffer", () => {
		const estimate = estimateFuel(225, 12);
		// 9 lb * 1.2 = 10.8 -> round up to 11.
		expect(estimate.recommendedLb).toBe(11);
	});

	it("defaults to pellets", () => {
		expect(estimateFuel(225, 4).fuelType).toBe("pellet");
	});
});

describe("estimateFuel - hopper planning", () => {
	it("reports runtime and refills for a hopper size", () => {
		const estimate = estimateFuel(225, 12, { hopperLb: 20 });
		// 20 lb / 0.75 lb/hr = 26.7 h per load.
		expect(estimate.runtimePerLoadHours).toBe(26.7);
		// total 9 lb fits in one 20 lb load, so no refills.
		expect(estimate.refills).toBe(0);
	});

	it("counts refills when the cook outlasts one load", () => {
		const estimate = estimateFuel(375, 10, { hopperLb: 5 });
		// 2.25 lb/hr * 10 h = 22.5 lb; ceil(22.5 / 5) - 1 = 4 refills.
		expect(estimate.refills).toBe(4);
	});

	it("omits hopper fields when no hopper is given", () => {
		const estimate = estimateFuel(225, 4);
		expect(estimate.hopperLb).toBeUndefined();
		expect(estimate.runtimePerLoadHours).toBeUndefined();
		expect(estimate.refills).toBeUndefined();
	});
});

describe("estimateFuel - validation", () => {
	it("rejects a non-positive temperature", () => {
		expect(() => estimateFuel(0, 4)).toThrow(RangeError);
		expect(() => estimateFuel(-10, 4)).toThrow(RangeError);
		expect(() => estimateFuel(Number.NaN, 4)).toThrow(RangeError);
	});

	it("rejects a non-positive number of hours", () => {
		expect(() => estimateFuel(225, 0)).toThrow(RangeError);
		expect(() => estimateFuel(225, -1)).toThrow(RangeError);
	});

	it("rejects a non-positive hopper size", () => {
		expect(() => estimateFuel(225, 4, { hopperLb: 0 })).toThrow(RangeError);
		expect(() => estimateFuel(225, 4, { hopperLb: -5 })).toThrow(RangeError);
	});
});
