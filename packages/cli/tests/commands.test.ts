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
	loadConfig: vi.fn(),
	readCache: vi.fn(),
	writeCache: vi.fn(),
	saveConfig: vi.fn(),
	getConfigPath: vi.fn(() => "/mock/.thermoworks/config.json"),
}));

vi.mock("../src/prompt.js", () => ({
	prompt: vi.fn(),
	promptCheckbox: vi.fn(),
	promptRadio: vi.fn(),
}));

import { ThermoworksCloud } from "thermoworks-sdk";
import { loadConfig, readCache, writeCache } from "../src/config.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);
const mockLoadConfig = vi.mocked(loadConfig);
const mockReadCache = vi.mocked(readCache);
const mockWriteCache = vi.mocked(writeCache);

// Access instance methods through prototype since the class is mocked
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
		status: overrides.status ?? null,
		battery: overrides.battery ?? null,
		batteryState: null,
		wifiStrength: null,
		firmware: null,
		color: null,
		thumbnail: null,
		deviceDisplayUnits: null,
		iotDeviceId: null,
		recordingIntervalInSeconds: null,
		transmitIntervalInSeconds: null,
		pendingLoad: null,
		batteryAlertSent: null,
		lastSeen: overrides.lastSeen ?? null,
		lastTelemetrySaved: null,
		lastWifiConnection: null,
		lastBluetoothConnection: null,
		sessionStart: null,
		accountId: null,
	};
}

function makeChannel(overrides: Partial<DeviceChannel> = {}): DeviceChannel {
	return {
		value: overrides.value ?? null,
		units: overrides.units ?? null,
		label: overrides.label ?? null,
		status: null,
		type: null,
		number: null,
		lastSeen: null,
		lastTelemetrySaved: null,
		showAvgTemp: null,
		alarmHigh: null,
		alarmLow: null,
		minimum: null,
		maximum: null,
	};
}

// --- Test suites ---

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

// =============================================================================
// commands/devices.ts
// =============================================================================

describe("devices", () => {
	it("lists devices with label, type, status, battery, and lastSeen", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([
			makeDevice({
				serial: "ABC123",
				label: "Pit Sensor",
				type: "smoke",
				status: "online",
				battery: 85,
				lastSeen: new Date("2026-01-15T12:00:00Z"),
			}),
		]);

		vi.spyOn(Date, "now").mockReturnValue(new Date("2026-01-15T12:05:00Z").getTime());
		const { devices } = await import("../src/commands/devices.js");
		await devices();
		vi.restoreAllMocks();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Found 1 device");
		expect(output).toContain("Pit Sensor");
		expect(output).toContain("(smoke)");
		expect(output).toContain("[online]");
		expect(output).toContain("85%");
		expect(output).toContain("5m ago");
	});

	it("shows 'No devices found.' when empty", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([]);

		const { devices } = await import("../src/commands/devices.js");
		await devices();

		expect(logSpy).toHaveBeenCalledWith("No devices found.");
	});

	it("handles device with null optional fields gracefully", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([
			makeDevice({
				serial: "MIN001",
				label: null,
				type: null,
				status: null,
				battery: null,
				lastSeen: null,
			}),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		// Falls back to serial when label is null
		expect(output).toContain("MIN001");
		// No parenthetical type, no bracket status, no battery, no lastSeen
		expect(output).not.toContain("(");
		expect(output).not.toContain("[");
		expect(output).not.toContain("\u{1F50B}");
		expect(output).not.toContain("last seen");
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { devices } = await import("../src/commands/devices.js");
		await expect(devices()).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});

	it("shows plural 'devices' for multiple", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "A" }), makeDevice({ serial: "B" })]);

		const { devices } = await import("../src/commands/devices.js");
		await devices();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Found 2 devices");
	});
});

// =============================================================================
// commands/copilot.ts - copilotStatus()
// =============================================================================

describe("copilotStatus", () => {
	it("returns cached output when cache is fresh", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockLoadConfig.mockResolvedValue({
			devices: [{ serial: "X", label: "X", channels: "avg" }],
			refreshSeconds: 30,
		});
		mockReadCache.mockResolvedValue("\u{1F525} Smoker:225\u00B0F");

		const { copilotStatus } = await import("../src/commands/copilot.js");
		await copilotStatus();

		expect(logSpy).toHaveBeenCalledWith("\u{1F525} Smoker:225\u00B0F");
		// Should NOT have called the API
		expect(mockGetDevices).not.toHaveBeenCalled();
	});

	it("fetches and formats temperatures for 'avg' channel config", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockLoadConfig.mockResolvedValue({
			devices: [{ serial: "ABC123", label: "Smoker", channels: "avg" }],
			refreshSeconds: 30,
		});
		mockReadCache.mockResolvedValue(null);
		mockWriteCache.mockResolvedValue(undefined);
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "ABC123", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 220, units: "F", label: "Probe 1" }),
			makeChannel({ value: 230, units: "F", label: "Probe 2" }),
		]);

		const { copilotStatus } = await import("../src/commands/copilot.js");
		await copilotStatus();

		// Average of 220 and 230 = 225
		expect(logSpy).toHaveBeenCalledWith("\u{1F525} Smoker:225\u00B0F");
		expect(mockWriteCache).toHaveBeenCalledWith("\u{1F525} Smoker:225\u00B0F");
	});

	it("fetches specific channel by number", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockLoadConfig.mockResolvedValue({
			devices: [{ serial: "ABC123", label: "Grill", channels: [2] }],
			refreshSeconds: 30,
		});
		mockReadCache.mockResolvedValue(null);
		mockWriteCache.mockResolvedValue(undefined);
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "ABC123", label: "Grill" })]);
		// Channel array: index 0=ch1, index 1=ch2
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 180, units: "F", label: "Ambient" }),
			makeChannel({ value: 350, units: "F", label: "Grate" }),
		]);

		const { copilotStatus } = await import("../src/commands/copilot.js");
		await copilotStatus();

		// Single channel config uses device label without channel label
		expect(logSpy).toHaveBeenCalledWith("\u{1F525} Grill:350\u00B0F");
	});

	it("handles multiple channels with labels", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockLoadConfig.mockResolvedValue({
			devices: [{ serial: "ABC123", label: "Smoker", channels: [1, 3] }],
			refreshSeconds: 30,
		});
		mockReadCache.mockResolvedValue(null);
		mockWriteCache.mockResolvedValue(undefined);
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "ABC123", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", label: "Pit" }),
			makeChannel({ value: 45, units: "H", label: "Humidity" }), // humidity - filtered in avg but present in allChannels
			makeChannel({ value: 165, units: "F", label: "Meat" }),
		]);

		const { copilotStatus } = await import("../src/commands/copilot.js");
		await copilotStatus();

		// Multiple channels include channel labels in output
		const output = logSpy.mock.calls[0]?.[0] as string;
		expect(output).toContain("\u{1F525}");
		expect(output).toContain("Smoker:Pit:225\u00B0F");
		expect(output).toContain("Smoker:Meat:165\u00B0F");
		expect(output).toContain(" \u00B7 "); // dot separator
	});

	it("outputs format: '\u{1F525} Label:XX\u00B0F \u00B7 Label2:YY\u00B0F'", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockLoadConfig.mockResolvedValue({
			devices: [
				{ serial: "DEV1", label: "Pit", channels: "avg" },
				{ serial: "DEV2", label: "Meat", channels: "avg" },
			],
			refreshSeconds: 30,
		});
		mockReadCache.mockResolvedValue(null);
		mockWriteCache.mockResolvedValue(undefined);
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "DEV1", label: "Pit" }),
			makeDevice({ serial: "DEV2", label: "Meat" }),
		]);
		mockGetAllDeviceChannels
			.mockResolvedValueOnce([makeChannel({ value: 225, units: "F" })])
			.mockResolvedValueOnce([makeChannel({ value: 165, units: "F" })]);

		const { copilotStatus } = await import("../src/commands/copilot.js");
		await copilotStatus();

		expect(logSpy).toHaveBeenCalledWith("\u{1F525} Pit:225\u00B0F \u00B7 Meat:165\u00B0F");
	});

	it("is silent on error (no console output)", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockLoadConfig.mockResolvedValue({
			devices: [{ serial: "X", label: "X", channels: "avg" }],
			refreshSeconds: 30,
		});
		mockReadCache.mockResolvedValue(null);
		mockGetDevices.mockRejectedValue(new Error("network timeout"));

		const { copilotStatus } = await import("../src/commands/copilot.js");
		await copilotStatus();

		// Silent failure - no output at all
		expect(logSpy).not.toHaveBeenCalled();
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("is silent when no credentials", async () => {
		mockGetCredentials.mockResolvedValue(null);

		const { copilotStatus } = await import("../src/commands/copilot.js");
		await copilotStatus();

		expect(logSpy).not.toHaveBeenCalled();
		expect(mockGetDevices).not.toHaveBeenCalled();
	});

	it("excludes humidity channels from average calculation", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockLoadConfig.mockResolvedValue({
			devices: [{ serial: "ABC123", label: "Env", channels: "avg" }],
			refreshSeconds: 30,
		});
		mockReadCache.mockResolvedValue(null);
		mockWriteCache.mockResolvedValue(undefined);
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "ABC123", label: "Env" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 72, units: "F", label: "Temp" }),
			makeChannel({ value: 45, units: "H", label: "Humidity" }), // Should be excluded
		]);

		const { copilotStatus } = await import("../src/commands/copilot.js");
		await copilotStatus();

		// Only temp channel considered (72, not avg of 72+45)
		expect(logSpy).toHaveBeenCalledWith("\u{1F525} Env:72\u00B0F");
	});

	it("produces no output when device has no temperature channels", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockLoadConfig.mockResolvedValue({
			devices: [{ serial: "ABC123", label: "Sensor", channels: "avg" }],
			refreshSeconds: 30,
		});
		mockReadCache.mockResolvedValue(null);
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "ABC123", label: "Sensor" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 55, units: "H", label: "Humidity Only" }),
		]);

		const { copilotStatus } = await import("../src/commands/copilot.js");
		await copilotStatus();

		// No temp channels means empty parts, empty output string, no log
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("skips device not found in API response", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockLoadConfig.mockResolvedValue({
			devices: [{ serial: "MISSING", label: "Gone", channels: "avg" }],
			refreshSeconds: 30,
		});
		mockReadCache.mockResolvedValue(null);
		mockGetDevices.mockResolvedValue([]); // device not in response

		const { copilotStatus } = await import("../src/commands/copilot.js");
		await copilotStatus();

		expect(logSpy).not.toHaveBeenCalled();
	});

	it("returns early when config has no devices", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockLoadConfig.mockResolvedValue({ devices: [], refreshSeconds: 30 });
		mockReadCache.mockResolvedValue(null);

		const { copilotStatus } = await import("../src/commands/copilot.js");
		await copilotStatus();

		expect(logSpy).not.toHaveBeenCalled();
		expect(mockGetDevices).not.toHaveBeenCalled();
	});
});

// =============================================================================
// commands/copilot.ts - Channel mapping (bug fix validation)
// =============================================================================

describe("copilotSetup channel mapping", () => {
	it("stores correct channel index from allChannels (not filtered array)", async () => {
		// This validates the HIGH-severity bug fix where channel indices were
		// being taken from the filtered tempChannels array position rather than
		// the original allChannels position.
		//
		// Scenario: allChannels = [Humidity(H), Temp1(F), Temp2(F)]
		// After filtering, tempChannels = [Temp1(F), Temp2(F)]
		// Bug: would store channel numbers [1, 2] (filtered indices)
		// Fix: should store channel numbers [2, 3] (original allChannels indices)

		const { promptCheckbox } = await import("../src/prompt.js");
		const { saveConfig } = await import("../src/config.js");
		const mockPromptCheckbox = vi.mocked(promptCheckbox);
		const mockSaveConfig = vi.mocked(saveConfig);
		const { prompt: mockPrompt } = await import("../src/prompt.js");
		vi.mocked(mockPrompt).mockResolvedValue("n"); // skip statusline config

		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "SMOKE1", label: "Smoker" })]);

		// Channel layout: index 0 = Humidity, index 1 = Pit Temp, index 2 = Meat Temp
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 55, units: "H", label: "Humidity" }),
			makeChannel({ value: 225, units: "F", label: "Pit" }),
			makeChannel({ value: 165, units: "F", label: "Meat" }),
		]);

		// User selects first device
		mockPromptCheckbox
			.mockResolvedValueOnce([0]) // select device 0
			.mockResolvedValueOnce([2]); // select "Meat" (index 2 in channelChoices = channel index 1 in tempChannels, but should map to allChannels index 3)

		mockSaveConfig.mockResolvedValue(undefined);

		// Suppress stdout.write used in copilotSetup
		const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

		const { copilotSetup } = await import("../src/commands/copilot.js");
		await copilotSetup(false);

		stdoutSpy.mockRestore();

		// Verify saveConfig was called with the correct channel numbers
		expect(mockSaveConfig).toHaveBeenCalled();
		const savedConfig = mockSaveConfig.mock.calls[0]?.[0];
		expect(savedConfig).toBeDefined();

		const device = savedConfig?.devices[0];
		expect(device).toBeDefined();
		expect(device?.serial).toBe("SMOKE1");

		// CRITICAL: The channels should use allChannels indices, not filtered indices
		// tempChannels after filtering "H": [Pit (allChannels[1]), Meat (allChannels[2])]
		// channelChoices: ["Average (...)", "Pit - 225°F", "Meat - 165°F"]
		// User selected index 2 ("Meat") -> info.channels[2 - 1] = info.channels[1]
		// info.channels[1].number should be the ORIGINAL index in allChannels + 1 = 3
		// (because tempChannels.map uses allChannels.indexOf(ch) + 1)
		expect(device?.channels).toEqual([3]);
	});

	it("stores 'avg' when user selects Average option (index 0)", async () => {
		const { promptCheckbox } = await import("../src/prompt.js");
		const { saveConfig } = await import("../src/config.js");
		const mockPromptCheckbox = vi.mocked(promptCheckbox);
		const mockSaveConfig = vi.mocked(saveConfig);
		const { prompt: mockPrompt } = await import("../src/prompt.js");
		vi.mocked(mockPrompt).mockResolvedValue("n");

		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "S1", label: "Grill" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 300, units: "F", label: "Probe 1" }),
			makeChannel({ value: 350, units: "F", label: "Probe 2" }),
		]);

		mockPromptCheckbox
			.mockResolvedValueOnce([0]) // select device
			.mockResolvedValueOnce([0]); // select "Average" (index 0 in channelChoices)

		mockSaveConfig.mockResolvedValue(undefined);
		const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

		const { copilotSetup } = await import("../src/commands/copilot.js");
		await copilotSetup(false);

		stdoutSpy.mockRestore();

		const savedConfig = mockSaveConfig.mock.calls[0]?.[0];
		expect(savedConfig?.devices[0]?.channels).toBe("avg");
	});

	it("defaults to 'avg' for single-channel devices (no channel prompt)", async () => {
		const { promptCheckbox } = await import("../src/prompt.js");
		const { saveConfig } = await import("../src/config.js");
		const mockPromptCheckbox = vi.mocked(promptCheckbox);
		const mockSaveConfig = vi.mocked(saveConfig);
		const { prompt: mockPrompt } = await import("../src/prompt.js");
		vi.mocked(mockPrompt).mockResolvedValue("n");

		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "NODE1", label: "Fridge" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 38, units: "F", label: "Temp" }),
		]);

		// Only device selection prompt - no channel prompt for single-channel device
		mockPromptCheckbox.mockResolvedValueOnce([0]);
		mockSaveConfig.mockResolvedValue(undefined);

		const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

		const { copilotSetup } = await import("../src/commands/copilot.js");
		await copilotSetup(false);

		stdoutSpy.mockRestore();

		const savedConfig = mockSaveConfig.mock.calls[0]?.[0];
		expect(savedConfig?.devices[0]?.channels).toBe("avg");
		// Should only be called once (device selection), not twice
		expect(mockPromptCheckbox).toHaveBeenCalledTimes(1);
	});
});
