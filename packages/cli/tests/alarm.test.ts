import type { Alarm, Device, DeviceChannel } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockSetAlarm = vi.fn();
	const mockGetDeviceChannel = vi.fn();
	const mockGetDevices = vi.fn();
	const mockGetDevice = vi.fn();
	const mockGetAllDeviceChannels = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		setAlarm = mockSetAlarm;
		getDeviceChannel = mockGetDeviceChannel;
		getDevices = mockGetDevices;
		getDevice = mockGetDevice;
		getAllDeviceChannels = mockGetAllDeviceChannels;
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
const mockSetAlarm = vi.mocked(mockClient.setAlarm);
const mockGetDeviceChannel = vi.mocked(mockClient.getDeviceChannel);
const mockGetDevices = vi.mocked(mockClient.getDevices);
const mockGetDevice = vi.mocked(mockClient.getDevice);
const mockGetAllDeviceChannels = vi.mocked(mockClient.getAllDeviceChannels);

// --- Helpers ---

function makeAlarm(overrides: Partial<Alarm> = {}): Alarm {
	return {
		enabled: overrides.enabled ?? false,
		alarming: overrides.alarming ?? false,
		muted: overrides.muted ?? null,
		value: overrides.value ?? null,
		units: overrides.units ?? null,
		lastNotified: overrides.lastNotified ?? null,
	};
}

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
		alarmHigh: overrides.alarmHigh ?? null,
		alarmLow: overrides.alarmLow ?? null,
		minimum: null,
		maximum: null,
	};
}

function makeDevice(overrides: Partial<Device> & { serial: string }): Device {
	return {
		serial: overrides.serial,
		label: overrides.label ?? null,
		type: overrides.type ?? null,
		status: overrides.status ?? null,
	} as Device;
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
// alarm set
// =============================================================================

describe("alarmSet", () => {
	it("sets high alarm and shows confirmation", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetAlarm.mockResolvedValue(undefined);
		mockGetDeviceChannel.mockResolvedValue(
			makeChannel({
				alarmHigh: makeAlarm({ enabled: true, value: 275, units: "F" }),
				alarmLow: null,
			}),
		);

		const { alarmSet } = await import("../src/commands/alarm.js");
		await alarmSet(["ABC123", "--channel", "1", "--high", "275"], { json: false });

		expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 1, {
			high: { value: 275, enabled: true },
		});
		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Alarm set on ABC123");
		expect(output).toContain("Channel 1");
		expect(output).toContain("high=275\u00B0F");
	});

	it("sets low alarm and shows confirmation", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetAlarm.mockResolvedValue(undefined);
		mockGetDeviceChannel.mockResolvedValue(
			makeChannel({
				alarmHigh: null,
				alarmLow: makeAlarm({ enabled: true, value: 32, units: "C" }),
			}),
		);

		const { alarmSet } = await import("../src/commands/alarm.js");
		await alarmSet(["DEV1", "--channel", "3", "--low", "32"], { json: false });

		expect(mockSetAlarm).toHaveBeenCalledWith("DEV1", 3, {
			low: { value: 32, enabled: true },
		});
		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("low=32\u00B0C");
	});

	it("sets both high and low alarms", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetAlarm.mockResolvedValue(undefined);
		mockGetDeviceChannel.mockResolvedValue(
			makeChannel({
				alarmHigh: makeAlarm({ enabled: true, value: 275, units: "F" }),
				alarmLow: makeAlarm({ enabled: true, value: 150, units: "F" }),
			}),
		);

		const { alarmSet } = await import("../src/commands/alarm.js");
		await alarmSet(["ABC123", "--channel", "1", "--high", "275", "--low", "150"], { json: false });

		expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 1, {
			high: { value: 275, enabled: true },
			low: { value: 150, enabled: true },
		});
		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("high=275\u00B0F");
		expect(output).toContain("low=150\u00B0F");
	});

	it("outputs JSON when --json flag is set", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetAlarm.mockResolvedValue(undefined);
		const alarmHigh = makeAlarm({ enabled: true, value: 275, units: "F" });
		mockGetDeviceChannel.mockResolvedValue(makeChannel({ alarmHigh, alarmLow: null }));

		const { alarmSet } = await import("../src/commands/alarm.js");
		await alarmSet(["ABC123", "--channel", "2", "--high", "275"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.serial).toBe("ABC123");
		expect(output.channel).toBe(2);
		expect(output.alarmHigh.enabled).toBe(true);
		expect(output.alarmHigh.value).toBe(275);
	});

	it("exits when no serial provided", async () => {
		const { alarmSet } = await import("../src/commands/alarm.js");
		await expect(alarmSet([], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("exits when --channel is missing", async () => {
		const { alarmSet } = await import("../src/commands/alarm.js");
		await expect(alarmSet(["ABC123", "--high", "275"], { json: false })).rejects.toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--channel"));
	});

	it("exits when channel is out of range", async () => {
		const { alarmSet } = await import("../src/commands/alarm.js");
		await expect(
			alarmSet(["ABC123", "--channel", "10", "--high", "275"], { json: false }),
		).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid channel"));
	});

	it("exits when channel is not an integer", async () => {
		const { alarmSet } = await import("../src/commands/alarm.js");
		await expect(
			alarmSet(["ABC123", "--channel", "1.5", "--high", "275"], { json: false }),
		).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid channel"));
	});

	it("exits when channel is zero", async () => {
		const { alarmSet } = await import("../src/commands/alarm.js");
		await expect(
			alarmSet(["ABC123", "--channel", "0", "--high", "275"], { json: false }),
		).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid channel"));
	});

	it("exits when neither --high nor --low is provided", async () => {
		const { alarmSet } = await import("../src/commands/alarm.js");
		await expect(alarmSet(["ABC123", "--channel", "1"], { json: false })).rejects.toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--high or --low"));
	});

	it("exits when --high value is not a number", async () => {
		const { alarmSet } = await import("../src/commands/alarm.js");
		await expect(
			alarmSet(["ABC123", "--channel", "1", "--high", "abc"], { json: false }),
		).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid high value"));
	});

	it("exits when --low value is not a number", async () => {
		const { alarmSet } = await import("../src/commands/alarm.js");
		await expect(
			alarmSet(["ABC123", "--channel", "1", "--low", "xyz"], { json: false }),
		).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid low value"));
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);

		const { alarmSet } = await import("../src/commands/alarm.js");
		await expect(
			alarmSet(["ABC123", "--channel", "1", "--high", "275"], { json: false }),
		).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});

	it("accepts negative temperature values", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetAlarm.mockResolvedValue(undefined);
		mockGetDeviceChannel.mockResolvedValue(
			makeChannel({
				alarmLow: makeAlarm({ enabled: true, value: -10, units: "C" }),
			}),
		);

		const { alarmSet } = await import("../src/commands/alarm.js");
		await alarmSet(["ABC123", "--channel", "1", "--low", "-10"], { json: false });

		expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 1, {
			low: { value: -10, enabled: true },
		});
	});

	it("accepts decimal temperature values", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetAlarm.mockResolvedValue(undefined);
		mockGetDeviceChannel.mockResolvedValue(
			makeChannel({
				alarmHigh: makeAlarm({ enabled: true, value: 72.5, units: "F" }),
			}),
		);

		const { alarmSet } = await import("../src/commands/alarm.js");
		await alarmSet(["ABC123", "--channel", "1", "--high", "72.5"], { json: false });

		expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 1, {
			high: { value: 72.5, enabled: true },
		});
	});
});

// =============================================================================
// alarm clear
// =============================================================================

describe("alarmClear", () => {
	it("clears alarms and shows confirmation", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetAlarm.mockResolvedValue(undefined);
		mockGetDeviceChannel.mockResolvedValue(
			makeChannel({
				alarmHigh: makeAlarm({ enabled: false }),
				alarmLow: makeAlarm({ enabled: false }),
			}),
		);

		const { alarmClear } = await import("../src/commands/alarm.js");
		await alarmClear(["ABC123", "--channel", "1"], { json: false });

		expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 1, {
			high: { value: 0, enabled: false },
			low: { value: 0, enabled: false },
		});
		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Alarms cleared on ABC123");
		expect(output).toContain("alarms disabled");
	});

	it("outputs JSON when --json flag is set", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetAlarm.mockResolvedValue(undefined);
		const alarmHigh = makeAlarm({ enabled: false });
		const alarmLow = makeAlarm({ enabled: false });
		mockGetDeviceChannel.mockResolvedValue(makeChannel({ alarmHigh, alarmLow }));

		const { alarmClear } = await import("../src/commands/alarm.js");
		await alarmClear(["ABC123", "--channel", "1"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.serial).toBe("ABC123");
		expect(output.channel).toBe(1);
		expect(output.alarmHigh.enabled).toBe(false);
		expect(output.alarmLow.enabled).toBe(false);
	});

	it("exits when no serial provided", async () => {
		const { alarmClear } = await import("../src/commands/alarm.js");
		await expect(alarmClear([], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("exits when --channel is missing", async () => {
		const { alarmClear } = await import("../src/commands/alarm.js");
		await expect(alarmClear(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--channel"));
	});

	it("exits when channel is invalid", async () => {
		const { alarmClear } = await import("../src/commands/alarm.js");
		await expect(alarmClear(["ABC123", "--channel", "0"], { json: false })).rejects.toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid channel"));
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);

		const { alarmClear } = await import("../src/commands/alarm.js");
		await expect(alarmClear(["ABC123", "--channel", "1"], { json: false })).rejects.toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});

	it("handles channel 9 (upper bound)", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetAlarm.mockResolvedValue(undefined);
		mockGetDeviceChannel.mockResolvedValue(
			makeChannel({
				alarmHigh: makeAlarm({ enabled: false }),
				alarmLow: makeAlarm({ enabled: false }),
			}),
		);

		const { alarmClear } = await import("../src/commands/alarm.js");
		await alarmClear(["ABC123", "--channel", "9"], { json: false });

		expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 9, {
			high: { value: 0, enabled: false },
			low: { value: 0, enabled: false },
		});
	});
});

// =============================================================================
// alarm list
// =============================================================================

describe("alarmList", () => {
	it("lists armed alarms across all devices grouped by device", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "DEV1", label: "Smoker" }),
			makeDevice({ serial: "DEV2", label: null }),
		]);
		mockGetAllDeviceChannels.mockImplementation(async (serial: string) => {
			if (serial === "DEV1") {
				return [
					makeChannel({
						number: "1",
						label: "Brisket",
						alarmHigh: makeAlarm({ enabled: true, value: 203, units: "F" }),
						alarmLow: null,
					}),
					makeChannel({ number: "2", label: "Ambient", alarmHigh: null, alarmLow: null }),
				];
			}
			return [
				makeChannel({
					number: "1",
					label: "Fridge",
					alarmHigh: null,
					alarmLow: makeAlarm({ enabled: true, value: 34, units: "F" }),
				}),
			];
		});

		const { alarmList } = await import("../src/commands/alarm.js");
		await alarmList([], { json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Smoker (DEV1)");
		expect(output).toContain("Brisket: high=203\u00B0F");
		expect(output).toContain("DEV2");
		expect(output).toContain("Fridge: low=34\u00B0F");
		// Channel with no armed alarm is omitted.
		expect(output).not.toContain("Ambient");
	});

	it("scopes to a single device when a serial is given", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevice.mockResolvedValue(makeDevice({ serial: "DEV1", label: "Smoker" }));
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({
				number: "1",
				label: "Brisket",
				alarmHigh: makeAlarm({ enabled: true, value: 203, units: "F" }),
				alarmLow: makeAlarm({ enabled: true, value: 150, units: "F" }),
			}),
		]);

		const { alarmList } = await import("../src/commands/alarm.js");
		await alarmList(["DEV1"], { json: false });

		expect(mockGetDevice).toHaveBeenCalledWith("DEV1");
		expect(mockGetDevices).not.toHaveBeenCalled();
		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Brisket: high=203\u00B0F  low=150\u00B0F");
	});

	it("outputs JSON when --json flag is set", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({
				number: "1",
				label: "Brisket",
				alarmHigh: makeAlarm({ enabled: true, value: 203, units: "F" }),
				alarmLow: null,
			}),
		]);

		const { alarmList } = await import("../src/commands/alarm.js");
		await alarmList(["--json"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(Array.isArray(output)).toBe(true);
		expect(output).toHaveLength(1);
		expect(output[0].serial).toBe("DEV1");
		expect(output[0].deviceLabel).toBe("Smoker");
		expect(output[0].channel).toBe(1);
		expect(output[0].channelLabel).toBe("Brisket");
		expect(output[0].alarmHigh.value).toBe(203);
		expect(output[0].alarmLow).toBeNull();
	});

	it("shows a message when no armed alarms exist across all devices", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ number: "1", label: "Brisket", alarmHigh: null, alarmLow: null }),
		]);

		const { alarmList } = await import("../src/commands/alarm.js");
		await alarmList([], { json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("No armed alarms on any device");
	});

	it("shows a device-scoped message when the given device has no armed alarms", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevice.mockResolvedValue(makeDevice({ serial: "DEV1", label: "Smoker" }));
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ number: "1", label: "Brisket", alarmHigh: null, alarmLow: null }),
		]);

		const { alarmList } = await import("../src/commands/alarm.js");
		await alarmList(["DEV1"], { json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("No armed alarms on DEV1");
	});

	it("outputs an empty JSON array when no armed alarms exist", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ number: "1", label: "Brisket", alarmHigh: null, alarmLow: null }),
		]);

		const { alarmList } = await import("../src/commands/alarm.js");
		await alarmList(["--json"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual([]);
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);

		const { alarmList } = await import("../src/commands/alarm.js");
		await expect(alarmList([], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});
});
