import type { Device, DeviceChannel, TemperatureReading } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	buildRecordChunk,
	buildRecordCsvRows,
	buildWatchJsonFrame,
	type ChannelHistory,
	channelHistoryKey,
	colorStallAlert,
	type DeviceWithChannels,
	formatRapidChangeIndicator,
	formatStallIndicator,
	formatTimestamp,
	formatWatchFrame,
	parseWatchArgs,
	RECORD_CSV_HEADER,
	recordChannelReadings,
	type WatchJsonFrame,
	watchFrameHasAlarm,
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
		expect(result).toEqual({
			device: undefined,
			interval: 10,
			record: undefined,
			recordFormat: "csv",
			bell: false,
			stallAlert: false,
		});
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

	it("uses default device and interval when flags are omitted", () => {
		const result = parseWatchArgs([], { device: "PREF1", interval: 25 });
		expect(result.device).toBe("PREF1");
		expect(result.interval).toBe(25);
	});

	it("lets flags override defaults", () => {
		const result = parseWatchArgs(["--device", "FLAG1", "--interval", "5"], {
			device: "PREF1",
			interval: 25,
		});
		expect(result.device).toBe("FLAG1");
		expect(result.interval).toBe(5);
	});

	it("defaults bell to off", () => {
		const result = parseWatchArgs([]);
		expect(result.bell).toBe(false);
	});

	it("parses --bell flag", () => {
		const result = parseWatchArgs(["--bell"]);
		expect(result.bell).toBe(true);
	});

	it("parses --bell alongside other flags", () => {
		const result = parseWatchArgs(["--device", "S1", "--bell", "--interval", "5"]);
		expect(result.device).toBe("S1");
		expect(result.interval).toBe(5);
		expect(result.bell).toBe(true);
	});
});

// =============================================================================
// watchFrameHasAlarm
// =============================================================================

describe("watchFrameHasAlarm", () => {
	const alarmingChannel = () =>
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
		});

	it("returns false when there are no devices", () => {
		expect(watchFrameHasAlarm([])).toBe(false);
	});

	it("returns false when no channel is alarming", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker" }),
				channels: [makeChannel({ value: 200, units: "F", label: "Pit", number: "1" })],
			},
		];
		expect(watchFrameHasAlarm(devices)).toBe(false);
	});

	it("returns true when a channel is alarming", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker" }),
				channels: [alarmingChannel()],
			},
		];
		expect(watchFrameHasAlarm(devices)).toBe(true);
	});

	it("ignores a disabled channel that would otherwise alarm", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker" }),
				channels: [{ ...alarmingChannel(), enabled: false }],
			},
		];
		expect(watchFrameHasAlarm(devices)).toBe(false);
	});

	it("detects an alarm on any device in the frame", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "D1", label: "Grill" }),
				channels: [makeChannel({ value: 200, units: "F", label: "Pit", number: "1" })],
			},
			{
				device: makeDevice({ serial: "D2", label: "Smoker" }),
				channels: [alarmingChannel()],
			},
		];
		expect(watchFrameHasAlarm(devices)).toBe(true);
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

// =============================================================================
// buildWatchJsonFrame
// =============================================================================

describe("buildWatchJsonFrame", () => {
	const fixedDate = new Date("2025-06-07T12:00:00Z");

	it("includes an ISO timestamp", () => {
		const frame = buildWatchJsonFrame([], fixedDate);
		expect(frame.timestamp).toBe("2025-06-07T12:00:00.000Z");
		expect(frame.devices).toEqual([]);
	});

	it("serializes device identity and channels", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({
					serial: "S1",
					label: "Smoker",
					type: "signals",
					status: "online",
					battery: 87,
				}),
				channels: [makeChannel({ value: 225, units: "F", label: "Pit", number: "1" })],
			},
		];
		const frame = buildWatchJsonFrame(devices, fixedDate);
		expect(frame.devices[0]).toMatchObject({
			serial: "S1",
			label: "Smoker",
			type: "signals",
			status: "online",
			battery: 87,
		});
		expect(frame.devices[0]?.channels[0]).toEqual({
			number: "1",
			label: "Pit",
			value: 225,
			units: "F",
			alarm: "none",
		});
	});

	it("reports alarm state per channel", () => {
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
		const frame = buildWatchJsonFrame(devices, fixedDate);
		expect(frame.devices[0]?.channels[0]?.alarm).toBe("high");
	});

	it("omits disabled channels", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker" }),
				channels: [
					makeChannel({ value: 225, units: "F", label: "On", number: "1", enabled: true }),
					makeChannel({ value: 0, units: "F", label: "Off", number: "2", enabled: false }),
				],
			},
		];
		const frame = buildWatchJsonFrame(devices, fixedDate);
		expect(frame.devices[0]?.channels).toHaveLength(1);
		expect(frame.devices[0]?.channels[0]?.label).toBe("On");
	});

	it("produces a single-line JSON string when stringified", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker" }),
				channels: [makeChannel({ value: 225, units: "F", label: "Pit", number: "1" })],
			},
		];
		const line = JSON.stringify(buildWatchJsonFrame(devices, fixedDate));
		expect(line).not.toContain("\n");
		expect(JSON.parse(line).devices[0].serial).toBe("S1");
	});
});

// =============================================================================
// parseWatchArgs recording flags
// =============================================================================

describe("parseWatchArgs recording", () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("defaults record to undefined and format to csv", () => {
		const result = parseWatchArgs([]);
		expect(result.record).toBeUndefined();
		expect(result.recordFormat).toBe("csv");
	});

	it("parses --record path", () => {
		const result = parseWatchArgs(["--record", "cook.csv"]);
		expect(result.record).toBe("cook.csv");
		expect(result.recordFormat).toBe("csv");
	});

	it("parses --record-format json", () => {
		const result = parseWatchArgs(["--record", "cook.ndjson", "--record-format", "json"]);
		expect(result.record).toBe("cook.ndjson");
		expect(result.recordFormat).toBe("json");
	});

	it("exits on an invalid record format", () => {
		parseWatchArgs(["--record", "x", "--record-format", "xml"]);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalledWith("Error: --record-format must be 'csv' or 'json'");
	});
});

// =============================================================================
// recording chunk builders
// =============================================================================

describe("watch recording chunk", () => {
	function makeFrame(): WatchJsonFrame {
		return {
			timestamp: "2026-01-15T18:30:00.000Z",
			devices: [
				{
					serial: "SMOKE1",
					label: "My Smoke",
					type: "smoke",
					status: "online",
					battery: 80,
					channels: [
						{ number: "1", label: "Brisket", value: 165, units: "F", alarm: "normal" },
						{ number: "2", label: "Pit", value: 250, units: "F", alarm: "high" },
					],
				},
			],
		};
	}

	it("builds one CSV row per channel", () => {
		const rows = buildRecordCsvRows(makeFrame());
		expect(rows).toHaveLength(2);
		expect(rows[0]).toBe("2026-01-15T18:30:00.000Z,SMOKE1,Brisket,165,F,normal");
		expect(rows[1]).toBe("2026-01-15T18:30:00.000Z,SMOKE1,Pit,250,F,high");
	});

	it("prepends the header only when requested", () => {
		const withHeader = buildRecordChunk(makeFrame(), "csv", true);
		expect(withHeader.startsWith(`${RECORD_CSV_HEADER}\n`)).toBe(true);
		const withoutHeader = buildRecordChunk(makeFrame(), "csv", false);
		expect(withoutHeader.startsWith(RECORD_CSV_HEADER)).toBe(false);
		expect(withoutHeader.endsWith("\n")).toBe(true);
	});

	it("emits a single NDJSON line for the json format", () => {
		const chunk = buildRecordChunk(makeFrame(), "json", true);
		expect(chunk.endsWith("\n")).toBe(true);
		const parsed = JSON.parse(chunk.trimEnd());
		expect(parsed.devices[0].channels[1].value).toBe(250);
	});

	it("guards against CSV formula injection in labels", () => {
		const frame = makeFrame();
		frame.devices[0]!.channels[0]!.label = "=SUM(A1:A2)";
		const rows = buildRecordCsvRows(frame);
		expect(rows[0]).toContain("'=SUM(A1:A2)");
	});

	it("leaves an empty value field for a null reading", () => {
		const frame = makeFrame();
		frame.devices[0]!.channels[0]!.value = null;
		const rows = buildRecordCsvRows(frame);
		expect(rows[0]).toBe("2026-01-15T18:30:00.000Z,SMOKE1,Brisket,,F,normal");
	});
});

// =============================================================================
// parseWatchArgs --stall-alert
// =============================================================================

describe("parseWatchArgs --stall-alert", () => {
	it("defaults stallAlert to false", () => {
		const result = parseWatchArgs([]);
		expect(result.stallAlert).toBe(false);
	});

	it("parses --stall-alert flag", () => {
		const result = parseWatchArgs(["--stall-alert"]);
		expect(result.stallAlert).toBe(true);
	});

	it("parses --stall-alert alongside other flags", () => {
		const result = parseWatchArgs(["--device", "S1", "--stall-alert", "--interval", "5"]);
		expect(result.device).toBe("S1");
		expect(result.interval).toBe(5);
		expect(result.stallAlert).toBe(true);
	});
});

// =============================================================================
// channelHistoryKey + recordChannelReadings
// =============================================================================

describe("channelHistoryKey", () => {
	it("combines serial and channel number", () => {
		expect(channelHistoryKey("SMOKE1", "2")).toBe("SMOKE1:2");
	});

	it("uses 0 for null channel number", () => {
		expect(channelHistoryKey("SMOKE1", null)).toBe("SMOKE1:0");
	});
});

describe("recordChannelReadings", () => {
	it("records channel readings into history map", () => {
		const history: ChannelHistory = new Map();
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1" }),
				channels: [makeChannel({ value: 155, units: "F", number: "1", enabled: true })],
			},
		];
		const now = new Date("2026-07-01T12:00:00Z");
		recordChannelReadings(history, devices, now);

		const key = channelHistoryKey("S1", "1");
		expect(history.has(key)).toBe(true);
		expect(history.get(key)!.length).toBe(1);
		expect(history.get(key)![0]!.value).toBe(155);
	});

	it("skips disabled channels", () => {
		const history: ChannelHistory = new Map();
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1" }),
				channels: [makeChannel({ value: 100, units: "F", number: "1", enabled: false })],
			},
		];
		recordChannelReadings(history, devices, new Date());
		expect(history.size).toBe(0);
	});

	it("skips channels with null value", () => {
		const history: ChannelHistory = new Map();
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1" }),
				channels: [makeChannel({ value: null, units: "F", number: "1", enabled: true })],
			},
		];
		recordChannelReadings(history, devices, new Date());
		expect(history.size).toBe(0);
	});
});

// =============================================================================
// formatStallIndicator + formatRapidChangeIndicator
// =============================================================================

describe("formatStallIndicator", () => {
	function makeReading(value: number, minuteOffset: number): TemperatureReading {
		const base = new Date("2026-07-01T12:00:00Z");
		return { value, timestamp: new Date(base.getTime() + minuteOffset * 60 * 1000), units: "F" };
	}

	it("returns empty string when not stalling", () => {
		const readings = [makeReading(150, 0), makeReading(160, 35)];
		expect(formatStallIndicator(readings)).toBe("");
	});

	it("returns stall indicator with duration", () => {
		const readings: TemperatureReading[] = [];
		for (let i = 0; i <= 35; i += 5) {
			readings.push(makeReading(155 + (i % 2 === 0 ? 0.5 : 0), i));
		}
		const result = formatStallIndicator(readings);
		expect(result).toContain("\u23F8 STALL");
		expect(result).toContain("min)");
	});
});

describe("formatRapidChangeIndicator", () => {
	function makeReading(value: number, minuteOffset: number): TemperatureReading {
		const base = new Date("2026-07-01T12:00:00Z");
		return { value, timestamp: new Date(base.getTime() + minuteOffset * 60 * 1000), units: "F" };
	}

	it("returns empty string when rate is below threshold", () => {
		const readings = [makeReading(150, 0), makeReading(152, 5)];
		expect(formatRapidChangeIndicator(readings)).toBe("");
	});

	it("returns rising indicator with fire emoji", () => {
		const readings = [makeReading(150, 0), makeReading(160, 5)];
		const result = formatRapidChangeIndicator(readings);
		expect(result).toContain("\uD83D\uDD25");
		expect(result).toContain("+10");
		expect(result).toContain("/5min");
	});

	it("returns falling indicator with snowflake emoji", () => {
		const readings = [makeReading(160, 0), makeReading(150, 5)];
		const result = formatRapidChangeIndicator(readings);
		expect(result).toContain("\u2744");
		expect(result).toContain("-10");
	});
});

// =============================================================================
// colorStallAlert
// =============================================================================

describe("colorStallAlert", () => {
	it("wraps text in ANSI yellow escape codes", () => {
		const result = colorStallAlert("STALL");
		expect(result).toBe("\x1b[33mSTALL\x1b[0m");
	});

	it("returns empty string unchanged", () => {
		expect(colorStallAlert("")).toBe("");
	});
});

// =============================================================================
// formatWatchFrame with stall indicators
// =============================================================================

describe("formatWatchFrame with stall indicators", () => {
	function makeReading(value: number, minuteOffset: number): TemperatureReading {
		const base = new Date("2026-07-01T12:00:00Z");
		return { value, timestamp: new Date(base.getTime() + minuteOffset * 60 * 1000), units: "F" };
	}

	it("includes stall indicator when history shows stalling", () => {
		const device = makeDevice({ serial: "SMOKE1", label: "Smoker" });
		const ch = makeChannel({ value: 155, units: "F", number: "1", label: "Pit", enabled: true });
		const devices: DeviceWithChannels[] = [{ device, channels: [ch] }];

		const history: ChannelHistory = new Map();
		const key = channelHistoryKey("SMOKE1", "1");
		const readings: TemperatureReading[] = [];
		for (let i = 0; i <= 35; i += 5) {
			readings.push(makeReading(155 + (i % 2 === 0 ? 0.3 : 0), i));
		}
		history.set(key, readings);

		const result = formatWatchFrame(devices, new Date(), 10, history, false);
		expect(result).toContain("STALL");
	});

	it("includes rapid change indicator when history shows rapid rise", () => {
		const device = makeDevice({ serial: "SMOKE1", label: "Smoker" });
		const ch = makeChannel({ value: 200, units: "F", number: "1", label: "Pit", enabled: true });
		const devices: DeviceWithChannels[] = [{ device, channels: [ch] }];

		const history: ChannelHistory = new Map();
		const key = channelHistoryKey("SMOKE1", "1");
		history.set(key, [makeReading(150, 0), makeReading(200, 5)]);

		const result = formatWatchFrame(devices, new Date(), 10, history, false);
		expect(result).toContain("\uD83D\uDD25");
	});

	it("applies ANSI color when stallAlert is true", () => {
		const device = makeDevice({ serial: "SMOKE1", label: "Smoker" });
		const ch = makeChannel({ value: 155, units: "F", number: "1", label: "Pit", enabled: true });
		const devices: DeviceWithChannels[] = [{ device, channels: [ch] }];

		const history: ChannelHistory = new Map();
		const key = channelHistoryKey("SMOKE1", "1");
		const readings: TemperatureReading[] = [];
		for (let i = 0; i <= 35; i += 5) {
			readings.push(makeReading(155, i));
		}
		history.set(key, readings);

		const result = formatWatchFrame(devices, new Date(), 10, history, true);
		expect(result).toContain("\x1b[33m");
		expect(result).toContain("\x1b[0m");
	});

	it("shows no indicator when history is absent", () => {
		const device = makeDevice({ serial: "SMOKE1", label: "Smoker" });
		const ch = makeChannel({ value: 155, units: "F", number: "1", label: "Pit", enabled: true });
		const devices: DeviceWithChannels[] = [{ device, channels: [ch] }];

		const result = formatWatchFrame(devices, new Date(), 10);
		expect(result).not.toContain("STALL");
		expect(result).not.toContain("\uD83D\uDD25");
	});
});
