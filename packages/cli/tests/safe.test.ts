import type { DeviceChannel } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatSafe, parseManualTemperature, parseSafeArgs } from "../src/commands/safe.js";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetDeviceChannel = vi.fn();
	const mockGetAverageTemperature = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getDeviceChannel = mockGetDeviceChannel;
		getAverageTemperature = mockGetAverageTemperature;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

import { assessPasteurization, ThermoworksCloud } from "thermoworks-sdk";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);
const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetDeviceChannel = vi.mocked(mockClient.getDeviceChannel);
const mockGetAverageTemperature = vi.mocked(mockClient.getAverageTemperature);

function makeChannel(overrides: Partial<DeviceChannel> = {}): DeviceChannel {
	return {
		value: overrides.value ?? null,
		units: overrides.units ?? null,
		label: overrides.label ?? null,
		status: null,
		type: null,
		number: overrides.number ?? null,
		enabled: null,
		color: null,
		lastSeen: null,
		lastTelemetrySaved: null,
		lastEventId: null,
		showAvgTemp: null,
		estimatedAlarmStatus: null,
		rateOfChange: null,
		rateOfChangeUnit: null,
		alarmHigh: null,
		alarmLow: null,
		minimum: null,
		maximum: null,
	};
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
	vi.spyOn(process, "exit").mockImplementation(() => {
		throw new Error("process.exit");
	});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

// =============================================================================
// parseSafeArgs
// =============================================================================

describe("parseSafeArgs", () => {
	it("defaults to poultry with zero held minutes", () => {
		const parsed = parseSafeArgs(["ABC123"]);
		expect(parsed).toEqual({ serial: "ABC123", protein: "poultry", heldMinutes: 0 });
	});

	it("parses channel, protein, and held", () => {
		const parsed = parseSafeArgs(["ABC123", "--channel", "2", "--protein", "beef", "--held", "5"]);
		expect(parsed).toEqual({
			serial: "ABC123",
			channel: 2,
			protein: "beef",
			heldMinutes: 5,
		});
	});

	it("parses manual temperature input", () => {
		const parsed = parseSafeArgs(["--temp", "150f", "--protein", "pork", "--held", "3"]);
		expect(parsed).toEqual({
			manualTemperatureF: 150,
			protein: "pork",
			heldMinutes: 3,
		});
	});

	it("rejects manual temperature with a serial or channel", () => {
		expect(parseSafeArgs(["ABC123", "--temp", "150f"])).toEqual({
			error: expect.stringContaining("device serial"),
		});
		expect(parseSafeArgs(["--temp", "150f", "--channel", "1"])).toEqual({
			error: expect.stringContaining("--channel"),
		});
	});

	it("rejects a channel out of range", () => {
		expect(parseSafeArgs(["ABC123", "--channel", "10"])).toEqual({
			error: expect.stringContaining("--channel"),
		});
	});

	it("rejects an unknown protein", () => {
		expect(parseSafeArgs(["ABC123", "--protein", "fish"])).toEqual({
			error: expect.stringContaining("--protein"),
		});
	});

	it("rejects a negative held value", () => {
		expect(parseSafeArgs(["ABC123", "--held", "-1"])).toEqual({
			error: expect.stringContaining("--held"),
		});
	});

	it("rejects unknown options", () => {
		expect(parseSafeArgs(["ABC123", "--bogus"])).toEqual({
			error: expect.stringContaining("Unknown option"),
		});
	});
});

describe("parseManualTemperature", () => {
	it("parses Fahrenheit, Celsius, and bare Fahrenheit values", () => {
		expect(parseManualTemperature("150f")).toBe(150);
		expect(parseManualTemperature("74c")).toBe(165.2);
		expect(parseManualTemperature("155")).toBe(155);
	});

	it("rejects invalid values", () => {
		expect(parseManualTemperature("hot")).toBeNull();
		expect(parseManualTemperature(undefined)).toBeNull();
	});
});

// =============================================================================
// formatSafe
// =============================================================================

describe("formatSafe", () => {
	it("reports safe now at the instant target", () => {
		const result = assessPasteurization({ temperatureF: 165, holdMinutes: 0 });
		const text = formatSafe(result, "channel 1");
		expect(text).toContain("Safe now");
		expect(text).toContain("instant-safe target");
	});

	it("reports remaining minutes when not yet safe", () => {
		const result = assessPasteurization({ temperatureF: 150, holdMinutes: 0.4 });
		const text = formatSafe(result, "channel 1");
		expect(text).toContain("Safe in 1 min");
	});

	it("reports too low to pasteurize below the minimum", () => {
		const result = assessPasteurization({ temperatureF: 120, holdMinutes: 0 });
		const text = formatSafe(result, "channel 1");
		expect(text).toContain("Too low to pasteurize");
	});

	it("always includes the estimate disclaimer", () => {
		const result = assessPasteurization({ temperatureF: 150, holdMinutes: 0 });
		expect(formatSafe(result, "channel 1")).toContain("Estimate only");
	});
});

// =============================================================================
// safe command
// =============================================================================

describe("safe", () => {
	it("prints a manual pasteurization assessment without credentials", async () => {
		const { safe } = await import("../src/commands/safe.js");
		await safe(["--temp", "150f", "--protein", "poultry", "--held", "0.5"], { json: false });

		expect(mockGetCredentials).not.toHaveBeenCalled();
		const out = stdoutSpy.mock.calls.map((c) => c[0]).join("");
		expect(out).toContain("Poultry on manual temperature: 150°F");
		expect(out).toContain("Safe in");
	});

	it("outputs manual assessment as JSON with null serial and channel", async () => {
		const { safe } = await import("../src/commands/safe.js");
		await safe(["--temp", "74c"], { json: true });

		expect(mockGetCredentials).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.serial).toBeNull();
		expect(output.channel).toBeNull();
		expect(output.temperatureF).toBe(165.2);
	});

	it("prints a pasteurization assessment for a channel", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(makeChannel({ number: "2", value: 150, units: "F" }));

		const { safe } = await import("../src/commands/safe.js");
		await safe(["ABC123", "--channel", "2", "--held", "1"], { json: false });

		expect(mockGetDeviceChannel).toHaveBeenCalledWith("ABC123", 2);
		const out = stdoutSpy.mock.calls.map((c) => c[0]).join("");
		expect(out).toContain("Poultry on channel 2");
	});

	it("converts a Celsius reading to Fahrenheit for the assessment", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		// 74 C is about 165 F, which is at the poultry instant-safe target.
		mockGetDeviceChannel.mockResolvedValue(makeChannel({ number: "1", value: 74, units: "C" }));

		const { safe } = await import("../src/commands/safe.js");
		await safe(["ABC123", "--channel", "1"], { json: false });

		const out = stdoutSpy.mock.calls.map((c) => c[0]).join("");
		expect(out).toContain("Safe now");
	});

	it("outputs JSON when --json is set", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetAverageTemperature.mockResolvedValue({ value: 150, units: "F" });

		const { safe } = await import("../src/commands/safe.js");
		await safe(["ABC123", "--held", "0.5"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.serial).toBe("ABC123");
		expect(output.protein).toBe("poultry");
		expect(output.temperatureF).toBe(150);
		expect(output.safe).toBe(false);
	});

	it("exits when no serial is provided", async () => {
		const { safe } = await import("../src/commands/safe.js");
		await expect(safe([], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const { safe } = await import("../src/commands/safe.js");
		await expect(safe(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});

	it("exits when a channel has no reading", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(makeChannel({ number: "2", value: null, units: null }));

		const { safe } = await import("../src/commands/safe.js");
		await expect(safe(["ABC123", "--channel", "2"], { json: false })).rejects.toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No reading for channel 2"));
	});
});
