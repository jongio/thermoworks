import type { AddressInfo } from "node:net";

import type { Device, DeviceChannel, MinMaxReading } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	createMetricsServer,
	DEFAULT_METRICS_PORT,
	escapeLabelValue,
	type MetricsSnapshot,
	parseMetricsArgs,
	renderMetrics,
} from "../src/commands/metrics.js";
import type { DeviceWithChannels } from "../src/commands/watch.js";

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
		lastTelemetrySaved: overrides.lastTelemetrySaved ?? null,
		latestReading: overrides.latestReading ?? null,
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
		lastSeen: overrides.lastSeen ?? null,
		lastTelemetrySaved: overrides.lastTelemetrySaved ?? null,
		lastEventId: null,
		showAvgTemp: null,
		estimatedAlarmStatus: null,
		rateOfChange: null,
		rateOfChangeUnit: null,
		alarmHigh: overrides.alarmHigh ?? null,
		alarmLow: overrides.alarmLow ?? null,
		minimum: overrides.minimum ?? null,
		maximum: overrides.maximum ?? null,
	};
}

function minMax(value: number, units = "F"): MinMaxReading {
	return { value, units, date: null };
}

// =============================================================================
// parseMetricsArgs
// =============================================================================

describe("parseMetricsArgs", () => {
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
		expect(parseMetricsArgs([])).toEqual({
			host: "127.0.0.1",
			port: DEFAULT_METRICS_PORT,
			device: undefined,
			interval: 10,
		});
	});

	it("parses host, port, device, and interval", () => {
		const result = parseMetricsArgs([
			"--host",
			"0.0.0.0",
			"--port",
			"9999",
			"--device",
			"SMOKE1",
			"--interval",
			"30",
		]);
		expect(result).toEqual({
			host: "0.0.0.0",
			port: 9999,
			device: "SMOKE1",
			interval: 30,
		});
	});

	it("exits on non-integer port", () => {
		parseMetricsArgs(["--port", "abc"]);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("exits on out-of-range port", () => {
		parseMetricsArgs(["--port", "70000"]);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("exits on invalid interval", () => {
		parseMetricsArgs(["--interval", "0"]);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalled();
	});

	it("ignores unknown flags", () => {
		const result = parseMetricsArgs(["--nope", "x", "--device", "D1"]);
		expect(result.device).toBe("D1");
		expect(result.port).toBe(DEFAULT_METRICS_PORT);
	});
});

// =============================================================================
// escapeLabelValue
// =============================================================================

describe("escapeLabelValue", () => {
	it("escapes backslashes, quotes, and newlines", () => {
		expect(escapeLabelValue('a"b\\c\nd')).toBe('a\\"b\\\\c\\nd');
	});

	it("leaves plain text unchanged", () => {
		expect(escapeLabelValue("Meat Probe 1")).toBe("Meat Probe 1");
	});
});

// =============================================================================
// renderMetrics
// =============================================================================

describe("renderMetrics", () => {
	it("always emits up and scrape errors", () => {
		const snapshot: MetricsSnapshot = { up: true, scrapeErrors: 3, devices: [] };
		const text = renderMetrics(snapshot);
		expect(text).toContain("# TYPE thermoworks_up gauge");
		expect(text).toContain("thermoworks_up 1");
		expect(text).toContain("# TYPE thermoworks_scrape_errors_total counter");
		expect(text).toContain("thermoworks_scrape_errors_total 3");
		expect(text.endsWith("\n")).toBe(true);
	});

	it("reports up=0 when the last poll failed", () => {
		const text = renderMetrics({ up: false, scrapeErrors: 1, devices: [] });
		expect(text).toContain("thermoworks_up 0");
	});

	it("emits temperature samples with channel labels", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker" }),
				channels: [makeChannel({ value: 203.4, units: "F", label: "Meat", number: "1" })],
			},
		];
		const text = renderMetrics({ up: true, scrapeErrors: 0, devices });
		expect(text).toContain(
			'thermoworks_channel_temperature{serial="S1",device="Smoker",channel="1",label="Meat",unit="F"} 203.4',
		);
	});

	it("emits min and max when present", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker" }),
				channels: [
					makeChannel({
						value: 200,
						units: "F",
						label: "Pit",
						number: "1",
						minimum: minMax(180),
						maximum: minMax(260),
					}),
				],
			},
		];
		const text = renderMetrics({ up: true, scrapeErrors: 0, devices });
		expect(text).toMatch(/thermoworks_channel_minimum\{[^}]*label="Pit"[^}]*\} 180/);
		expect(text).toMatch(/thermoworks_channel_maximum\{[^}]*label="Pit"[^}]*\} 260/);
	});

	it("emits alarm state only when the alarm is enabled", () => {
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
						alarmLow: {
							enabled: false,
							alarming: false,
							muted: null,
							value: null,
							units: null,
							lastNotified: null,
						},
					}),
				],
			},
		];
		const text = renderMetrics({ up: true, scrapeErrors: 0, devices });
		expect(text).toMatch(/thermoworks_channel_alarm_high\{[^}]*\} 1/);
		expect(text).not.toContain("thermoworks_channel_alarm_low{");
	});

	it("emits battery percent per device", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker", battery: 87 }),
				channels: [],
			},
		];
		const text = renderMetrics({ up: true, scrapeErrors: 0, devices });
		expect(text).toContain('thermoworks_device_battery_percent{serial="S1",device="Smoker"} 87');
	});

	it("skips disabled channels and null values", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: "Smoker" }),
				channels: [
					makeChannel({ value: null, units: "F", label: "Empty", number: "1" }),
					makeChannel({ value: 100, units: "F", label: "Off", number: "2", enabled: false }),
				],
			},
		];
		const text = renderMetrics({ up: true, scrapeErrors: 0, devices });
		expect(text).not.toContain("thermoworks_channel_temperature{");
	});

	it("escapes special characters in label values", () => {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "S1", label: 'My "Smoker"' }),
				channels: [makeChannel({ value: 100, units: "F", label: "Meat", number: "1" })],
			},
		];
		const text = renderMetrics({ up: true, scrapeErrors: 0, devices });
		expect(text).toContain('device="My \\"Smoker\\""');
	});
});

it("emits telemetry age metrics when timestamps are present", () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-01-15T12:10:00Z"));
	try {
		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({
					serial: "S1",
					label: "Smoker",
					latestReading: new Date("2026-01-15T12:08:00Z"),
				}),
				channels: [
					makeChannel({
						label: "Pit",
						number: "1",
						lastTelemetrySaved: new Date("2026-01-15T12:09:30Z"),
					}),
				],
			},
		];

		const text = renderMetrics({ up: true, scrapeErrors: 0, devices });

		expect(text).toContain(
			'thermoworks_device_telemetry_age_seconds{serial="S1",device="Smoker"} 120',
		);
		expect(text).toContain(
			'thermoworks_channel_telemetry_age_seconds{serial="S1",device="Smoker",channel="1",label="Pit"} 30',
		);
	} finally {
		vi.useRealTimers();
	}
});

it("skips telemetry age metrics when timestamps are missing", () => {
	const devices: DeviceWithChannels[] = [
		{
			device: makeDevice({ serial: "S1", label: "Smoker" }),
			channels: [makeChannel({ label: "Pit", number: "1" })],
		},
	];

	const text = renderMetrics({ up: true, scrapeErrors: 0, devices });

	expect(text).not.toContain("thermoworks_device_telemetry_age_seconds{");
	expect(text).not.toContain("thermoworks_channel_telemetry_age_seconds{");
});

// =============================================================================
// createMetricsServer (real HTTP)
// =============================================================================

describe("createMetricsServer", () => {
	function snapshotWithReading(): MetricsSnapshot {
		return {
			up: true,
			scrapeErrors: 0,
			devices: [
				{
					device: makeDevice({ serial: "S1", label: "Smoker" }),
					channels: [makeChannel({ value: 225, units: "F", label: "Pit", number: "1" })],
				},
			],
		};
	}

	async function withServer(
		snapshot: MetricsSnapshot,
		fn: (baseUrl: string) => Promise<void>,
	): Promise<void> {
		const server = createMetricsServer(() => snapshot);
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as AddressInfo;
		try {
			await fn(`http://127.0.0.1:${port}`);
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	}

	it("serves Prometheus text on /metrics", async () => {
		await withServer(snapshotWithReading(), async (baseUrl) => {
			const res = await fetch(`${baseUrl}/metrics`);
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toContain("version=0.0.4");
			const body = await res.text();
			expect(body).toContain("thermoworks_up 1");
			expect(body).toContain('thermoworks_channel_temperature{serial="S1"');
		});
	});

	it("serves an info page at the root", async () => {
		await withServer(snapshotWithReading(), async (baseUrl) => {
			const res = await fetch(`${baseUrl}/`);
			expect(res.status).toBe(200);
			expect(await res.text()).toContain("/metrics");
		});
	});

	it("returns 404 for unknown paths", async () => {
		await withServer(snapshotWithReading(), async (baseUrl) => {
			const res = await fetch(`${baseUrl}/nope`);
			expect(res.status).toBe(404);
		});
	});

	it("reflects the latest snapshot on each request", async () => {
		const snapshot: MetricsSnapshot = { up: false, scrapeErrors: 2, devices: [] };
		const server = createMetricsServer(() => snapshot);
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as AddressInfo;
		try {
			let body = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text();
			expect(body).toContain("thermoworks_up 0");

			snapshot.up = true;
			body = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text();
			expect(body).toContain("thermoworks_up 1");
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});
});
