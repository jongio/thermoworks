import type { DeviceHistory, HistoricalReading } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetHistory = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getHistory = mockGetHistory;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

import { ThermoworksCloud, toFahrenheit } from "thermoworks-sdk";
import { formatWrap, parseWrapArgs } from "../src/commands/wrap.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);
const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetHistory = vi.mocked(mockClient.getHistory);

const BASE = new Date("2026-07-01T12:00:00Z").getTime();

function reading(value: number, minute: number, units = "F"): HistoricalReading {
	return { value, timestamp: new Date(BASE + minute * 60_000).toISOString(), units };
}

function historyOf(readings: HistoricalReading[]): DeviceHistory {
	return { deviceId: "ABC123", readings };
}

// =============================================================================
// parseWrapArgs
// =============================================================================

describe("parseWrapArgs", () => {
	it("parses serial, target, wrap-at, and limit", () => {
		const parsed = parseWrapArgs([
			"ABC123",
			"--target",
			"203",
			"--wrap-at",
			"165",
			"--limit",
			"30",
		]);
		expect(parsed).toEqual({ serial: "ABC123", targetF: 203, wrapAtF: 165, limit: 30 });
	});

	it("rejects a non-numeric target", () => {
		expect(parseWrapArgs(["ABC123", "--target", "hot"])).toEqual({
			error: expect.stringContaining("--target"),
		});
	});

	it("rejects a non-numeric wrap-at", () => {
		expect(parseWrapArgs(["ABC123", "--wrap-at", "warm"])).toEqual({
			error: expect.stringContaining("--wrap-at"),
		});
	});

	it("rejects a non-positive limit", () => {
		expect(parseWrapArgs(["ABC123", "--limit", "0"])).toEqual({
			error: expect.stringContaining("--limit"),
		});
	});

	it("rejects an unknown option", () => {
		expect(parseWrapArgs(["ABC123", "--bogus"])).toEqual({
			error: expect.stringContaining("Unknown option"),
		});
	});

	it("rejects an unexpected positional argument", () => {
		expect(parseWrapArgs(["ABC123", "XYZ"])).toEqual({
			error: expect.stringContaining("Unexpected argument"),
		});
	});
});

// =============================================================================
// formatWrap
// =============================================================================

describe("formatWrap", () => {
	it("shows the wrap-now headline and stall line", () => {
		const out = formatWrap(
			{
				recommendation: "wrap-now",
				reason: "Stalled 45m near 165\u00B0F. Wrapping now pushes through the stall.",
				currentTempF: 165,
				targetTempF: 203,
				wrapAtF: 160,
				isStalling: true,
				stallDuration: 45,
				ratePer5Min: 0,
			},
			"ABC123",
		);
		expect(out).toContain("Wrap now");
		expect(out).toContain("Stalled for 45m");
		expect(out).toContain("current 165\u00B0F");
	});

	it("shows the rate line when not stalling", () => {
		const out = formatWrap(
			{
				recommendation: "hold",
				reason: "Still climbing 5\u00B0F/5min at 170\u00B0F. Wrap is optional; hold for more bark.",
				currentTempF: 170,
				targetTempF: 203,
				wrapAtF: 160,
				isStalling: false,
				stallDuration: 0,
				ratePer5Min: 5,
			},
			"ABC123",
		);
		expect(out).toContain("Hold off");
		expect(out).toContain("Rate 5\u00B0F/5min");
	});

	it("omits the status line when there is no data", () => {
		const out = formatWrap(
			{
				recommendation: "no-data",
				reason: "No readings yet.",
				currentTempF: null,
				targetTempF: 203,
				wrapAtF: 160,
				isStalling: false,
				stallDuration: 0,
				ratePer5Min: 0,
			},
			"ABC123",
		);
		expect(out).toContain("No data");
		expect(out).not.toContain("current");
	});
});

// =============================================================================
// wrap handler
// =============================================================================

describe("wrap", () => {
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

	it("calls wrap-now on a stalled history and outputs JSON", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		const readings: HistoricalReading[] = [];
		for (let m = 0; m <= 40; m += 5) readings.push(reading(165, m));
		mockGetHistory.mockResolvedValue(historyOf(readings));

		const { wrap } = await import("../src/commands/wrap.js");
		await wrap(["ABC123", "--target", "203"], { json: true });

		expect(mockGetHistory).toHaveBeenCalledWith("ABC123");
		const logSpy = vi.mocked(console.log);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toMatchObject({
			serial: "ABC123",
			recommendation: "wrap-now",
			currentTempF: 165,
			readingCount: readings.length,
		});
	});

	it("prints the too-early guidance below the wrap window", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue(historyOf([reading(145, 0), reading(150, 5)]));

		const { wrap } = await import("../src/commands/wrap.js");
		await wrap(["ABC123", "--target", "203"], { json: false });

		const printed = writeSpy.mock.calls.map((c) => c[0]).join("");
		expect(printed).toContain("Too early");
		expect(printed).toContain("below the 160");
	});

	it("converts Celsius readings to Fahrenheit", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue(historyOf([reading(73, 0, "C"), reading(74, 5, "C")]));

		const { wrap } = await import("../src/commands/wrap.js");
		await wrap(["ABC123", "--target", "203"], { json: true });

		const logSpy = vi.mocked(console.log);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.currentTempF).toBeCloseTo(toFahrenheit(74));
	});

	it("limits to the most recent N readings", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		const readings: HistoricalReading[] = [];
		for (let m = 0; m <= 40; m += 5) readings.push(reading(165, m));
		mockGetHistory.mockResolvedValue(historyOf(readings));

		const { wrap } = await import("../src/commands/wrap.js");
		await wrap(["ABC123", "--target", "203", "--limit", "2"], { json: true });

		const logSpy = vi.mocked(console.log);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.readingCount).toBe(2);
	});

	it("exits when --target is missing", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		const { wrap } = await import("../src/commands/wrap.js");
		await expect(wrap(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--target is required"));
	});

	it("exits when no serial is provided", async () => {
		const { wrap } = await import("../src/commands/wrap.js");
		await expect(wrap(["--target", "203"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const { wrap } = await import("../src/commands/wrap.js");
		await expect(wrap(["ABC123", "--target", "203"], { json: false })).rejects.toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});
});
