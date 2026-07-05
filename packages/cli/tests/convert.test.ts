import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { convert, parseConversion } from "../src/commands/convert.js";

// =============================================================================
// parseConversion
// =============================================================================

describe("parseConversion", () => {
	it("converts a Fahrenheit-suffixed value to Celsius", () => {
		expect(parseConversion("225f")).toEqual({
			input: 225,
			inputUnit: "F",
			value: 107.2,
			unit: "C",
		});
	});

	it("converts a Celsius-suffixed value to Fahrenheit", () => {
		expect(parseConversion("107c")).toEqual({
			input: 107,
			inputUnit: "C",
			value: 224.6,
			unit: "F",
		});
	});

	it("accepts an uppercase suffix", () => {
		expect(parseConversion("225F")?.value).toBe(107.2);
	});

	it("handles negative and decimal values", () => {
		expect(parseConversion("-40f")?.value).toBe(-40);
		expect(parseConversion("98.6f")?.value).toBe(37);
	});

	it("converts a bare number with --to c", () => {
		expect(parseConversion("225", "c")).toEqual({
			input: 225,
			inputUnit: "F",
			value: 107.2,
			unit: "C",
		});
	});

	it("converts a bare number with --to f", () => {
		expect(parseConversion("100", "f")).toEqual({
			input: 100,
			inputUnit: "C",
			value: 212,
			unit: "F",
		});
	});

	it("lets a suffix win over --to", () => {
		// 225f is Fahrenheit, so it converts to Celsius even with --to f.
		expect(parseConversion("225f", "f")).toEqual({
			input: 225,
			inputUnit: "F",
			value: 107.2,
			unit: "C",
		});
	});

	it("returns null for a bare number without --to", () => {
		expect(parseConversion("225")).toBeNull();
	});

	it("returns null for a bare number with an invalid --to", () => {
		expect(parseConversion("225", "kelvin")).toBeNull();
	});

	it("returns null for non-numeric input", () => {
		expect(parseConversion("hot")).toBeNull();
		expect(parseConversion("12x")).toBeNull();
	});

	it("returns null for missing input", () => {
		expect(parseConversion(undefined)).toBeNull();
	});
});

// =============================================================================
// convert command
// =============================================================================

describe("convert", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("prints the converted value with a degree and unit", () => {
		convert(["225f"], { json: false });
		expect(logSpy).toHaveBeenCalledWith("107.2\u00B0C");
	});

	it("reads the --to flag for a bare number", () => {
		convert(["100", "--to", "f"], { json: false });
		expect(logSpy).toHaveBeenCalledWith("212\u00B0F");
	});

	it("emits JSON when --json is set", () => {
		convert(["107c"], { json: true });
		const output = logSpy.mock.calls[0]?.[0] as string;
		expect(JSON.parse(output)).toEqual({ input: 107, value: 224.6, unit: "F" });
	});

	it("exits with an error for invalid input", () => {
		convert(["nope"], { json: false });
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalled();
	});
});
