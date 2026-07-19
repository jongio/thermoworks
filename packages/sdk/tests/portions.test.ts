import { describe, expect, it } from "vitest";

import { calculatePortions, listAppetites, listPortionYields } from "../src/portions.js";

describe("calculatePortions", () => {
	it("plans standard appetite by default", () => {
		const plan = calculatePortions("brisket", 12);
		expect(plan.meat).toBe("Brisket");
		expect(plan.guests).toBe(12);
		expect(plan.servingOz).toBe(6);
		expect(plan.appetite).toBe("standard");
		expect(plan.yieldPercent).toBe(50);
		// 12 * 6 / 16 = 4.5 cooked lb; 4.5 / 0.5 = 9 raw lb.
		expect(plan.cookedLb).toBe(4.5);
		expect(plan.rawLb).toBe(9);
	});

	it("scales with the light appetite", () => {
		const plan = calculatePortions("brisket", 12, { appetite: "light" });
		expect(plan.servingOz).toBe(4);
		expect(plan.appetite).toBe("light");
		// 12 * 4 / 16 = 3 cooked lb; 3 / 0.5 = 6 raw lb.
		expect(plan.cookedLb).toBe(3);
		expect(plan.rawLb).toBe(6);
	});

	it("scales with the hearty appetite", () => {
		const plan = calculatePortions("brisket", 12, { appetite: "hearty" });
		expect(plan.servingOz).toBe(8);
		// 12 * 8 / 16 = 6 cooked lb; 6 / 0.5 = 12 raw lb.
		expect(plan.rawLb).toBe(12);
	});

	it("uses a higher-yield cut to buy less raw weight", () => {
		const plan = calculatePortions("salmon", 8, { appetite: "standard" });
		expect(plan.meat).toBe("Salmon");
		expect(plan.yieldPercent).toBe(75);
		// 8 * 6 / 16 = 3 cooked lb; 3 / 0.75 = 4 raw lb.
		expect(plan.cookedLb).toBe(3);
		expect(plan.rawLb).toBe(4);
	});

	it("rounds the raw weight up to the next quarter pound", () => {
		const plan = calculatePortions("pork butt", 5, { appetite: "standard" });
		expect(plan.meat).toBe("Pork Butt");
		// 5 * 6 / 16 = 1.875 cooked lb; 1.875 / 0.6 = 3.125 -> 3.25 raw lb.
		expect(plan.cookedLb).toBe(1.88);
		expect(plan.rawLb).toBe(3.25);
	});

	it("honors an explicit per-person serving over the appetite preset", () => {
		const plan = calculatePortions("brisket", 10, { perPersonOz: 5 });
		expect(plan.servingOz).toBe(5);
		expect(plan.appetite).toBeNull();
		// 10 * 5 / 16 = 3.125 cooked lb; 3.125 / 0.5 = 6.25 raw lb.
		expect(plan.rawLb).toBe(6.25);
	});

	it("resolves aliases through the shared meat registry", () => {
		const plan = calculatePortions("babyback", 6);
		expect(plan.meat).toBe("Baby Back Ribs");
	});

	it("throws on an unknown cut", () => {
		expect(() => calculatePortions("unicorn", 4)).toThrow(/Unknown meat/);
	});

	it("throws on a non-positive guest count", () => {
		expect(() => calculatePortions("brisket", 0)).toThrow(RangeError);
		expect(() => calculatePortions("brisket", -3)).toThrow(RangeError);
	});

	it("throws on a fractional guest count", () => {
		expect(() => calculatePortions("brisket", 4.5)).toThrow(RangeError);
	});

	it("throws on a non-positive per-person serving", () => {
		expect(() => calculatePortions("brisket", 4, { perPersonOz: 0 })).toThrow(RangeError);
		expect(() => calculatePortions("brisket", 4, { perPersonOz: -2 })).toThrow(RangeError);
	});
});

describe("listPortionYields", () => {
	it("returns a yield for every built-in cut", () => {
		const yields = listPortionYields();
		expect(yields.length).toBe(10);
		for (const entry of yields) {
			expect(entry.yieldPercent).toBeGreaterThan(0);
			expect(entry.yieldPercent).toBeLessThanOrEqual(100);
		}
	});

	it("includes brisket at 50 percent", () => {
		const brisket = listPortionYields().find((y) => y.meat === "Brisket");
		expect(brisket?.yieldPercent).toBe(50);
	});
});

describe("listAppetites", () => {
	it("returns the three presets with ascending ounces", () => {
		const appetites = listAppetites();
		expect(appetites.map((a) => a.appetite)).toEqual(["light", "standard", "hearty"]);
		expect(appetites.map((a) => a.ounces)).toEqual([4, 6, 8]);
	});
});
