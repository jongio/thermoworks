import type { DeviceChannel } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { ThermoworksCloud } from "thermoworks-sdk";
import { formatCarryover, parseCarryoverArgs, resolveRise } from "../src/commands/carryover.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);
const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetDeviceChannel = vi.mocked(mockClient.getDeviceChannel);
const mockGetAverageTemperature = vi.mocked(mockClient.getAverageTemperature);

function makeChannel(overrides: Partial<DeviceChannel> = {}): DeviceChannel {
	return {
		value: overrides.value ?? null,
		units: overrides.units ?? null,
		label: null,
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

// =============================================================================
// parseCarryoverArgs
// =============================================================================

describe("parseCarryoverArgs", () => {
	it("parses serial, target, channel, and rise", () => {
		const parsed = parseCarryoverArgs([
			"ABC123",
			"--target",
			"203",
			"--channel",
			"1",
			"--rise",
			"10",
		]);
		expect(parsed).toEqual({ serial: "ABC123", targetF: 203, channel: 1, riseF: 10 });
	});

	it("parses a size preset", () => {
		const parsed = parseCarryoverArgs(["ABC123", "--target", "135", "--size", "large"]);
		expect(parsed).toEqual({ serial: "ABC123", targetF: 135, size: "large" });
	});

	it("rejects an out-of-range channel", () => {
		expect(parseCarryoverArgs(["ABC123", "--channel", "0"])).toEqual({
			error: expect.stringContaining("--channel"),
		});
	});

	it("rejects a non-numeric target", () => {
		expect(parseCarryoverArgs(["ABC123", "--target", "hot"])).toEqual({
			error: expect.stringContaining("--target"),
		});
	});

	it("rejects a negative rise", () => {
		expect(parseCarryoverArgs(["ABC123", "--rise", "-2"])).toEqual({
			error: expect.stringContaining("--rise"),
		});
	});

	it("rejects an unknown size", () => {
		expect(parseCarryoverArgs(["ABC123", "--size", "huge"])).toEqual({
			error: expect.stringContaining("--size"),
		});
	});

	it("rejects an unknown option", () => {
		expect(parseCarryoverArgs(["ABC123", "--bogus"])).toEqual({
			error: expect.stringContaining("Unknown option"),
		});
	});
});

// =============================================================================
// resolveRise
// =============================================================================

describe("resolveRise", () => {
	it("prefers an explicit rise", () => {
		expect(resolveRise({ riseF: 12 })).toEqual({ riseF: 12, source: "custom" });
	});

	it("uses a size preset when given", () => {
		expect(resolveRise({ size: "large" })).toEqual({ riseF: 10, source: "large" });
	});

	it("defaults to medium when neither is given", () => {
		expect(resolveRise({})).toEqual({ riseF: 6, source: "medium" });
	});
});

// =============================================================================
// formatCarryover
// =============================================================================

describe("formatCarryover", () => {
	it("shows the pull temperature and remaining degrees before the pull point", () => {
		const out = formatCarryover(
			{
				currentTempF: 190,
				targetTempF: 203,
				riseF: 10,
				pullTempF: 193,
				projectedFinalF: 200,
				remainingF: 3,
				pullNow: false,
				overshoot: false,
			},
			"channel 1",
			"large",
		);
		expect(out).toContain("Pull at 193\u00B0F to land on 203\u00B0F");
		expect(out).toContain("3\u00B0F to go");
		expect(out).toContain("large cut");
	});

	it("says pull now at the pull point", () => {
		const out = formatCarryover(
			{
				currentTempF: 193,
				targetTempF: 203,
				riseF: 10,
				pullTempF: 193,
				projectedFinalF: 203,
				remainingF: 0,
				pullNow: true,
				overshoot: false,
			},
			"channel 1",
			"custom",
		);
		expect(out).toContain("Pull now");
		expect(out).toContain("10\u00B0F carryover");
	});

	it("warns when past the pull point", () => {
		const out = formatCarryover(
			{
				currentTempF: 198,
				targetTempF: 203,
				riseF: 10,
				pullTempF: 193,
				projectedFinalF: 208,
				remainingF: -5,
				pullNow: true,
				overshoot: true,
			},
			"channel 1",
			"medium",
		);
		expect(out).toContain("Past the pull point");
		expect(out).toContain("208\u00B0F");
	});
});

// =============================================================================
// carryover handler
// =============================================================================

describe("carryover", () => {
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

	it("reads a channel and prints the pull guidance", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(makeChannel({ number: "1", value: 190, units: "F" }));

		const { carryover } = await import("../src/commands/carryover.js");
		await carryover(["ABC123", "--target", "203", "--channel", "1", "--rise", "10"], {
			json: false,
		});

		expect(mockGetDeviceChannel).toHaveBeenCalledWith("ABC123", 1);
		const printed = writeSpy.mock.calls.map((c) => c[0]).join("");
		expect(printed).toContain("Pull at 193\u00B0F");
	});

	it("converts Celsius readings to Fahrenheit", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		// 90C = 194F, target 96C-ish. Use target in F.
		mockGetDeviceChannel.mockResolvedValue(makeChannel({ number: "1", value: 90, units: "C" }));

		const { carryover } = await import("../src/commands/carryover.js");
		await carryover(["ABC123", "--target", "203", "--channel", "1", "--rise", "5"], {
			json: true,
		});

		const logSpy = vi.mocked(console.log);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.currentTempF).toBeCloseTo(194);
		expect(output.pullTempF).toBe(198);
	});

	it("outputs JSON with the rise source", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetAverageTemperature.mockResolvedValue({ value: 190, units: "F" });

		const { carryover } = await import("../src/commands/carryover.js");
		await carryover(["ABC123", "--target", "203", "--size", "large"], { json: true });

		const logSpy = vi.mocked(console.log);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toMatchObject({
			serial: "ABC123",
			channel: null,
			riseSource: "large",
			pullTempF: 193,
		});
	});

	it("exits when --target is missing", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		const { carryover } = await import("../src/commands/carryover.js");
		await expect(carryover(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--target is required"));
	});

	it("exits when no serial is provided", async () => {
		const { carryover } = await import("../src/commands/carryover.js");
		await expect(carryover(["--target", "203"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const { carryover } = await import("../src/commands/carryover.js");
		await expect(carryover(["ABC123", "--target", "203"], { json: false })).rejects.toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});

	it("exits when a channel has no reading", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(makeChannel({ number: "1", value: null }));
		const { carryover } = await import("../src/commands/carryover.js");
		await expect(
			carryover(["ABC123", "--target", "203", "--channel", "1"], { json: false }),
		).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No reading for channel 1"));
	});
});
