import type { DeviceChannel } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AlarmEvent } from "../src/commands/alarm-notifier.js";
import {
	buildAlarmEntityId,
	buildTemperatureEntityId,
	HomeAssistantAlarmSink,
	HomeAssistantPublisher,
	sanitizeEntityId,
} from "../src/commands/home-assistant.js";
import type { DeviceWithChannels } from "../src/commands/watch.js";
import { parseWatchArgs } from "../src/commands/watch.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

interface MockDevice {
	serial: string;
	label: string | null;
	type: string | null;
	status: string | null;
	battery: number | null;
	[key: string]: unknown;
}

function makeDevice(overrides: Partial<MockDevice> & { serial: string }): MockDevice {
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
		lastSeen: null,
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
		rateOfChange: overrides.rateOfChange ?? null,
		rateOfChangeUnit: overrides.rateOfChangeUnit ?? null,
		alarmHigh: overrides.alarmHigh ?? null,
		alarmLow: overrides.alarmLow ?? null,
		minimum: null,
		maximum: null,
	};
}

function makeAlarmEvent(overrides: Partial<AlarmEvent> = {}): AlarmEvent {
	return {
		device: overrides.device ?? "Smoker",
		channel: overrides.channel ?? "Pit",
		value: overrides.value ?? 275,
		units: overrides.units ?? "F",
		threshold: overrides.threshold ?? 250,
		alarmType: overrides.alarmType ?? "high",
		timestamp: overrides.timestamp ?? "2025-07-01T12:00:00.000Z",
	};
}

/** Create a mock fetch that records calls and returns OK. */
function createMockFetch(status = 200, statusText = "OK") {
	const calls: { url: string; init: RequestInit }[] = [];
	const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		calls.push({ url: String(url), init: init ?? {} });
		return new Response(JSON.stringify({ state: "ok" }), { status, statusText });
	});
	return { fn, calls };
}

// =============================================================================
// sanitizeEntityId
// =============================================================================

describe("sanitizeEntityId", () => {
	it("lowercases and replaces non-alphanumeric chars with underscores", () => {
		expect(sanitizeEntityId("Smoker-BBQ")).toBe("smoker_bbq");
	});

	it("collapses consecutive underscores", () => {
		expect(sanitizeEntityId("a--b__c")).toBe("a_b_c");
	});

	it("strips leading and trailing underscores", () => {
		expect(sanitizeEntityId("_foo_")).toBe("foo");
	});

	it("handles serials with mixed characters", () => {
		expect(sanitizeEntityId("M100.009/168")).toBe("m100_009_168");
	});

	it("handles empty string", () => {
		expect(sanitizeEntityId("")).toBe("");
	});
});

// =============================================================================
// buildTemperatureEntityId
// =============================================================================

describe("buildTemperatureEntityId", () => {
	it("builds a sensor entity ID from serial and channel", () => {
		expect(buildTemperatureEntityId("ABC123", "Pit")).toBe("sensor.thermoworks_abc123_pit");
	});

	it("sanitizes special characters in the channel label", () => {
		expect(buildTemperatureEntityId("M100", "Meat Probe #1")).toBe(
			"sensor.thermoworks_m100_meat_probe_1",
		);
	});
});

// =============================================================================
// buildAlarmEntityId
// =============================================================================

describe("buildAlarmEntityId", () => {
	it("builds a binary_sensor entity ID for high alarm", () => {
		expect(buildAlarmEntityId("ABC123", "Pit", "high")).toBe(
			"binary_sensor.thermoworks_abc123_pit_alarm_high",
		);
	});

	it("builds a binary_sensor entity ID for low alarm", () => {
		expect(buildAlarmEntityId("SN99", "Internal", "low")).toBe(
			"binary_sensor.thermoworks_sn99_internal_alarm_low",
		);
	});
});

// =============================================================================
// HomeAssistantPublisher
// =============================================================================

describe("HomeAssistantPublisher", () => {
	it("publishes temperature readings as HA sensor entities", async () => {
		const { fn, calls } = createMockFetch();
		const logError = vi.fn();
		const publisher = new HomeAssistantPublisher(
			{ url: "http://ha.local:8123", token: "test-token", fetchFn: fn },
			logError,
		);

		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "ABC123", label: "Smoker" }) as never,
				channels: [
					makeChannel({ label: "Pit", value: 225, units: "F", enabled: true }),
					makeChannel({ label: "Meat", value: 165, units: "F", enabled: true }),
				],
			},
		];

		await publisher.publishTemperatures(devices);

		expect(calls).toHaveLength(2);

		// Verify first call (Pit)
		expect(calls[0].url).toBe("http://ha.local:8123/api/states/sensor.thermoworks_abc123_pit");
		const pitInit = calls[0].init;
		expect(pitInit.method).toBe("POST");
		expect(pitInit.headers).toEqual({
			Authorization: "Bearer test-token",
			"Content-Type": "application/json",
		});
		const pitBody = JSON.parse(pitInit.body as string);
		expect(pitBody.state).toBe("225");
		expect(pitBody.attributes.unit_of_measurement).toBe("°F");
		expect(pitBody.attributes.device_class).toBe("temperature");
		expect(pitBody.attributes.friendly_name).toBe("Smoker Pit");

		// Verify second call (Meat)
		expect(calls[1].url).toBe("http://ha.local:8123/api/states/sensor.thermoworks_abc123_meat");
		const meatBody = JSON.parse(calls[1].init.body as string);
		expect(meatBody.state).toBe("165");

		expect(logError).not.toHaveBeenCalled();
	});

	it("publishes Celsius units correctly", async () => {
		const { fn, calls } = createMockFetch();
		const publisher = new HomeAssistantPublisher({
			url: "http://ha.local:8123",
			token: "t",
			fetchFn: fn,
		});

		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "SN1" }) as never,
				channels: [makeChannel({ label: "Probe", value: 100, units: "C", enabled: true })],
			},
		];

		await publisher.publishTemperatures(devices);
		const body = JSON.parse(calls[0].init.body as string);
		expect(body.attributes.unit_of_measurement).toBe("°C");
	});

	it("marks channels with null value as unavailable", async () => {
		const { fn, calls } = createMockFetch();
		const publisher = new HomeAssistantPublisher({
			url: "http://ha.local:8123",
			token: "t",
			fetchFn: fn,
		});

		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "SN1", label: "Fridge" }) as never,
				channels: [makeChannel({ label: "Internal", value: null, enabled: true })],
			},
		];

		await publisher.publishTemperatures(devices);
		expect(calls).toHaveLength(1);
		const body = JSON.parse(calls[0].init.body as string);
		expect(body.state).toBe("unavailable");
		expect(body.attributes.friendly_name).toBe("Fridge Internal");
	});

	it("skips disabled channels", async () => {
		const { fn, calls } = createMockFetch();
		const publisher = new HomeAssistantPublisher({
			url: "http://ha.local:8123",
			token: "t",
			fetchFn: fn,
		});

		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "SN1" }) as never,
				channels: [
					makeChannel({ label: "Pit", value: 225, units: "F", enabled: false }),
					makeChannel({ label: "Meat", value: 165, units: "F", enabled: true }),
				],
			},
		];

		await publisher.publishTemperatures(devices);
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toContain("meat");
	});

	it("marks previously-known entities as unavailable when they disappear", async () => {
		const { fn, calls } = createMockFetch();
		const publisher = new HomeAssistantPublisher({
			url: "http://ha.local:8123",
			token: "t",
			fetchFn: fn,
		});

		// First publish: two channels.
		const devicesV1: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "SN1" }) as never,
				channels: [
					makeChannel({ label: "Pit", value: 225, units: "F", enabled: true }),
					makeChannel({ label: "Meat", value: 165, units: "F", enabled: true }),
				],
			},
		];
		await publisher.publishTemperatures(devicesV1);
		expect(calls).toHaveLength(2);

		// Second publish: only Pit remains.
		calls.length = 0;
		const devicesV2: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "SN1" }) as never,
				channels: [makeChannel({ label: "Pit", value: 226, units: "F", enabled: true })],
			},
		];
		await publisher.publishTemperatures(devicesV2);

		// Should publish Pit + mark Meat as unavailable.
		expect(calls).toHaveLength(2);
		const unavailableCall = calls.find((c) => c.url.includes("meat"));
		expect(unavailableCall).toBeDefined();
		const body = JSON.parse(unavailableCall!.init.body as string);
		expect(body.state).toBe("unavailable");
	});

	it("logs errors on HTTP failure without throwing", async () => {
		const { fn } = createMockFetch(500, "Internal Server Error");
		const logError = vi.fn();
		const publisher = new HomeAssistantPublisher(
			{ url: "http://ha.local:8123", token: "t", fetchFn: fn },
			logError,
		);

		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "SN1" }) as never,
				channels: [makeChannel({ label: "Pit", value: 225, units: "F", enabled: true })],
			},
		];

		// Should NOT throw.
		await publisher.publishTemperatures(devices);
		expect(logError).toHaveBeenCalledWith(expect.stringContaining("HTTP 500"));
	});

	it("logs errors on network failure without throwing", async () => {
		const fn = vi.fn(async () => {
			throw new Error("ECONNREFUSED");
		});
		const logError = vi.fn();
		const publisher = new HomeAssistantPublisher(
			{ url: "http://ha.local:8123", token: "t", fetchFn: fn as never },
			logError,
		);

		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "SN1" }) as never,
				channels: [makeChannel({ label: "Pit", value: 225, units: "F", enabled: true })],
			},
		];

		await publisher.publishTemperatures(devices);
		expect(logError).toHaveBeenCalledWith(expect.stringContaining("ECONNREFUSED"));
	});

	it("strips trailing slashes from the URL", async () => {
		const { fn, calls } = createMockFetch();
		const publisher = new HomeAssistantPublisher({
			url: "http://ha.local:8123///",
			token: "t",
			fetchFn: fn,
		});

		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "SN1" }) as never,
				channels: [makeChannel({ label: "Pit", value: 200, units: "F", enabled: true })],
			},
		];

		await publisher.publishTemperatures(devices);
		expect(calls[0].url).toBe("http://ha.local:8123/api/states/sensor.thermoworks_sn1_pit");
	});

	it("uses device serial as fallback name when label is null", async () => {
		const { fn, calls } = createMockFetch();
		const publisher = new HomeAssistantPublisher({
			url: "http://ha.local:8123",
			token: "t",
			fetchFn: fn,
		});

		const devices: DeviceWithChannels[] = [
			{
				device: makeDevice({ serial: "SN1", label: null }) as never,
				channels: [makeChannel({ label: "Pit", value: 200, units: "F", enabled: true })],
			},
		];

		await publisher.publishTemperatures(devices);
		const body = JSON.parse(calls[0].init.body as string);
		expect(body.attributes.friendly_name).toBe("SN1 Pit");
	});
});

// =============================================================================
// HomeAssistantAlarmSink
// =============================================================================

describe("HomeAssistantAlarmSink", () => {
	it("has the name 'home-assistant'", () => {
		const sink = new HomeAssistantAlarmSink({
			url: "http://ha.local:8123",
			token: "t",
		});
		expect(sink.name).toBe("home-assistant");
	});

	it("posts alarm events as binary_sensor entities", async () => {
		const { fn, calls } = createMockFetch();
		const sink = new HomeAssistantAlarmSink({
			url: "http://ha.local:8123",
			token: "test-token",
			fetchFn: fn,
		});

		const event = makeAlarmEvent();
		await sink.send(event);

		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(
			"http://ha.local:8123/api/states/binary_sensor.thermoworks_smoker_pit_alarm_high",
		);
		const init = calls[0].init;
		expect(init.headers).toEqual({
			Authorization: "Bearer test-token",
			"Content-Type": "application/json",
		});
		const body = JSON.parse(init.body as string);
		expect(body.state).toBe("on");
		expect(body.attributes.device_class).toBe("heat");
		expect(body.attributes.alarm_type).toBe("high");
		expect(body.attributes.temperature).toBe(275);
		expect(body.attributes.threshold).toBe(250);
	});

	it("throws on HTTP failure so the notifier can handle it", async () => {
		const { fn } = createMockFetch(401, "Unauthorized");
		const sink = new HomeAssistantAlarmSink({
			url: "http://ha.local:8123",
			token: "bad-token",
			fetchFn: fn,
		});

		await expect(sink.send(makeAlarmEvent())).rejects.toThrow("HTTP 401");
	});

	it("throws on network failure so the notifier can handle it", async () => {
		const fn = vi.fn(async () => {
			throw new Error("ECONNREFUSED");
		});
		const sink = new HomeAssistantAlarmSink({
			url: "http://ha.local:8123",
			token: "t",
			fetchFn: fn as never,
		});

		await expect(sink.send(makeAlarmEvent())).rejects.toThrow("ECONNREFUSED");
	});

	it("posts low alarm events correctly", async () => {
		const { fn, calls } = createMockFetch();
		const sink = new HomeAssistantAlarmSink({
			url: "http://ha.local:8123",
			token: "t",
			fetchFn: fn,
		});

		const event = makeAlarmEvent({ alarmType: "low", channel: "Internal" });
		await sink.send(event);

		expect(calls[0].url).toContain("alarm_low");
		const body = JSON.parse(calls[0].init.body as string);
		expect(body.attributes.alarm_type).toBe("low");
	});
});

// =============================================================================
// parseWatchArgs: Home Assistant flags
// =============================================================================

describe("parseWatchArgs Home Assistant flags", () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete process.env.THERMOWORKS_HA_URL;
		delete process.env.THERMOWORKS_HA_TOKEN;
	});

	it("parses --ha-url and --ha-token", () => {
		const result = parseWatchArgs([
			"--ha-url",
			"http://ha.local:8123",
			"--ha-token",
			"my-secret-token",
		]);
		expect(result.haUrl).toBe("http://ha.local:8123");
		expect(result.haToken).toBe("my-secret-token");
	});

	it("defaults haUrl and haToken to undefined", () => {
		const result = parseWatchArgs([]);
		expect(result.haUrl).toBeUndefined();
		expect(result.haToken).toBeUndefined();
	});

	it("falls back to env vars when flags are not provided", () => {
		process.env.THERMOWORKS_HA_URL = "http://env-ha.local:8123";
		process.env.THERMOWORKS_HA_TOKEN = "env-token";

		const result = parseWatchArgs([]);
		expect(result.haUrl).toBe("http://env-ha.local:8123");
		expect(result.haToken).toBe("env-token");
	});

	it("flags override env vars", () => {
		process.env.THERMOWORKS_HA_URL = "http://env-ha.local:8123";
		process.env.THERMOWORKS_HA_TOKEN = "env-token";

		const result = parseWatchArgs([
			"--ha-url",
			"http://flag-ha.local:8123",
			"--ha-token",
			"flag-token",
		]);
		expect(result.haUrl).toBe("http://flag-ha.local:8123");
		expect(result.haToken).toBe("flag-token");
	});

	it("errors when --ha-url is provided without --ha-token", () => {
		parseWatchArgs(["--ha-url", "http://ha.local:8123"]);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--ha-url requires --ha-token"));
	});

	it("errors when --ha-token is provided without --ha-url", () => {
		parseWatchArgs(["--ha-token", "my-token"]);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--ha-token requires --ha-url"));
	});

	it("errors on invalid --ha-url", () => {
		parseWatchArgs(["--ha-url", "not-a-url", "--ha-token", "t"]);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not a valid URL"));
	});

	it("warns and ignores invalid THERMOWORKS_HA_URL env var", () => {
		process.env.THERMOWORKS_HA_URL = "not-a-url";
		process.env.THERMOWORKS_HA_TOKEN = "t";

		const result = parseWatchArgs([]);
		// URL is invalid so it's not set; token alone triggers the error.
		expect(result.haUrl).toBeUndefined();
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("ignoring invalid THERMOWORKS_HA_URL"),
		);
	});

	it("errors when --ha-url is missing a value", () => {
		parseWatchArgs(["--ha-url"]);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--ha-url requires a value"));
	});

	it("errors when --ha-token is missing a value", () => {
		parseWatchArgs(["--ha-token"]);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--ha-token requires a value"));
	});
});
