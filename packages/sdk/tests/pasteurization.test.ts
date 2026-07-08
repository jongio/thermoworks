import { describe, expect, it } from "vitest";
import {
	assessPasteurization,
	getPasteurizationTable,
	requiredHoldMinutes,
} from "../src/pasteurization.js";

describe("getPasteurizationTable", () => {
	it("defaults to poultry", () => {
		expect(getPasteurizationTable().protein).toBe("poultry");
	});

	it("returns beef and pork tables", () => {
		expect(getPasteurizationTable("beef").protein).toBe("beef");
		expect(getPasteurizationTable("pork").protein).toBe("pork");
	});
});

describe("requiredHoldMinutes", () => {
	it("returns 0 at or above the instant-safe temperature", () => {
		expect(requiredHoldMinutes(165, "poultry")).toBe(0);
		expect(requiredHoldMinutes(170, "poultry")).toBe(0);
		expect(requiredHoldMinutes(160, "beef")).toBe(0);
	});

	it("returns null below the pasteurization minimum", () => {
		expect(requiredHoldMinutes(129, "poultry")).toBeNull();
		expect(requiredHoldMinutes(100, "beef")).toBeNull();
	});

	it("returns the listed hold time at an exact table point", () => {
		expect(requiredHoldMinutes(140, "poultry")).toBeCloseTo(10.5, 5);
		expect(requiredHoldMinutes(150, "poultry")).toBeCloseTo(1.4, 5);
		expect(requiredHoldMinutes(140, "beef")).toBeCloseTo(12.0, 5);
	});

	it("interpolates between two table points", () => {
		// Poultry 140 -> 10.5, 142 -> 7.0. Midpoint 141 -> 8.75.
		expect(requiredHoldMinutes(141, "poultry")).toBeCloseTo(8.75, 5);
	});

	it("decreases as temperature rises", () => {
		const t135 = requiredHoldMinutes(135, "poultry") ?? 0;
		const t145 = requiredHoldMinutes(145, "poultry") ?? 0;
		const t155 = requiredHoldMinutes(155, "poultry") ?? 0;
		expect(t135).toBeGreaterThan(t145);
		expect(t145).toBeGreaterThan(t155);
	});

	it("treats poultry and beef differently at the same temperature", () => {
		expect(requiredHoldMinutes(140, "poultry")).not.toBe(requiredHoldMinutes(140, "beef"));
	});
});

describe("assessPasteurization", () => {
	it("marks food safe instantly at the instant target", () => {
		const r = assessPasteurization({ temperatureF: 165, holdMinutes: 0, protein: "poultry" });
		expect(r.safe).toBe(true);
		expect(r.instant).toBe(true);
		expect(r.remainingMinutes).toBe(0);
		expect(r.requiredMinutes).toBe(0);
	});

	it("reports remaining time when held below the requirement", () => {
		const r = assessPasteurization({ temperatureF: 150, holdMinutes: 0.5, protein: "poultry" });
		expect(r.requiredMinutes).toBeCloseTo(1.4, 5);
		expect(r.remainingMinutes).toBeCloseTo(0.9, 5);
		expect(r.safe).toBe(false);
		expect(r.instant).toBe(false);
	});

	it("marks food safe once the hold requirement is met", () => {
		const r = assessPasteurization({ temperatureF: 150, holdMinutes: 2, protein: "poultry" });
		expect(r.remainingMinutes).toBe(0);
		expect(r.safe).toBe(true);
	});

	it("reports null remaining when too low to pasteurize", () => {
		const r = assessPasteurization({ temperatureF: 120, holdMinutes: 300, protein: "poultry" });
		expect(r.requiredMinutes).toBeNull();
		expect(r.remainingMinutes).toBeNull();
		expect(r.safe).toBe(false);
	});

	it("defaults to poultry when no protein is given", () => {
		const r = assessPasteurization({ temperatureF: 140, holdMinutes: 0 });
		expect(r.protein).toBe("poultry");
	});

	it("clamps negative hold time to zero", () => {
		const r = assessPasteurization({ temperatureF: 140, holdMinutes: -5, protein: "beef" });
		expect(r.heldMinutes).toBe(0);
	});

	it("exposes the instant-safe target for the protein", () => {
		expect(assessPasteurization({ temperatureF: 140, holdMinutes: 0 }).instantTempF).toBe(165);
		expect(
			assessPasteurization({ temperatureF: 140, holdMinutes: 0, protein: "beef" }).instantTempF,
		).toBe(160);
	});
});
