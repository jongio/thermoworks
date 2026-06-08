import { describe, expect, it } from "vitest";
import { cn, formatTemp } from "../src/lib/utils.ts";

describe("cn", () => {
	it("merges simple class names", () => {
		expect(cn("px-2", "py-1")).toBe("px-2 py-1");
	});

	it("resolves Tailwind conflicts (last wins)", () => {
		expect(cn("px-2", "px-4")).toBe("px-4");
	});

	it("handles conditional classes", () => {
		const isActive = true;
		const result = cn("base", isActive && "active");
		expect(result).toBe("base active");
	});

	it("filters out falsy values", () => {
		expect(cn("base", false, null, undefined, 0, "end")).toBe("base end");
	});

	it("handles empty arguments", () => {
		expect(cn()).toBe("");
	});

	it("handles array arguments", () => {
		expect(cn(["px-2", "py-1"])).toBe("px-2 py-1");
	});

	it("handles object arguments", () => {
		expect(cn({ "px-2": true, "py-1": false, "mt-4": true })).toBe("px-2 mt-4");
	});

	it("resolves complex Tailwind conflicts", () => {
		expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
	});

	it("preserves non-conflicting responsive variants", () => {
		expect(cn("md:px-2", "lg:px-4")).toBe("md:px-2 lg:px-4");
	});

	it("resolves same-variant conflicts", () => {
		expect(cn("hover:bg-red-500", "hover:bg-blue-500")).toBe("hover:bg-blue-500");
	});
});

describe("formatTemp", () => {
	it("formats a positive integer to one decimal", () => {
		expect(formatTemp(72)).toBe("72.0");
	});

	it("formats a decimal value to one decimal place", () => {
		expect(formatTemp(98.6)).toBe("98.6");
	});

	it("rounds to one decimal place", () => {
		expect(formatTemp(72.456)).toBe("72.5");
	});

	it("formats zero", () => {
		expect(formatTemp(0)).toBe("0.0");
	});

	it("formats negative temperatures", () => {
		expect(formatTemp(-17.78)).toBe("-17.8");
	});

	it("returns '--' for null", () => {
		expect(formatTemp(null)).toBe("--");
	});

	it("returns '--' for undefined", () => {
		expect(formatTemp(undefined)).toBe("--");
	});

	it("formats very large temperatures", () => {
		expect(formatTemp(1000)).toBe("1000.0");
	});

	it("formats very small fractions", () => {
		expect(formatTemp(0.04)).toBe("0.0");
	});

	it("formats values near rounding boundary", () => {
		expect(formatTemp(99.95)).toBe("100.0");
	});
});
