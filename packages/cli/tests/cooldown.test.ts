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

import { ThermoworksCloud } from "thermoworks-sdk";
import {
	formatCooling,
	historyToCoolingSamples,
	parseCooldownArgs,
} from "../src/commands/cooldown.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);
const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetHistory = vi.mocked(mockClient.getHistory);

// =============================================================================
// parseCooldownArgs
// =============================================================================

describe("parseCooldownArgs", () => {
	it("parses a serial with stage limits", () => {
		const parsed = parseCooldownArgs(["ABC123", "--stage1-limit", "1.5", "--stage2-limit", "5"]);
		expect(parsed).toEqual({ serial: "ABC123", stage1LimitHours: 1.5, stage2LimitHours: 5 });
	});

	it("parses an offline readings list", () => {
		const parsed = parseCooldownArgs(["--readings", "135@0, 70@90 ,41@300"]);
		expect(parsed).toEqual({
			readings: [
				{ tempF: 135, minutes: 0 },
				{ tempF: 70, minutes: 90 },
				{ tempF: 41, minutes: 300 },
			],
		});
	});

	it("rejects a malformed readings entry", () => {
		expect(parseCooldownArgs(["--readings", "135"])).toEqual({
			error: expect.stringContaining("temp@minutes"),
		});
	});

	it("rejects a non-numeric readings temperature", () => {
		expect(parseCooldownArgs(["--readings", "hot@0"])).toEqual({
			error: expect.stringContaining("temperature"),
		});
	});

	it("rejects negative readings minutes", () => {
		expect(parseCooldownArgs(["--readings", "135@-5"])).toEqual({
			error: expect.stringContaining("minutes"),
		});
	});

	it("rejects a non-positive stage limit", () => {
		expect(parseCooldownArgs(["ABC123", "--stage1-limit", "0"])).toEqual({
			error: expect.stringContaining("--stage1-limit"),
		});
	});

	it("rejects an unknown option", () => {
		expect(parseCooldownArgs(["ABC123", "--bogus"])).toEqual({
			error: expect.stringContaining("Unknown option"),
		});
	});
});

// =============================================================================
// historyToCoolingSamples
// =============================================================================

describe("historyToCoolingSamples", () => {
	it("converts Celsius readings and anchors minutes to the first reading", () => {
		const base = new Date("2026-01-01T00:00:00Z").toISOString();
		const later = new Date("2026-01-01T01:00:00Z").toISOString();
		const samples = historyToCoolingSamples([
			{ value: 60, units: "C", timestamp: base },
			{ value: 20, units: "C", timestamp: later },
		]);
		expect(samples[0]?.tempF).toBeCloseTo(140);
		expect(samples[0]?.minutes).toBe(0);
		expect(samples[1]?.tempF).toBeCloseTo(68);
		expect(samples[1]?.minutes).toBe(60);
	});

	it("passes Fahrenheit readings through untouched", () => {
		const ts = new Date("2026-01-01T00:00:00Z").toISOString();
		const samples = historyToCoolingSamples([{ value: 135, units: "F", timestamp: ts }]);
		expect(samples[0]).toEqual({ tempF: 135, minutes: 0 });
	});

	it("returns an empty array for no readings", () => {
		expect(historyToCoolingSamples([])).toEqual([]);
	});
});

// =============================================================================
// formatCooling
// =============================================================================

describe("formatCooling", () => {
	it("reports a safe cooldown with both stages passing", () => {
		const out = formatCooling(
			{
				entered: true,
				entryMinutes: 0,
				entryTempF: 135,
				entryUncertain: false,
				stage1: {
					targetF: 70,
					limitMinutes: 120,
					reached: true,
					elapsedMinutes: 80,
					withinLimit: true,
					marginMinutes: 40,
				},
				stage2: {
					targetF: 41,
					limitMinutes: 360,
					reached: true,
					elapsedMinutes: 290,
					withinLimit: true,
					marginMinutes: 70,
				},
				safe: true,
			},
			"ABC123",
		);
		expect(out).toContain("Safe.");
		expect(out).toContain("Stage 1");
		expect(out).toContain("PASS");
	});

	it("flags a failed stage", () => {
		const out = formatCooling(
			{
				entered: true,
				entryMinutes: 0,
				entryTempF: 135,
				entryUncertain: false,
				stage1: {
					targetF: 70,
					limitMinutes: 120,
					reached: true,
					elapsedMinutes: 150,
					withinLimit: false,
					marginMinutes: -30,
				},
				stage2: {
					targetF: 41,
					limitMinutes: 360,
					reached: false,
					elapsedMinutes: null,
					withinLimit: false,
					marginMinutes: null,
				},
				safe: false,
			},
			"ABC123",
		);
		expect(out).toContain("Not safe.");
		expect(out).toContain("FAIL");
		expect(out).toContain("not reached");
	});

	it("says the clock has not started when the food never entered the zone", () => {
		const out = formatCooling(
			{
				entered: false,
				entryMinutes: null,
				entryTempF: null,
				entryUncertain: false,
				stage1: {
					targetF: 70,
					limitMinutes: 120,
					reached: false,
					elapsedMinutes: null,
					withinLimit: false,
					marginMinutes: null,
				},
				stage2: {
					targetF: 41,
					limitMinutes: 360,
					reached: false,
					elapsedMinutes: null,
					withinLimit: false,
					marginMinutes: null,
				},
				safe: false,
			},
			"ABC123",
		);
		expect(out).toContain("has not started");
	});
});

// =============================================================================
// cooldown handler
// =============================================================================

describe("cooldown", () => {
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

	it("assesses an offline readings list without logging in", async () => {
		const { cooldown } = await import("../src/commands/cooldown.js");
		await cooldown(["--readings", "135@0,70@80,41@290"], { json: false });

		expect(mockGetCredentials).not.toHaveBeenCalled();
		const printed = writeSpy.mock.calls.map((c) => c[0]).join("");
		expect(printed).toContain("Safe.");
	});

	it("outputs JSON for the offline path", async () => {
		const { cooldown } = await import("../src/commands/cooldown.js");
		await cooldown(["--readings", "135@0,70@80,41@290"], { json: true });

		const logSpy = vi.mocked(console.log);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toMatchObject({ source: "readings", entered: true, safe: true });
	});

	it("reads device history and prints the assessment", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		const t0 = new Date("2026-01-01T00:00:00Z");
		mockGetHistory.mockResolvedValue({
			deviceId: "ABC123",
			readings: [
				{ value: 135, units: "F", timestamp: t0.toISOString() },
				{ value: 70, units: "F", timestamp: new Date(t0.getTime() + 80 * 60000).toISOString() },
				{ value: 41, units: "F", timestamp: new Date(t0.getTime() + 290 * 60000).toISOString() },
			],
		});

		const { cooldown } = await import("../src/commands/cooldown.js");
		await cooldown(["ABC123"], { json: true });

		expect(mockGetHistory).toHaveBeenCalledWith("ABC123");
		const logSpy = vi.mocked(console.log);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toMatchObject({ serial: "ABC123", entered: true, safe: true });
	});

	it("exits when no serial and no readings are given", async () => {
		const { cooldown } = await import("../src/commands/cooldown.js");
		await expect(cooldown([], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Provide a device serial"));
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const { cooldown } = await import("../src/commands/cooldown.js");
		await expect(cooldown(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});

	it("exits when the device has no history", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue({ deviceId: "ABC123", readings: [] });
		const { cooldown } = await import("../src/commands/cooldown.js");
		await expect(cooldown(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No history available"));
	});
});
