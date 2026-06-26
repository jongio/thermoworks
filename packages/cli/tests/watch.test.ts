import type { Device, DeviceChannel } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	type DeviceWithChannels,
	formatTimestamp,
	formatWatchFrame,
	parseWatchArgs,
} from "../src/commands/watch.js";

// --- Helpers (same factories as devices-channels.test.ts) ---

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

// =============================================================================
// parseWatchArgs
// =============================================================================

describe("parseWatchArgs", () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns defaults when no args provided", () => {
		const result = parseWatchArgs([]);
		expect(result).toEqual({ device: undefined, interval: 10 });
	});

	it("parses --device flag", () => {
		const result = parseWatchArgs(["--device", "SMOKE1"]);
		expect(result.device).toBe("SMOKE1");
	});

	it("parses --interval flag", () => {
		const result = parseWatchArgs(["--interval", "5"]);
		expect(result.interval).toBe(5);
	});

	it("parses both flags together", () => {
		const result = parseWatchArgs(["--device", "ABC123", "--interval", "30"]);
		expect(result.device).toBe("ABC123");
		expect(result.interval).toBe(30);
	});

	it("accepts fractional interval", () => {
		const result = parseWatchArgs(["--interval", "2.5"]);
		expect(result.interval).toBe(2.5);
	});

	it("exits with error for non-numeric interval", () => {
		parseWatchArgs(["--interval", "abc"]);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalledWith("Error: --interval must be a positive number (>= 1)");
	});

	it("exits with error for interval less than 1", () => {
		parseWatchArgs(["--interval", "0"]);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("exits with error for negative interval", () => {
		parseWatchArgs(["--interval", "-5"]);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("ignores unknown flags", () => {
		const result = parseWatchArgs(["--unknown", "value", "--device", "X"]);
		expect(result.device).toBe("X");
		expect(result.interval).toBe(10);
	});
});

// =============================================================================
// formatTimestamp
// =============================================================================

describe("formatTimestamp", () => {
	it("returns a time string from a Date", () => {
		const date = new Date("2025-06-07T15:30:00Z");
		const result = formatTimestamp(date);
		// toLocaleTimeString format depends on locale, just verify it's non-empty
		expect(result.length).toBeGreaterThan(0);
		expect(typeof result).toBe("string");
	});
});

// =============================================================================
// formatWatchFrame
// =============================================================================

describe("formatWatchFrame", () => {
	const fixedDate = new Date("2025-06-07T12:00:00Z");

	it("shows header with timestamp and interval", () => {
		const frame = formatWatchFrame([], fixedDate, 10);
		expect(frame).toContain("ThermoWorks Watch");
		expect(frame).toContain(formatTimestamp(fixedDate));
		expect(frame).toContain("Refreshing every 10s");
		expect(frame).toContain("Ctrl+C to exit");
	});

	it("shows 'No devices found.' when empty", () => {
		const frame = formatWatchFrame([], fixedDate, 10);
		expect(frame).toContain("No devices found.");
	});

	it("displays device name and type", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker", type: "signals" }),
				channels: [],
			},
		];
		const frame = formatWatchFrame(devices, fixedDate, 5);
		expect(frame).toContain("Smoker");
		expect(frame).toContain("(signals)");
	});

	it("falls back to serial when label is null", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "ABC123", label: null }),
				channels: [],
			},
		];
		const frame = formatWatchFrame(devices, fixedDate, 10);
		expect(frame).toContain("ABC123");
	});

	it("shows device status", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Grill", status: "NORMAL" }),
				channels: [],
			},
		];
		const frame = formatWatchFrame(devices, fixedDate, 10);
		expect(frame).toContain("[NORMAL]");
	});

	it("shows channel readings under device", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker" }),
				channels: [
					makeChannel({ value: 225, units: "F", label: "Ambient", number: "1" }),
					makeChannel({ value: 165, units: "F", label: "Meat", number: "2" }),
				],
			},
		];
		const frame = formatWatchFrame(devices, fixedDate, 10);
		expect(frame).toContain("Ch1 Ambient: 225°F");
		expect(frame).toContain("Ch2 Meat: 165°F");
	});

	it("skips disabled channels", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker" }),
				channels: [
					makeChannel({ value: 225, units: "F", label: "Active", number: "1", enabled: true }),
					makeChannel({ value: 0, units: "F", label: "Off", number: "2", enabled: false }),
				],
			},
		];
		const frame = formatWatchFrame(devices, fixedDate, 10);
		expect(frame).toContain("Active");
		expect(frame).not.toContain("Off");
	});

	it("skips channels with null value", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker" }),
				channels: [
					makeChannel({ value: 225, units: "F", label: "Good", number: "1" }),
					makeChannel({ value: null, units: "F", label: "Empty", number: "2" }),
				],
			},
		];
		const frame = formatWatchFrame(devices, fixedDate, 10);
		expect(frame).toContain("Good");
		expect(frame).not.toContain("Empty");
	});

	it("renders multiple devices", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "D1", label: "Grill" }),
				channels: [makeChannel({ value: 400, units: "F", label: "Pit", number: "1" })],
			},
			{
				device: makeDevice({ serial: "D2", label: "Fridge" }),
				channels: [makeChannel({ value: 38, units: "F", label: "Internal", number: "1" })],
			},
		];
		const frame = formatWatchFrame(devices, fixedDate, 15);
		expect(frame).toContain("Grill");
		expect(frame).toContain("400°F");
		expect(frame).toContain("Fridge");
		expect(frame).toContain("38°F");
		expect(frame).toContain("Refreshing every 15s");
	});

	it("shows alarm states from channel data", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker" }),
				channels: [
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
				],
			},
		];
		const frame = formatWatchFrame(devices, fixedDate, 10);
		// Should contain the ANSI-colored [HIGH] from formatChannelLine
		expect(frame).toContain("[HIGH]");
	});

	it("shows channel trends when recent readings are available", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker" }),
				channels: [
					{
						...makeChannel({ value: 170, units: "F", label: "Meat", number: "1" }),
						recentReadings: [
							{ value: 150, timestamp: new Date("2026-01-15T12:00:00Z"), units: "F" },
							{ value: 160, timestamp: new Date("2026-01-15T12:01:00Z"), units: "F" },
							{ value: 170, timestamp: new Date("2026-01-15T12:02:00Z"), units: "F" },
						],
					} as DeviceChannel,
				],
			},
		];
		const frame = formatWatchFrame(devices, fixedDate, 10);
		expect(frame).toContain("Ch1 Meat: 170°F");
		expect(frame).toContain("trend");
		expect(frame).toContain("█");
	});
});
