import { describe, expect, it } from "vitest";
import { assessDeviceHealth, isChannelStale } from "../src/device-health.js";
import type { Device, DeviceChannel } from "../src/types.js";

function makeDevice(overrides?: Partial<Device>): Device {
	return {
		serial: "TW-001",
		deviceId: "dev-1",
		label: "Test Device",
		type: "node",
		device: null,
		status: "online",
		battery: 80,
		batteryState: null,
		wifiStrength: null,
		firmware: "2.0.0",
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
		lastSeen: new Date(),
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
		...overrides,
	};
}

function makeChannel(overrides?: Partial<DeviceChannel>): DeviceChannel {
	return {
		value: 72.5,
		units: "F",
		label: "Probe 1",
		status: "ok",
		type: "temperature",
		number: "1",
		enabled: true,
		color: null,
		lastSeen: new Date(),
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
		...overrides,
	};
}

describe("assessDeviceHealth", () => {
	it("returns good when device is healthy", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({
			lastSeen: new Date("2026-01-01T11:58:00Z"),
			status: "online",
			battery: 80,
		});
		const channels = [makeChannel({ lastSeen: new Date("2026-01-01T11:59:00Z") })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.overall).toBe("good");
		expect(result.issues).toHaveLength(0);
	});

	it("returns warning for stale reading (5-30 minutes)", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({ lastSeen: new Date("2026-01-01T11:50:00Z"), status: "online" });
		const channels = [makeChannel({ lastSeen: new Date("2026-01-01T11:50:00Z") })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.overall).toBe("warning");
		expect(result.issues).toContainEqual(
			expect.objectContaining({ code: "stale_reading", severity: "warning" }),
		);
	});

	it("returns critical for very stale reading (>30 minutes)", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({ lastSeen: new Date("2026-01-01T11:00:00Z"), status: "online" });
		const channels = [makeChannel({ lastSeen: new Date("2026-01-01T11:00:00Z") })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.overall).toBe("critical");
		expect(result.issues).toContainEqual(
			expect.objectContaining({ code: "stale_reading", severity: "critical" }),
		);
	});

	it("uses the most recent timestamp from channels or device", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		// Device lastSeen is old but channel lastSeen is recent
		const device = makeDevice({ lastSeen: new Date("2026-01-01T11:00:00Z"), status: "online" });
		const channels = [makeChannel({ lastSeen: new Date("2026-01-01T11:58:00Z") })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.overall).toBe("good");
		expect(result.issues.find((i) => i.code === "stale_reading")).toBeUndefined();
	});

	it("returns warning for low battery (5-20%)", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({ lastSeen: now, status: "online", battery: 15 });
		const channels = [makeChannel({ lastSeen: now })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.overall).toBe("warning");
		expect(result.issues).toContainEqual(
			expect.objectContaining({ code: "low_battery", severity: "warning" }),
		);
	});

	it("returns critical for very low battery (<5%)", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({ lastSeen: now, status: "online", battery: 3 });
		const channels = [makeChannel({ lastSeen: now })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.overall).toBe("critical");
		expect(result.issues).toContainEqual(
			expect.objectContaining({ code: "low_battery", severity: "critical" }),
		);
	});

	it("returns warning when device is offline", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({ lastSeen: now, status: "offline", battery: 80 });
		const channels = [makeChannel({ lastSeen: now })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.overall).toBe("warning");
		expect(result.issues).toContainEqual(
			expect.objectContaining({ code: "offline", severity: "warning" }),
		);
	});

	it("returns warning for weak RSSI", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({ lastSeen: now, status: "online", wifiStrength: -78 });
		const channels = [makeChannel({ lastSeen: now })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.overall).toBe("warning");
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "weak_wifi_signal",
				severity: "warning",
				detail: "RSSI -78 dBm",
			}),
		);
	});

	it("returns critical for very weak RSSI", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({ lastSeen: now, status: "online", wifiStrength: -88 });
		const channels = [makeChannel({ lastSeen: now })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.overall).toBe("critical");
		expect(result.issues).toContainEqual(
			expect.objectContaining({ code: "weak_wifi_signal", severity: "critical" }),
		);
	});

	it("returns warning for low percentage Wi-Fi signal", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({ lastSeen: now, status: "online", wifiStrength: 25 });
		const channels = [makeChannel({ lastSeen: now })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.overall).toBe("warning");
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				code: "weak_wifi_signal",
				severity: "warning",
				detail: "Signal 25%",
			}),
		);
	});

	it("derives overall from worst severity", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		// Offline (warning) + critical battery
		const device = makeDevice({ lastSeen: now, status: "offline", battery: 2 });
		const channels = [makeChannel({ lastSeen: now })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.overall).toBe("critical");
		expect(result.issues.length).toBeGreaterThanOrEqual(2);
	});

	it("handles device with null lastSeen and no channel timestamps", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({ lastSeen: null, status: "online", battery: 80 });
		const channels = [makeChannel({ lastSeen: null })];

		const result = assessDeviceHealth(device, channels, now);

		// No stale issue when there are no timestamps to compare
		expect(result.issues.find((i) => i.code === "stale_reading")).toBeUndefined();
	});

	it("handles empty channels array", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({ lastSeen: now, status: "online", battery: 80 });

		const result = assessDeviceHealth(device, [], now);

		expect(result.overall).toBe("good");
	});

	it("does not flag battery at exactly 20%", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({ lastSeen: now, status: "online", battery: 20 });
		const channels = [makeChannel({ lastSeen: now })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.issues.find((i) => i.code === "low_battery")).toBeUndefined();
	});

	it("flags battery at exactly 19%", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({ lastSeen: now, status: "online", battery: 19 });
		const channels = [makeChannel({ lastSeen: now })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.issues).toContainEqual(
			expect.objectContaining({ code: "low_battery", severity: "warning" }),
		);
	});

	it("does not flag battery when null", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const device = makeDevice({ lastSeen: now, status: "online", battery: null });
		const channels = [makeChannel({ lastSeen: now })];

		const result = assessDeviceHealth(device, channels, now);

		expect(result.issues.find((i) => i.code === "low_battery")).toBeUndefined();
	});
});

describe("isChannelStale", () => {
	it("returns false when lastSeen is recent", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const channel = makeChannel({ lastSeen: new Date("2026-01-01T11:58:00Z") });

		expect(isChannelStale(channel, now)).toBe(false);
	});

	it("returns true when lastSeen is older than 5 minutes", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const channel = makeChannel({ lastSeen: new Date("2026-01-01T11:54:00Z") });

		expect(isChannelStale(channel, now)).toBe(true);
	});

	it("returns false when lastSeen is null", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const channel = makeChannel({ lastSeen: null });

		expect(isChannelStale(channel, now)).toBe(false);
	});

	it("returns true at exactly 5 minutes", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const channel = makeChannel({ lastSeen: new Date("2026-01-01T11:55:00Z") });

		expect(isChannelStale(channel, now)).toBe(true);
	});

	it("returns false at 4 minutes 59 seconds", () => {
		const now = new Date("2026-01-01T12:00:00Z");
		const channel = makeChannel({ lastSeen: new Date("2026-01-01T11:55:01Z") });

		expect(isChannelStale(channel, now)).toBe(false);
	});
});
