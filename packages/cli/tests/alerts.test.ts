import type { Alarm, Device, DeviceChannel } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetDevices = vi.fn();
	const mockGetDevice = vi.fn();
	const mockGetAllDeviceChannels = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
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
import { alerts } from "../src/commands/alerts.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetDevices = vi.mocked(mockClient.getDevices);
const mockGetDevice = vi.mocked(mockClient.getDevice);
const mockGetAllDeviceChannels = vi.mocked(mockClient.getAllDeviceChannels);
const mockClose = vi.mocked(mockClient.close);

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
	process.exitCode = 0;
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
	process.exitCode = 0;
});

// =============================================================================
// alerts
// =============================================================================

describe("alerts", () => {
	it("reports an alarming channel and sets a non-zero exit code", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "ABC", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({
				number: "1",
				label: "Brisket",
				value: 205,
				units: "F",
				alarmHigh: makeAlarm({ enabled: true, alarming: true, value: 203 }),
			}),
			makeChannel({ number: "2", label: "Pit", value: 250, units: "F" }),
		]);

		await alerts([], { json: false });

		expect(process.exitCode).toBe(1);
		const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(output).toContain("Smoker");
		expect(output).toContain("HIGH");
		expect(output).toContain("Brisket");
		expect(mockClose).toHaveBeenCalled();
	});

	it("reports no alarms and leaves the exit code at zero", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "ABC", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ number: "1", label: "Brisket", value: 180, units: "F" }),
		]);

		await alerts([], { json: false });

		expect(process.exitCode).toBe(0);
		const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(output).toContain("No active alarms on any device.");
	});

	it("detects a low alarm state", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "ABC", label: null })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({
				number: "1",
				label: "Fridge",
				value: 30,
				units: "F",
				alarmLow: makeAlarm({ enabled: true, alarming: true, value: 34 }),
			}),
		]);

		await alerts([], { json: false });

		expect(process.exitCode).toBe(1);
		const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(output).toContain("LOW");
		expect(output).toContain("Fridge");
	});

	it("scopes the scan to a single device when given a serial", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevice.mockResolvedValue(makeDevice({ serial: "XYZ", label: "Signals" }));
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ number: "1", label: "Probe", value: 150, units: "F" }),
		]);

		await alerts(["XYZ"], { json: false });

		expect(mockGetDevice).toHaveBeenCalledWith("XYZ");
		expect(mockGetDevices).not.toHaveBeenCalled();
		expect(mockGetAllDeviceChannels).toHaveBeenCalledWith("XYZ");
		expect(process.exitCode).toBe(0);
		const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(output).toContain("No active alarms on XYZ.");
	});

	it("emits JSON entries with --json and still sets the exit code", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "ABC", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({
				number: "1",
				label: "Brisket",
				value: 205,
				units: "F",
				alarmHigh: makeAlarm({ enabled: true, alarming: true, value: 203 }),
			}),
		]);

		await alerts([], { json: true });

		expect(process.exitCode).toBe(1);
		const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
		const parsed = JSON.parse(output);
		expect(parsed).toEqual([
			{
				serial: "ABC",
				deviceLabel: "Smoker",
				channel: 1,
				channelLabel: "Brisket",
				state: "high",
				value: 205,
				units: "F",
			},
		]);
	});

	it("emits an empty JSON array when nothing is alarming", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "ABC", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ number: "1", label: "Brisket", value: 180, units: "F" }),
		]);

		await alerts([], { json: true });

		expect(process.exitCode).toBe(0);
		const output = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
		expect(JSON.parse(output)).toEqual([]);
	});

	it("exits with an error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);

		await expect(alerts([], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith("Not logged in. Run: thermoworks auth login");
	});
});
