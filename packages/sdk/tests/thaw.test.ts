import { describe, expect, it } from "vitest";

import { getMeatProfiles } from "../src/plan.js";
import { listThawProfiles, planThaw, resolveThawProfile } from "../src/thaw.js";

describe("listThawProfiles", () => {
	it("covers every built-in meat profile", () => {
		expect(listThawProfiles().map((p) => p.meat)).toEqual(getMeatProfiles().map((p) => p.name));
	});
});

describe("resolveThawProfile", () => {
	it("resolves aliases", () => {
		expect(resolveThawProfile("pulled pork")?.meat).toBe("Pork Butt");
	});

	it("returns null for unknown meats", () => {
		expect(resolveThawProfile("unobtainium")).toBeNull();
	});
});

describe("planThaw", () => {
	it("estimates fridge thaw time with the default buffer", () => {
		const plan = planThaw("brisket", 12);
		expect(plan.meat).toBe("Brisket");
		expect(plan.method).toBe("fridge");
		expect(plan.thawHours).toBe(60);
		expect(plan.totalHours).toBe(64);
		expect(plan.startAt).toBeNull();
	});

	it("estimates cold-water thaw time", () => {
		const plan = planThaw("salmon", 2, { method: "cold-water", bufferHours: 0 });
		expect(plan.thawHours).toBe(0.75);
		expect(plan.totalHours).toBe(0.75);
	});

	it("works backward from a ready time", () => {
		const readyAt = new Date("2026-07-20T12:00:00.000Z");
		const plan = planThaw("tri-tip", 3, { readyAt, bufferHours: 1 });
		expect(plan.readyAt?.toISOString()).toBe("2026-07-20T12:00:00.000Z");
		expect(plan.startAt?.toISOString()).toBe("2026-07-19T20:00:00.000Z");
	});

	it("throws for bad input", () => {
		expect(() => planThaw("brisket", 0)).toThrow(/positive number/);
		expect(() => planThaw("unobtainium", 1)).toThrow(/unknown meat/i);
		expect(() => planThaw("brisket", 1, { method: "fast" as never })).toThrow(/unknown thaw/i);
	});
});
