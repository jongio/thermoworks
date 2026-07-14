import { describe, expect, it } from "vitest";
import {
	assessCooling,
	type CoolingSample,
	FDA_STAGE1_END_F,
	FDA_STAGE1_START_F,
	FDA_STAGE2_END_F,
} from "../src/cooling.js";

function samples(pairs: Array<[tempF: number, minutes: number]>): CoolingSample[] {
	return pairs.map(([tempF, minutes]) => ({ tempF, minutes }));
}

describe("assessCooling", () => {
	it("passes both stages when cooling is fast enough", () => {
		const result = assessCooling(
			samples([
				[160, 0],
				[135, 10],
				[70, 90],
				[41, 300],
			]),
		);
		expect(result.entered).toBe(true);
		expect(result.entryTempF).toBe(135);
		expect(result.entryMinutes).toBe(10);
		expect(result.entryUncertain).toBe(false);
		expect(result.stage1.reached).toBe(true);
		expect(result.stage1.elapsedMinutes).toBe(80);
		expect(result.stage1.withinLimit).toBe(true);
		expect(result.stage1.marginMinutes).toBe(40);
		expect(result.stage2.reached).toBe(true);
		expect(result.stage2.elapsedMinutes).toBe(290);
		expect(result.stage2.withinLimit).toBe(true);
		expect(result.safe).toBe(true);
	});

	it("fails stage one when 70F takes longer than two hours", () => {
		const result = assessCooling(
			samples([
				[135, 0],
				[70, 150],
				[41, 300],
			]),
		);
		expect(result.stage1.reached).toBe(true);
		expect(result.stage1.elapsedMinutes).toBe(150);
		expect(result.stage1.withinLimit).toBe(false);
		expect(result.stage1.marginMinutes).toBe(-30);
		// Stage two still lands inside six hours.
		expect(result.stage2.withinLimit).toBe(true);
		expect(result.safe).toBe(false);
	});

	it("fails stage two when 41F is never reached in time", () => {
		const result = assessCooling(
			samples([
				[135, 0],
				[70, 60],
				[45, 400],
			]),
		);
		expect(result.stage1.withinLimit).toBe(true);
		expect(result.stage2.reached).toBe(false);
		expect(result.stage2.elapsedMinutes).toBeNull();
		expect(result.stage2.marginMinutes).toBeNull();
		expect(result.safe).toBe(false);
	});

	it("reports no entry when the food never drops into the danger zone", () => {
		const result = assessCooling(
			samples([
				[180, 0],
				[150, 30],
				[140, 60],
			]),
		);
		expect(result.entered).toBe(false);
		expect(result.entryMinutes).toBeNull();
		expect(result.stage1.reached).toBe(false);
		expect(result.stage2.reached).toBe(false);
		expect(result.safe).toBe(false);
	});

	it("flags entry as uncertain when the first reading is already in the zone", () => {
		const result = assessCooling(
			samples([
				[120, 0],
				[70, 60],
				[41, 200],
			]),
		);
		expect(result.entered).toBe(true);
		expect(result.entryUncertain).toBe(true);
		expect(result.entryTempF).toBe(120);
		expect(result.safe).toBe(true);
	});

	it("honors custom stage limits", () => {
		const readings = samples([
			[135, 0],
			[70, 90],
			[41, 200],
		]);
		// A tighter stage-one limit of one hour flips the pass to a fail.
		const strict = assessCooling(readings, { stage1LimitHours: 1 });
		expect(strict.stage1.withinLimit).toBe(false);
		expect(strict.safe).toBe(false);
	});

	it("uses the FDA temperature thresholds by default", () => {
		const result = assessCooling(samples([[135, 0]]));
		expect(result.entryTempF).toBe(FDA_STAGE1_START_F);
		expect(result.stage1.targetF).toBe(FDA_STAGE1_END_F);
		expect(result.stage2.targetF).toBe(FDA_STAGE2_END_F);
	});

	it("throws when given no readings", () => {
		expect(() => assessCooling([])).toThrow(/at least one reading/i);
	});

	it("throws on a non-positive stage limit", () => {
		expect(() => assessCooling(samples([[135, 0]]), { stage1LimitHours: 0 })).toThrow(RangeError);
	});
});
