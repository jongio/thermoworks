import type { DeviceChannel } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { ThermoworksCloud } from "thermoworks-sdk";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetDeviceChannel = vi.mocked(mockClient.getDeviceChannel);
const mockGetAverageTemperature = vi.mocked(mockClient.getAverageTemperature);

// --- Helpers ---

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

// --- Test setup ---

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(process, "exit").mockImplementation(() => {
		throw new Error("process.exit");
	});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

// =============================================================================
// temp
// =============================================================================

describe("temp", () => {
	it("prints the device average temperature as a bare number", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetAverageTemperature.mockResolvedValue({ value: 203.5, units: "F" });

		const { temp } = await import("../src/commands/temp.js");
		await temp(["ABC123"], { json: false });

		expect(mockGetAverageTemperature).toHaveBeenCalledWith("ABC123");
		expect(mockGetDeviceChannel).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(logSpy).toHaveBeenCalledWith("203.5");
	});

	it("prints a single channel reading when --channel is given", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(makeChannel({ number: "2", value: 165, units: "F" }));

		const { temp } = await import("../src/commands/temp.js");
		await temp(["ABC123", "--channel", "2"], { json: false });

		expect(mockGetDeviceChannel).toHaveBeenCalledWith("ABC123", 2);
		expect(mockGetAverageTemperature).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith("165");
	});

	it("outputs JSON for the average when --json is set", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetAverageTemperature.mockResolvedValue({ value: 203.5, units: "F" });

		const { temp } = await import("../src/commands/temp.js");
		await temp(["ABC123"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual({ serial: "ABC123", channel: null, value: 203.5, units: "F" });
	});

	it("outputs JSON with the channel number when --channel and --json are set", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(makeChannel({ number: "3", value: 72.5, units: "F" }));

		const { temp } = await import("../src/commands/temp.js");
		await temp(["ABC123", "--channel", "3"], { json: true });

		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual({ serial: "ABC123", channel: 3, value: 72.5, units: "F" });
	});

	it("exits when no serial is provided", async () => {
		const { temp } = await import("../src/commands/temp.js");
		await expect(temp([], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("exits when the channel is out of range", async () => {
		const { temp } = await import("../src/commands/temp.js");
		await expect(temp(["ABC123", "--channel", "10"], { json: false })).rejects.toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid channel"));
	});

	it("exits when the channel is not an integer", async () => {
		const { temp } = await import("../src/commands/temp.js");
		await expect(temp(["ABC123", "--channel", "1.5"], { json: false })).rejects.toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid channel"));
	});

	it("exits when no average reading is available", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetAverageTemperature.mockResolvedValue(null);

		const { temp } = await import("../src/commands/temp.js");
		await expect(temp(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No temperature readings"));
	});

	it("exits when a channel has no reading", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(makeChannel({ number: "2", value: null, units: null }));

		const { temp } = await import("../src/commands/temp.js");
		await expect(temp(["ABC123", "--channel", "2"], { json: false })).rejects.toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No reading for channel 2"));
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);

		const { temp } = await import("../src/commands/temp.js");
		await expect(temp(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});
});
