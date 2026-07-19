import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatFuel, formatFuelTypeList, fuel, parseFuelArgs } from "../src/commands/fuel.js";

// =============================================================================
// parseFuelArgs
// =============================================================================

describe("parseFuelArgs", () => {
	it("parses temp, hours, fuel, and hopper", () => {
		expect(
			parseFuelArgs(["--temp", "225", "--hours", "12", "--fuel", "charcoal", "--hopper", "20"]),
		).toEqual({
			pitTempF: 225,
			hours: 12,
			fuelType: "charcoal",
			hopperLb: 20,
		});
	});

	it("defaults the fuel type to pellet", () => {
		expect(parseFuelArgs(["--temp", "250", "--hours", "6"])).toEqual({
			pitTempF: 250,
			hours: 6,
			fuelType: "pellet",
		});
	});

	it("parses the list flag", () => {
		expect(parseFuelArgs(["--list"])).toEqual({ fuelType: "pellet", list: true });
	});

	it("rejects a non-positive temp", () => {
		expect(parseFuelArgs(["--temp", "0", "--hours", "6"])).toEqual({
			error: expect.stringContaining("--temp"),
		});
	});

	it("rejects a non-positive hours", () => {
		expect(parseFuelArgs(["--temp", "225", "--hours", "-1"])).toEqual({
			error: expect.stringContaining("--hours"),
		});
	});

	it("rejects an unknown fuel type", () => {
		expect(parseFuelArgs(["--temp", "225", "--hours", "6", "--fuel", "coal"])).toEqual({
			error: expect.stringContaining("Unknown fuel type"),
		});
	});

	it("rejects an unknown option", () => {
		expect(parseFuelArgs(["--temp", "225", "--bogus"])).toEqual({
			error: expect.stringContaining("Unknown option"),
		});
	});

	it("rejects an unexpected positional", () => {
		expect(parseFuelArgs(["225"])).toEqual({
			error: expect.stringContaining("Unexpected argument"),
		});
	});
});

// =============================================================================
// formatFuel
// =============================================================================

describe("formatFuel", () => {
	it("formats an estimate without a hopper", () => {
		const out = formatFuel({
			fuelType: "pellet",
			pitTempF: 225,
			hours: 12,
			burnRateLbPerHour: 0.75,
			totalLb: 9,
			recommendedLb: 11,
		});
		expect(out).toContain("12 h at 225F on pellet");
		expect(out).toContain("0.75 lb/hr");
		expect(out).toContain("Pack:         11 lb");
		expect(out).not.toContain("Per load");
	});

	it("includes hopper runtime and refills when present", () => {
		const out = formatFuel({
			fuelType: "pellet",
			pitTempF: 375,
			hours: 10,
			burnRateLbPerHour: 2.25,
			totalLb: 22.5,
			recommendedLb: 27,
			hopperLb: 5,
			runtimePerLoadHours: 2.2,
			refills: 4,
		});
		expect(out).toContain("Per load:     2.2 h on 5 lb");
		expect(out).toContain("4 refills");
	});

	it("uses the singular for one refill", () => {
		const out = formatFuel({
			fuelType: "charcoal",
			pitTempF: 300,
			hours: 8,
			burnRateLbPerHour: 1,
			totalLb: 8,
			recommendedLb: 10,
			hopperLb: 5,
			runtimePerLoadHours: 5,
			refills: 1,
		});
		expect(out).toContain("1 refill");
		expect(out).not.toContain("1 refills");
	});
});

describe("formatFuelTypeList", () => {
	it("lists every fuel type", () => {
		const out = formatFuelTypeList();
		expect(out).toContain("pellet");
		expect(out).toContain("charcoal");
		expect(out).toContain("wood");
	});
});

// =============================================================================
// fuel handler
// =============================================================================

describe("fuel", () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let writeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("prints an estimate for a temp and hours", async () => {
		await fuel(["--temp", "225", "--hours", "12"], { json: false });
		const printed = writeSpy.mock.calls.map((c) => c[0]).join("");
		expect(printed).toContain("12 h at 225F on pellet");
	});

	it("plans refills with a hopper size", async () => {
		await fuel(["--temp", "375", "--hours", "10", "--hopper", "5"], { json: false });
		const printed = writeSpy.mock.calls.map((c) => c[0]).join("");
		expect(printed).toContain("Per load");
	});

	it("emits JSON when requested", async () => {
		await fuel(["--temp", "225", "--hours", "12"], { json: true });
		const logSpy = vi.mocked(console.log);
		const output = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
		expect(output).toMatchObject({ fuelType: "pellet", pitTempF: 225, hours: 12 });
	});

	it("lists fuel types with --list", async () => {
		await fuel(["--list"], { json: false });
		const printed = writeSpy.mock.calls.map((c) => c[0]).join("");
		expect(printed).toContain("Fuel types");
	});

	it("exits when temp is missing", async () => {
		await expect(fuel(["--hours", "12"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--temp is required"));
	});

	it("exits when hours is missing", async () => {
		await expect(fuel(["--temp", "225"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--hours is required"));
	});
});
