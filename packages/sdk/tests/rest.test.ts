import { describe, expect, it } from "vitest";
import { planRest } from "../src/rest.js";

describe("planRest", () => {
	it("plans a brisket rest with a longer window for large cuts", () => {
		const result = planRest("brisket", { weightLb: 12 });

		expect(result.meat).toBe("Brisket");
		expect(result.weightLb).toBe(12);
		expect(result.minMinutes).toBe(75);
		expect(result.maxMinutes).toBe(300);
		expect(result.servingTemperatureF).toEqual({ minF: 150, maxF: 165 });
		expect(result.holdMethod).toContain("wrapped");
	});

	it("resolves aliases", () => {
		expect(planRest("pulled pork").meat).toBe("Pork Butt");
		expect(planRest("baby back").meat).toBe("Baby Back Ribs");
	});

	it("keeps delicate fish rests short", () => {
		const result = planRest("salmon");

		expect(result.minMinutes).toBe(3);
		expect(result.maxMinutes).toBe(8);
		expect(result.holdMethod).toContain("uncovered");
	});

	it("rejects unknown meats", () => {
		expect(() => planRest("moon roast")).toThrow(/unknown meat/i);
	});

	it("rejects non-positive weights", () => {
		expect(() => planRest("brisket", { weightLb: 0 })).toThrow(/positive number/i);
	});
});
