import { describe, expect, it } from "vitest";
import {
	type CookPlanItemInput,
	getMeatProfiles,
	planCook,
	resolveMeatProfile,
} from "../src/plan.js";

const READY = new Date("2026-01-15T18:00:00.000Z");

function plan(items: CookPlanItemInput[]) {
	return planCook(items, { readyAt: READY });
}

describe("getMeatProfiles", () => {
	it("returns the built-in profiles", () => {
		const profiles = getMeatProfiles();
		expect(profiles.length).toBeGreaterThan(5);
		expect(profiles.some((p) => p.name === "Brisket")).toBe(true);
	});

	it("returns copies so callers cannot mutate the source", () => {
		const first = getMeatProfiles();
		(first[0] as { name: string }).name = "Hacked";
		expect(getMeatProfiles()[0].name).toBe("Brisket");
	});
});

describe("resolveMeatProfile", () => {
	it("resolves canonical names case-insensitively", () => {
		expect(resolveMeatProfile("BRISKET")?.name).toBe("Brisket");
	});

	it("resolves aliases", () => {
		expect(resolveMeatProfile("pulled pork")?.name).toBe("Pork Butt");
		expect(resolveMeatProfile("baby back")?.name).toBe("Baby Back Ribs");
	});

	it("returns null for unknown meats", () => {
		expect(resolveMeatProfile("unobtainium")).toBeNull();
	});
});

describe("planCook", () => {
	it("back-calculates start time from a per-pound profile", () => {
		const result = plan([{ meat: "brisket", weightLb: 12 }]);
		const item = result.items[0];
		// 12 lb * 1.25 h/lb = 15h cook, 60m rest.
		expect(item.cookMinutes).toBe(900);
		expect(item.restMinutes).toBe(60);
		expect(item.readyAt.getTime()).toBe(READY.getTime());
		expect(item.removeAt.getTime()).toBe(READY.getTime() - 60 * 60_000);
		expect(item.startAt.getTime()).toBe(READY.getTime() - (900 + 60) * 60_000);
		expect(item.meat).toBe("Brisket");
	});

	it("uses fixed-hour profiles when weight is not needed", () => {
		const item = plan([{ meat: "ribs" }]).items[0];
		expect(item.cookMinutes).toBe(330); // 5.5h
		expect(item.meat).toBe("Pork Ribs");
	});

	it("honors an explicit hours override", () => {
		const item = plan([{ hours: 2, label: "Wings" }]).items[0];
		expect(item.cookMinutes).toBe(120);
		expect(item.label).toBe("Wings");
		expect(item.meat).toBeNull();
	});

	it("honors a rest-minutes override", () => {
		const item = plan([{ meat: "brisket", weightLb: 10, restMinutes: 90 }]).items[0];
		expect(item.restMinutes).toBe(90);
	});

	it("sorts items by earliest start time first", () => {
		const result = plan([
			{ meat: "wings" }, // short
			{ meat: "brisket", weightLb: 12 }, // long
		]);
		expect(result.items[0].meat).toBe("Brisket");
		expect(result.items[1].meat).toBe("Chicken Wings");
		expect(result.items[0].startAt.getTime()).toBeLessThan(result.items[1].startAt.getTime());
	});

	it("falls back to a fixed-hour profile with no weight", () => {
		const item = plan([{ meat: "whole chicken" }]).items[0];
		expect(item.cookMinutes).toBe(210); // 3.5h
		expect(item.meat).toBe("Whole Chicken");
	});

	it("throws for a per-pound profile with no weight and no fixed fallback", () => {
		expect(() => plan([{ meat: "brisket" }])).toThrow(/per pound/i);
	});

	it("throws for an unknown meat", () => {
		expect(() => plan([{ meat: "unobtainium" }])).toThrow(/unknown meat/i);
	});

	it("throws when an item has neither meat nor hours", () => {
		expect(() => plan([{}])).toThrow(/meat type or an explicit cook time/i);
	});

	it("throws for a non-positive explicit cook time", () => {
		expect(() => plan([{ hours: 0 }])).toThrow(/positive number of hours/i);
	});

	it("throws when there are no items", () => {
		expect(() => plan([])).toThrow(/at least one item/i);
	});

	it("throws for an invalid ready time", () => {
		expect(() => planCook([{ meat: "ribs" }], { readyAt: new Date("nope") })).toThrow(
			/valid ready time/i,
		);
	});
});
