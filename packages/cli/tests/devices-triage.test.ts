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

/** Create an alarming channel (high alarm active). */
function makeAlarmingChannel(overrides: Partial<DeviceChannel> = {}): DeviceChannel {
	return makeChannel({
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
		...overrides,
	});
}

// --- Test lifecycle ---

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(process, "exit").mockImplementation(() => {
		throw new Error("process.exit");
	});
	mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

// =============================================================================
// parseDevicesArgs: --sort health and --critical
// =============================================================================

describe("parseDevicesArgs triage flags", () => {
	it("parses --sort health into sortByHealth", async () => {
		const { parseDevicesArgs } = await import("../src/commands/devices.js");
		const opts = parseDevicesArgs(["--sort", "health"], { json: false });
		expect(opts.sortByHealth).toBe(true);
		expect(opts.criticalOnly).toBeUndefined();
	});

	it("parses --critical into criticalOnly", async () => {
		const { parseDevicesArgs } = await import("../src/commands/devices.js");
		const opts = parseDevicesArgs(["--critical"], { json: false });
		expect(opts.criticalOnly).toBe(true);
		expect(opts.sortByHealth).toBeUndefined();
	});

	it("parses both --sort health and --critical together", async () => {
		const { parseDevicesArgs } = await import("../src/commands/devices.js");
		const opts = parseDevicesArgs(["--sort", "health", "--critical"], { json: false });
		expect(opts.sortByHealth).toBe(true);
		expect(opts.criticalOnly).toBe(true);
	});

	it("exits when --sort has an invalid value", async () => {
		const { parseDevicesArgs } = await import("../src/commands/devices.js");
		expect(() => parseDevicesArgs(["--sort", "name"], { json: false })).toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid --sort value: name"));
	});

	it("preserves existing filter flags alongside triage flags", async () => {
		const { parseDevicesArgs } = await import("../src/commands/devices.js");
		const opts = parseDevicesArgs(["--type", "signals", "--sort", "health", "--critical"], {
			json: false,
		});
		expect(opts.filter).toEqual({ type: "signals" });
		expect(opts.sortByHealth).toBe(true);
		expect(opts.criticalOnly).toBe(true);
	});

	it("leaves sortByHealth and criticalOnly undefined when neither flag is present", async () => {
		const { parseDevicesArgs } = await import("../src/commands/devices.js");
		const opts = parseDevicesArgs([], { json: false });
		expect(opts.sortByHealth).toBeUndefined();
		expect(opts.criticalOnly).toBeUndefined();
	});
});

// =============================================================================
// computeHealthPriority
// =============================================================================

describe("computeHealthPriority", () => {
	it("returns 0 for devices with an alarming channel", async () => {
		const { computeHealthPriority } = await import("../src/commands/devices.js");
		const health = { overall: "good" as const, issues: [] };
		const channels = [makeAlarmingChannel()];
		expect(computeHealthPriority(health, channels)).toBe(0);
	});

	it("returns 1 for critical health without alarms", async () => {
		const { computeHealthPriority } = await import("../src/commands/devices.js");
		const health = {
			overall: "critical" as const,
			issues: [{ code: "stale_reading" as const, severity: "critical" as const, message: "Stale" }],
		};
		const channels = [makeChannel({ value: 200, units: "F" })];
		expect(computeHealthPriority(health, channels)).toBe(1);
	});

	it("returns 2 for warning health without alarms", async () => {
		const { computeHealthPriority } = await import("../src/commands/devices.js");
		const health = {
			overall: "warning" as const,
			issues: [{ code: "low_battery" as const, severity: "warning" as const, message: "Low" }],
		};
		const channels = [makeChannel({ value: 200, units: "F" })];
		expect(computeHealthPriority(health, channels)).toBe(2);
	});

	it("returns 3 for healthy devices with no alarms", async () => {
		const { computeHealthPriority } = await import("../src/commands/devices.js");
		const health = { overall: "good" as const, issues: [] };
		const channels = [makeChannel({ value: 200, units: "F" })];
		expect(computeHealthPriority(health, channels)).toBe(3);
	});

	it("prioritizes alarm (0) over critical health (1)", async () => {
		const { computeHealthPriority } = await import("../src/commands/devices.js");
		const health = {
			overall: "critical" as const,
			issues: [{ code: "stale_reading" as const, severity: "critical" as const, message: "Stale" }],
		};
		// Channel with both a critical health issue AND an active alarm
		const channels = [makeAlarmingChannel()];
		expect(computeHealthPriority(health, channels)).toBe(0);
	});
});

// =============================================================================
// devices --sort health
// =============================================================================

describe("devices --sort health", () => {
	it("sorts devices by health priority (alarms first, then critical, warning, good)", async () => {
		const goodDevice = makeDevice({ serial: "GOOD", label: "Healthy", status: "online" });
		const warningDevice = makeDevice({ serial: "WARN", label: "LowBat", battery: 15 });
		const alarmDevice = makeDevice({ serial: "ALARM", label: "OnFire", status: "online" });

		mockGetDevices.mockResolvedValue([goodDevice, warningDevice, alarmDevice]);
		mockGetAllDeviceChannels.mockImplementation(async (serial: string) => {
			if (serial === "ALARM") return [makeAlarmingChannel()];
			return [makeChannel({ value: 200, units: "F", number: "1" })];
		});

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: false, channels: false, sortByHealth: true });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const alarmPos = output.indexOf("OnFire");
		const warnPos = output.indexOf("LowBat");
		const goodPos = output.indexOf("Healthy");

		expect(alarmPos).toBeGreaterThan(-1);
		expect(warnPos).toBeGreaterThan(-1);
		expect(goodPos).toBeGreaterThan(-1);
		// Alarm should appear before warning, warning before good
		expect(alarmPos).toBeLessThan(warnPos);
		expect(warnPos).toBeLessThan(goodPos);
	});

	it("shows health tags in terminal output", async () => {
		const device = makeDevice({ serial: "DEV1", label: "Smoker", status: "online" });
		mockGetDevices.mockResolvedValue([device]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", number: "1" }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: false, channels: false, sortByHealth: true });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		// Healthy device should get green [OK] tag
		expect(output).toContain("[OK]");
	});

	it("includes health summary in JSON output", async () => {
		const device = makeDevice({ serial: "DEV1", label: "Smoker", status: "online" });
		mockGetDevices.mockResolvedValue([device]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", number: "1" }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: true, sortByHealth: true });

		const raw = logSpy.mock.calls[0][0] as string;
		const parsed = JSON.parse(raw);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].health).toBeDefined();
		expect(parsed[0].health.overall).toBe("good");
		expect(parsed[0].health.priority).toBe(3);
		expect(parsed[0].health.issues).toEqual([]);
	});
});

// =============================================================================
// devices --critical
// =============================================================================

describe("devices --critical", () => {
	it("hides healthy devices", async () => {
		const goodDevice = makeDevice({ serial: "GOOD", label: "Healthy", status: "online" });
		const warningDevice = makeDevice({ serial: "WARN", label: "LowBat", battery: 15 });

		mockGetDevices.mockResolvedValue([goodDevice, warningDevice]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 200, units: "F", number: "1" }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: false, channels: false, criticalOnly: true });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).not.toContain("Healthy");
		expect(output).toContain("LowBat");
	});

	it("prints 'No devices need attention' when all devices are healthy", async () => {
		const device = makeDevice({ serial: "GOOD", label: "Healthy", status: "online" });
		mockGetDevices.mockResolvedValue([device]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 200, units: "F", number: "1" }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: false, channels: false, criticalOnly: true });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("No devices need attention.");
	});

	it("keeps devices with active alarms", async () => {
		const device = makeDevice({ serial: "ALARM", label: "OnFire", status: "online" });
		mockGetDevices.mockResolvedValue([device]);
		mockGetAllDeviceChannels.mockResolvedValue([makeAlarmingChannel()]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: false, channels: false, criticalOnly: true });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("OnFire");
	});

	it("filters correctly in JSON mode", async () => {
		const goodDevice = makeDevice({ serial: "GOOD", label: "Healthy", status: "online" });
		const warningDevice = makeDevice({ serial: "WARN", label: "LowBat", battery: 15 });

		mockGetDevices.mockResolvedValue([goodDevice, warningDevice]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 200, units: "F", number: "1" }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: true, criticalOnly: true });

		const raw = logSpy.mock.calls[0][0] as string;
		const parsed = JSON.parse(raw);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].serial).toBe("WARN");
		expect(parsed[0].health).toBeDefined();
		expect(parsed[0].health.overall).toBe("warning");
	});
});

// =============================================================================
// --sort health + --critical combined
// =============================================================================

describe("devices --sort health --critical combined", () => {
	it("filters out healthy devices and sorts the remainder by priority", async () => {
		const goodDevice = makeDevice({ serial: "GOOD", label: "Healthy", status: "online" });
		const warningDevice = makeDevice({ serial: "WARN", label: "LowBat", battery: 15 });
		const alarmDevice = makeDevice({ serial: "ALARM", label: "OnFire", status: "online" });

		mockGetDevices.mockResolvedValue([goodDevice, warningDevice, alarmDevice]);
		mockGetAllDeviceChannels.mockImplementation(async (serial: string) => {
			if (serial === "ALARM") return [makeAlarmingChannel()];
			return [makeChannel({ value: 200, units: "F", number: "1" })];
		});

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: false, channels: false, sortByHealth: true, criticalOnly: true });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).not.toContain("Healthy");

		const alarmPos = output.indexOf("OnFire");
		const warnPos = output.indexOf("LowBat");
		expect(alarmPos).toBeGreaterThan(-1);
		expect(warnPos).toBeGreaterThan(-1);
		expect(alarmPos).toBeLessThan(warnPos);
	});
});

// =============================================================================
// Triage flags combined with existing filters
// =============================================================================

describe("devices triage with existing filters", () => {
	it("applies --type filter before health sorting", async () => {
		const signalsDevice = makeDevice({
			serial: "SIG1",
			label: "Signals",
			type: "signals",
			battery: 15,
		});

		// Only the signals device should come through the --type filter.
		// The SDK filter is applied server-side; we simulate it returning only matching devices.
		mockGetDevices.mockResolvedValue([signalsDevice]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 200, units: "F", number: "1" }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({
			json: false,
			channels: false,
			filter: { type: "signals" },
			sortByHealth: true,
		});

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Signals");
		expect(output).not.toContain("Node");
	});
});

// =============================================================================
// Channel fetching for health assessment
// =============================================================================

describe("devices triage channel fetching", () => {
	it("fetches channels even when channels display is off if health flags are active", async () => {
		const device = makeDevice({ serial: "DEV1", label: "Smoker" });
		mockGetDevices.mockResolvedValue([device]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 200, units: "F", number: "1" }),
		]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: false, channels: false, sortByHealth: true });

		// Channels must be fetched for health assessment even though display is disabled.
		expect(mockGetAllDeviceChannels).toHaveBeenCalledWith("DEV1");
	});
});
