import { describe, expect, it } from "vitest";
import { toCelsius, toFahrenheit } from "../src/convert.js";

describe("toFahrenheit", () => {
	it("converts 0°C to 32°F", () => {
		expect(toFahrenheit(0)).toBe(32);
	});

	it("converts 100°C to 212°F (boiling point)", () => {
		expect(toFahrenheit(100)).toBe(212);
	});

	it("converts -40°C to -40°F (intersection point)", () => {
		expect(toFahrenheit(-40)).toBe(-40);
	});

	it("converts -273.15°C to -459.7°F (absolute zero)", () => {
		expect(toFahrenheit(-273.15)).toBe(-459.7);
	});

	it("converts 37°C to 98.6°F (body temperature)", () => {
		expect(toFahrenheit(37)).toBe(98.6);
	});

	it("rounds to 1 decimal place", () => {
		// 23°C = 73.4°F exactly
		expect(toFahrenheit(23)).toBe(73.4);
		// 17°C = 62.6°F exactly
		expect(toFahrenheit(17)).toBe(62.6);
	});
});

describe("toCelsius", () => {
	it("converts 32°F to 0°C", () => {
		expect(toCelsius(32)).toBe(0);
	});

	it("converts 212°F to 100°C (boiling point)", () => {
		expect(toCelsius(212)).toBe(100);
	});

	it("converts -40°F to -40°C (intersection point)", () => {
		expect(toCelsius(-40)).toBe(-40);
	});

	it("converts -459.67°F to -273.1°C (absolute zero)", () => {
		expect(toCelsius(-459.67)).toBe(-273.1);
	});

	it("converts 98.6°F to 37°C (body temperature)", () => {
		expect(toCelsius(98.6)).toBe(37);
	});

	it("rounds to 1 decimal place", () => {
		// 75°F = 23.8888... -> 23.9°C
		expect(toCelsius(75)).toBe(23.9);
		// 50°F = 10°C exactly
		expect(toCelsius(50)).toBe(10);
	});
});
