import { describe, expect, it } from "vitest";
import { toCelsius, toFahrenheit } from "../src/lib/utils.ts";

describe("toCelsius", () => {
	it("converts 32°F to 0°C", () => {
		expect(toCelsius(32)).toBeCloseTo(0, 5);
	});

	it("converts 212°F to 100°C", () => {
		expect(toCelsius(212)).toBeCloseTo(100, 5);
	});

	it("converts -40°F to -40°C", () => {
		expect(toCelsius(-40)).toBeCloseTo(-40, 5);
	});

	it("converts 72°F to 22.22°C", () => {
		expect(toCelsius(72)).toBeCloseTo(22.2222, 3);
	});

	it("converts 0°F to -17.78°C", () => {
		expect(toCelsius(0)).toBeCloseTo(-17.7778, 3);
	});
});

describe("toFahrenheit", () => {
	it("converts 0°C to 32°F", () => {
		expect(toFahrenheit(0)).toBeCloseTo(32, 5);
	});

	it("converts 100°C to 212°F", () => {
		expect(toFahrenheit(100)).toBeCloseTo(212, 5);
	});

	it("converts -40°C to -40°F", () => {
		expect(toFahrenheit(-40)).toBeCloseTo(-40, 5);
	});

	it("converts 22.22°C to ~72°F", () => {
		expect(toFahrenheit(22.22)).toBeCloseTo(71.996, 2);
	});

	it("converts -17.78°C to ~0°F", () => {
		expect(toFahrenheit(-17.78)).toBeCloseTo(-0.004, 1);
	});
});

describe("toCelsius and toFahrenheit are inverses", () => {
	const values = [0, 32, 72, 100, 212, -40, 350, 500];

	for (const v of values) {
		it(`round-trips ${v}°F through C and back`, () => {
			expect(toFahrenheit(toCelsius(v))).toBeCloseTo(v, 5);
		});
	}
});
