import type { DeviceChannel } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetDeviceChannel = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getDeviceChannel = mockGetDeviceChannel;
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
		rateOfChange: overrides.rateOfChange ?? null,
		rateOfChangeUnit: null,
		alarmHigh: overrides.alarmHigh ?? null,
		alarmLow: null,
		minimum: null,
		maximum: null,
	};
}

function highAlarm(value: number, enabled = true) {
	return { enabled, alarming: false, muted: null, value, units: "F", lastNotified: null };
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
// parseEtaArgs
// =============================================================================

describe("parseEtaArgs", () => {
	it("returns null when the serial is missing", async () => {
		const { parseEtaArgs } = await import("../src/commands/eta.js");
		expect(parseEtaArgs([])).toBeNull();
	});

	it("defaults the channel to 1 and reads the target", async () => {
		const { parseEtaArgs } = await import("../src/commands/eta.js");
		expect(parseEtaArgs(["ABC123", "--target", "203"])).toEqual({
			serial: "ABC123",
			channel: 1,
			target: 203,
		});
	});

	it("reads an explicit channel", async () => {
		const { parseEtaArgs } = await import("../src/commands/eta.js");
		expect(parseEtaArgs(["ABC123", "--channel", "2"])).toEqual({
			serial: "ABC123",
			channel: 2,
			target: undefined,
		});
	});

	it("exits when the channel is out of range", async () => {
		const { parseEtaArgs } = await import("../src/commands/eta.js");
		expect(() => parseEtaArgs(["ABC123", "--channel", "10"])).toThrow("process.exit");
	});
});

// =============================================================================
// eta
// =============================================================================

describe("eta", () => {
	it("estimates time-to-target using the channel high alarm", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(
			makeChannel({
				number: "2",
				value: 180,
				units: "F",
				rateOfChange: 1,
				alarmHigh: highAlarm(203),
			}),
		);

		const { eta } = await import("../src/commands/eta.js");
		await eta(["ABC123", "--channel", "2"], { json: false });

		expect(mockGetDeviceChannel).toHaveBeenCalledWith("ABC123", 2);
		const printed = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(printed).toContain("ETA for ABC123 channel 2:");
		expect(printed).toContain("Time left:");
	});

	it("outputs the JSON prediction shape when --json is set", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(
			makeChannel({
				number: "1",
				value: 150,
				units: "F",
				rateOfChange: 1,
				alarmHigh: highAlarm(203),
			}),
		);

		const { eta } = await import("../src/commands/eta.js");
		await eta(["ABC123"], { json: true });

		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.serial).toBe("ABC123");
		expect(output.channel).toBe(1);
		expect(output.target).toBe(203);
		expect(output.estimatedMinutes).toBe(53);
		expect(output.method).toBe("linear");
	});

	it("uses an explicit --target over the high alarm", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(
			makeChannel({
				number: "1",
				value: 150,
				units: "F",
				rateOfChange: 2,
				alarmHigh: highAlarm(203),
			}),
		);

		const { eta } = await import("../src/commands/eta.js");
		await eta(["ABC123", "--target", "170"], { json: true });

		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.target).toBe(170);
		expect(output.estimatedMinutes).toBe(10);
	});

	it("reports done when already at or past the target", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(
			makeChannel({
				number: "1",
				value: 205,
				units: "F",
				rateOfChange: 1,
				alarmHigh: highAlarm(203),
			}),
		);

		const { eta } = await import("../src/commands/eta.js");
		await eta(["ABC123"], { json: false });

		const printed = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(printed).toContain("Done.");
	});

	it("cannot estimate when the temperature is not rising", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(
			makeChannel({
				number: "1",
				value: 150,
				units: "F",
				rateOfChange: 0,
				alarmHigh: highAlarm(203),
			}),
		);

		const { eta } = await import("../src/commands/eta.js");
		await eta(["ABC123"], { json: false });

		const printed = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(printed).toContain("Cannot estimate");
	});

	it("exits when the channel has no reading", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(makeChannel({ number: "1", value: null }));

		const { eta } = await import("../src/commands/eta.js");
		await expect(eta(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No reading for channel 1"));
	});

	it("exits when there is no target and no high alarm", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDeviceChannel.mockResolvedValue(
			makeChannel({ number: "1", value: 150, units: "F", rateOfChange: 1, alarmHigh: null }),
		);

		const { eta } = await import("../src/commands/eta.js");
		await expect(eta(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No target for channel 1"));
	});

	it("exits when no serial is provided", async () => {
		const { eta } = await import("../src/commands/eta.js");
		await expect(eta([], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);

		const { eta } = await import("../src/commands/eta.js");
		await expect(eta(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});
});
