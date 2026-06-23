import { describe, expect, it, vi } from "vitest";

// ─── Mock vscode ─────────────────────────────────────────────────────────────

let configValues: Record<string, unknown> = {};

vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string, defaultValue: unknown) => configValues[key] ?? defaultValue),
		})),
	},
}));

// ─── Import after mock ───────────────────────────────────────────────────────

import {
	applyUnitPreference,
	convertTemp,
	getUnitPreference,
} from "../src/temperature-utils";

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("convertTemp", () => {
	it("returns value unchanged when units are the same (F->F)", () => {
		expect(convertTemp(225, "F", "F")).toBe(225);
	});

	it("returns value unchanged when units are the same (C->C)", () => {
		expect(convertTemp(100, "C", "C")).toBe(100);
	});

	it("converts F to C correctly (boiling point)", () => {
		expect(convertTemp(212, "F", "C")).toBeCloseTo(100, 5);
	});

	it("converts F to C correctly (freezing point)", () => {
		expect(convertTemp(32, "F", "C")).toBeCloseTo(0, 5);
	});

	it("converts C to F correctly (boiling point)", () => {
		expect(convertTemp(100, "C", "F")).toBeCloseTo(212, 5);
	});

	it("converts C to F correctly (freezing point)", () => {
		expect(convertTemp(0, "C", "F")).toBeCloseTo(32, 5);
	});

	it("converts a typical cooking temperature F to C", () => {
		// 225°F = 107.222°C
		expect(convertTemp(225, "F", "C")).toBeCloseTo(107.222, 2);
	});

	it("converts a typical cooking temperature C to F", () => {
		// 107°C = 224.6°F
		expect(convertTemp(107, "C", "F")).toBeCloseTo(224.6, 1);
	});

	it("handles negative temperatures", () => {
		// -40 is the crossover point
		expect(convertTemp(-40, "F", "C")).toBeCloseTo(-40, 5);
		expect(convertTemp(-40, "C", "F")).toBeCloseTo(-40, 5);
	});
});

describe("getUnitPreference", () => {
	it("returns auto by default", () => {
		configValues = {};
		expect(getUnitPreference()).toBe("auto");
	});

	it("returns F when configured", () => {
		configValues = { units: "F" };
		expect(getUnitPreference()).toBe("F");
	});

	it("returns C when configured", () => {
		configValues = { units: "C" };
		expect(getUnitPreference()).toBe("C");
	});
});

describe("applyUnitPreference", () => {
	it("returns unchanged when preference is auto", () => {
		const result = applyUnitPreference(225, "F", "auto");
		expect(result.value).toBe(225);
		expect(result.unit).toBe("F");
	});

	it("returns unchanged when preference matches native unit", () => {
		const result = applyUnitPreference(225, "F", "F");
		expect(result.value).toBe(225);
		expect(result.unit).toBe("F");
	});

	it("converts F to C when preference is C", () => {
		const result = applyUnitPreference(212, "F", "C");
		expect(result.value).toBeCloseTo(100, 5);
		expect(result.unit).toBe("C");
	});

	it("converts C to F when preference is F", () => {
		const result = applyUnitPreference(100, "C", "F");
		expect(result.value).toBeCloseTo(212, 5);
		expect(result.unit).toBe("F");
	});
});
