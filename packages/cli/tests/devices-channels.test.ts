import type { Device, DeviceChannel } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetDevices = vi.fn();
	const mockGetAllDeviceChannels = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getDevices = mockGetDevices;
		getAllDeviceChannels = mockGetAllDeviceChannels;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

vi.mock("../src/config.js", () => ({
	loadConfig: vi.fn().mockResolvedValue({ devices: [], refreshSeconds: 30 }),
	saveConfig: vi.fn(),
}));

import { ThermoworksCloud } from "thermoworks-sdk";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetDevices = vi.mocked(mockClient.getDevices);
const mockGetAllDeviceChannels = vi.mocked(mockClient.getAllDeviceChannels);

// --- Helpers ---

function makeDevice(overrides: Partial<Device> & { serial: string }): Device {
	return {
		serial: overrides.serial,
		deviceId: null,
		label: overrides.label ?? null,
		type: overrides.type ?? null,
		device: null,
		status: overrides.status ?? null,
		battery: overrides.battery ?? null,
		batteryState: null,
		wifiStrength: null,
		firmware: null,
		color: null,
		thumbnail: null,
		deviceDisplayUnits: null,
		iotDeviceId: null,
		iotCoreDeviceBlocked: null,
		recordingIntervalInSeconds: null,
		transmitIntervalInSeconds: null,
		readInterval: null,
		heartbeatInterval: null,
		temperatureDeltaTrigger: null,
		pendingLoad: null,
		batteryAlertSent: null,
		lastSeen: overrides.lastSeen ?? null,
		lastTelemetrySaved: null,
		latestReading: null,
		lastWifiConnection: null,
		lastBluetoothConnection: null,
		sessionStart: null,
		sessionLabel: null,
		lastArchive: null,
		lastPurged: null,
		assignedToAccountOn: null,
		accountId: null,
		notes: null,
		public: null,
		publicLink: null,
		searModeEnabled: null,
		showSensorChannels: null,
		ringColors: null,
		gateway: null,
		fan: null,
		bigQuery: null,
	};
}

function makeChannel(overrides: Partial<DeviceChannel> = {}): DeviceChannel {
	return {
		value: overrides.value ?? null,
		units: overrides.units ?? null,
		label: overrides.label ?? null,
		status: overrides.status ?? null,
		type: overrides.type ?? null,
		number: overrides.number ?? null,
		enabled: overrides.enabled ?? null,
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

// --- Test suites ---

let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

// =============================================================================
// Channel display in devices command
// =============================================================================

describe("devices - channel readings", () => {
	it("shows channel readings under each device by default", async () => {
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "SMOKE1", label: "Smoker", type: "signals", status: "NORMAL" }),
		]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", label: "Ambient", number: "1" }),
			makeChannel({ value: 165, units: "F", label: "Meat", number: "2" }),
			makeChannel({ value: 228, units: "F", label: "Pit", number: "3" }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Smoker");
		expect(output).toContain("Ch1 Ambient: 225°F [NORMAL]");
		expect(output).toContain("Ch2 Meat: 165°F [NORMAL]");
		expect(output).toContain("Ch3 Pit: 228°F [NORMAL]");
	});

	it("hides channels when channels option is false (--no-channels)", async () => {
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "SMOKE1", label: "Smoker", type: "signals" }),
		]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", label: "Ambient", number: "1" }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: false, channels: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Smoker");
		expect(output).not.toContain("Ch1");
		expect(output).not.toContain("225°F");
	});

	it("does not fetch channels when channels option is false", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "SMOKE1", label: "Smoker" })]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: false, channels: false });

		expect(mockGetAllDeviceChannels).not.toHaveBeenCalled();
	});

	it("fetches channels for all devices in parallel", async () => {
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "DEV1", label: "Device 1" }),
			makeDevice({ serial: "DEV2", label: "Device 2" }),
		]);
		mockGetAllDeviceChannels
			.mockResolvedValueOnce([makeChannel({ value: 225, units: "F", label: "Probe", number: "1" })])
			.mockResolvedValueOnce([
				makeChannel({ value: 38, units: "F", label: "Internal", number: "1" }),
			]);

		const { devices } = await import("../src/commands/devices.js");
		await devices();

		expect(mockGetAllDeviceChannels).toHaveBeenCalledTimes(2);
		expect(mockGetAllDeviceChannels).toHaveBeenCalledWith("DEV1");
		expect(mockGetAllDeviceChannels).toHaveBeenCalledWith("DEV2");

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("225°F");
		expect(output).toContain("38°F");
	});

	it("skips channels with enabled: false", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", label: "Active", number: "1", enabled: true }),
			makeChannel({ value: 0, units: "F", label: "Disabled", number: "2", enabled: false }),
			makeChannel({ value: 165, units: "F", label: "Meat", number: "3", enabled: true }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Ch1 Active: 225°F");
		expect(output).not.toContain("Disabled");
		expect(output).toContain("Ch3 Meat: 165°F");
	});

	it("skips channels with null value", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", label: "Active", number: "1" }),
			makeChannel({ value: null, units: "F", label: "No Reading", number: "2" }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Ch1 Active: 225°F");
		expect(output).not.toContain("No Reading");
	});

	it("colors HIGH alarm state in red", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({
				value: 275,
				units: "F",
				label: "Pit",
				number: "1",
				alarmHigh: {
					enabled: true,
					alarming: true,
					muted: null,
					value: 250,
					units: "F",
					lastNotified: null,
				},
			}),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("\x1b[31m[HIGH]\x1b[0m");
		expect(output).toContain("Ch1 Pit: 275°F");
	});

	it("colors LOW alarm state in blue", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Fridge" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({
				value: 28,
				units: "F",
				label: "Internal",
				number: "1",
				alarmLow: {
					enabled: true,
					alarming: true,
					muted: null,
					value: 32,
					units: "F",
					lastNotified: null,
				},
			}),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("\x1b[34m[LOW]\x1b[0m");
		expect(output).toContain("Ch1 Internal: 28°F");
	});

	it("shows [NORMAL] without color when no alarm is active", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", label: "Pit", number: "1" }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("[NORMAL]");
		expect(output).not.toContain("\x1b[31m");
		expect(output).not.toContain("\x1b[34m");
	});

	it("uses channel number from data, not array index", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", label: "Pit", number: "3" }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Ch3 Pit:");
	});

	it("falls back to index-based channel number when number is null", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", label: "Pit", number: null }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		// First channel, index 0 -> "1"
		expect(output).toContain("Ch1 Pit:");
	});

	it("handles device with empty channels array gracefully", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Offline Device" })]);
		mockGetAllDeviceChannels.mockResolvedValue([]);

		const { devices } = await import("../src/commands/devices.js");
		await devices();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Offline Device");
		// No channel lines
		expect(output).not.toContain("Ch");
	});
});

// =============================================================================
// JSON output with channels
// =============================================================================

describe("devices --json with channels", () => {
	it("includes channels array in JSON output", async () => {
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "SMOKE1", label: "Smoker", type: "signals" }),
		]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", label: "Ambient", number: "1" }),
			makeChannel({ value: 165, units: "F", label: "Meat", number: "2" }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: true });

		const raw = logSpy.mock.calls[0][0] as string;
		const output = JSON.parse(raw);
		expect(output).toHaveLength(1);
		expect(output[0].serial).toBe("SMOKE1");
		expect(output[0].channels).toHaveLength(2);
		expect(output[0].channels[0]).toEqual({
			number: "1",
			label: "Ambient",
			displayName: "Ambient",
			value: 225,
			units: "F",
			alarm: "none",
		});
		expect(output[0].channels[1]).toEqual({
			number: "2",
			label: "Meat",
			displayName: "Meat",
			value: 165,
			units: "F",
			alarm: "none",
		});
	});

	it("excludes disabled channels from JSON output", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", label: "Active", number: "1", enabled: true }),
			makeChannel({ value: 0, units: "F", label: "Disabled", number: "2", enabled: false }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: true });

		const raw = logSpy.mock.calls[0][0] as string;
		const output = JSON.parse(raw);
		expect(output[0].channels).toHaveLength(1);
		expect(output[0].channels[0].label).toBe("Active");
	});

	it("includes alarm state in JSON channel output", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({
				value: 275,
				units: "F",
				label: "Pit",
				number: "1",
				alarmHigh: {
					enabled: true,
					alarming: true,
					muted: null,
					value: 250,
					units: "F",
					lastNotified: null,
				},
			}),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: true });

		const raw = logSpy.mock.calls[0][0] as string;
		const output = JSON.parse(raw);
		expect(output[0].channels[0].alarm).toBe("high");
	});

	it("outputs no ANSI codes in JSON mode", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({
				value: 275,
				units: "F",
				label: "Pit",
				number: "1",
				alarmHigh: {
					enabled: true,
					alarming: true,
					muted: null,
					value: 250,
					units: "F",
					lastNotified: null,
				},
			}),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: true });

		const raw = logSpy.mock.calls[0][0] as string;
		expect(raw).not.toContain("\x1b[");
	});

	it("skips channel fetch in JSON when channels: false", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", label: "Smoker" })]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: true, channels: false });

		expect(mockGetAllDeviceChannels).not.toHaveBeenCalled();

		const raw = logSpy.mock.calls[0][0] as string;
		const output = JSON.parse(raw);
		// When channels disabled, output should be plain device list without channels
		expect(output[0].serial).toBe("DEV1");
	});
});
