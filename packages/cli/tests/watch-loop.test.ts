import type { Device, DeviceChannel } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetCredentials = vi.fn<() => Promise<{ email: string; password: string } | null>>();
const mockGetDevices = vi.fn<() => Promise<Device[]>>();
const mockGetAllDeviceChannels = vi.fn<(serial: string) => Promise<DeviceChannel[]>>();
const mockClose = vi.fn<() => void>();

const OUTPUT_OPTIONS = { json: false };

function registerModuleMocks() {
	vi.doMock("thermoworks-sdk", () => {
		class MockThermoworksCloud {
			getDevices = mockGetDevices;
			getAllDeviceChannels = mockGetAllDeviceChannels;
			close = mockClose;
		}

		return {
			ThermoworksCloud: MockThermoworksCloud,
			getChannelAlarmState: vi.fn(() => "normal"),
			resolveChannelLabel: vi.fn(
				(
					_serial: string,
					ch: { label?: string | null; number?: string | null },
					_labels?: unknown,
					idx?: number,
				) => ch.label ?? (ch.number ? `Ch ${ch.number}` : `Ch ${(idx ?? 0) + 1}`),
			),
		};
	});

	vi.doMock("../src/credentials.js", () => ({
		getCredentials: mockGetCredentials,
	}));

	vi.doMock("../src/preferences.js", () => ({
		loadPreferences: vi.fn(() => Promise.resolve({})),
	}));

	vi.doMock("../src/config.js", () => ({
		loadConfig: vi.fn(() => Promise.resolve({ devices: [], refreshSeconds: 30 })),
		saveConfig: vi.fn(),
	}));
}

async function importWatchModule() {
	return await import("../src/commands/watch.js");
}

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
		enabled: overrides.enabled ?? true,
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

async function flushMicrotasks(rounds = 5): Promise<void> {
	for (let i = 0; i < rounds; i++) {
		await Promise.resolve();
	}
}

describe("watch", () => {
	let clearSpy: ReturnType<typeof vi.spyOn>;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let processOnSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.resetModules();
		vi.useFakeTimers();

		mockGetCredentials.mockReset();
		mockGetDevices.mockReset();
		mockGetAllDeviceChannels.mockReset();
		mockClose.mockReset();

		registerModuleMocks();

		clearSpy = vi.spyOn(console, "clear").mockImplementation(() => {});
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
		processOnSpy = vi
			.spyOn(process, "on")
			.mockImplementation(
				((..._args: Parameters<typeof process.on>) => process) as typeof process.on,
			);
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("exits if not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);

		const { watch } = await importWatchModule();

		await expect(watch([], OUTPUT_OPTIONS)).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith("Not logged in. Run: thermoworks auth login");
		expect(processOnSpy).not.toHaveBeenCalled();
	});

	it("exits if the device filter does not match any device", async () => {
		mockGetCredentials.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "ABC123", label: "Smoker" })]);

		const stopLoop = new Error("stop-loop");
		vi.spyOn(globalThis, "setTimeout").mockImplementation(() => {
			throw stopLoop;
		});

		const { watch } = await importWatchModule();

		await expect(watch(["--device", "MISSING", "--interval", "1"], OUTPUT_OPTIONS)).rejects.toThrow(
			"stop-loop",
		);
		expect(mockGetDevices).toHaveBeenCalledTimes(1);
		expect(mockGetAllDeviceChannels).not.toHaveBeenCalled();
		expect(clearSpy).toHaveBeenCalledTimes(1);
		expect(errorSpy).toHaveBeenCalledWith("No device found with serial: MISSING");
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("runs a successful iteration and waits for the next interval", async () => {
		mockGetCredentials.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		mockGetDevices
			.mockResolvedValueOnce([makeDevice({ serial: "ABC123", label: "Smoker", type: "signals" })])
			.mockImplementationOnce(() => new Promise<Device[]>(() => {}));
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", label: "Ambient", number: "1", enabled: true }),
		]);

		const { watch } = await importWatchModule();
		const watchPromise = watch(["--interval", "1"], OUTPUT_OPTIONS);

		await flushMicrotasks(10);

		expect(mockGetDevices).toHaveBeenCalledTimes(1);
		expect(mockGetAllDeviceChannels).toHaveBeenCalledWith("ABC123");
		expect(clearSpy).toHaveBeenCalledTimes(1);
		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(logSpy.mock.calls[0]?.[0]).toContain("ThermoWorks Watch");
		expect(logSpy.mock.calls[0]?.[0]).toContain("Smoker");
		expect(logSpy.mock.calls[0]?.[0]).toContain("Ambient");
		expect(processOnSpy).toHaveBeenCalledWith("exit", expect.any(Function));

		const cleanupHandler = processOnSpy.mock.calls[0]?.[1];
		expect(cleanupHandler).toEqual(expect.any(Function));
		cleanupHandler?.();
		expect(mockClose).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1000);
		await flushMicrotasks();

		expect(mockGetDevices).toHaveBeenCalledTimes(2);
		void watchPromise;
	});

	it("handles errors during fetch gracefully", async () => {
		mockGetCredentials.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		mockGetDevices.mockRejectedValueOnce(new Error("network down"));

		const stopLoop = new Error("stop-loop");
		vi.spyOn(globalThis, "setTimeout").mockImplementation(() => {
			throw stopLoop;
		});

		const { watch } = await importWatchModule();

		await expect(watch(["--interval", "2"], OUTPUT_OPTIONS)).rejects.toThrow("stop-loop");
		expect(errorSpy).toHaveBeenCalledWith("Error fetching data: network down");
		expect(clearSpy).not.toHaveBeenCalled();
		expect(logSpy).not.toHaveBeenCalled();
		expect(mockGetAllDeviceChannels).not.toHaveBeenCalled();
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("emits an NDJSON frame per refresh in --json mode without clearing the screen", async () => {
		mockGetCredentials.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		mockGetDevices
			.mockResolvedValueOnce([makeDevice({ serial: "ABC123", label: "Smoker", type: "signals" })])
			.mockImplementationOnce(() => new Promise<Device[]>(() => {}));
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel({ value: 225, units: "F", label: "Ambient", number: "1", enabled: true }),
		]);

		const { watch } = await importWatchModule();
		const watchPromise = watch(["--interval", "1"], { json: true });

		await flushMicrotasks(10);

		expect(clearSpy).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledTimes(1);
		const line = logSpy.mock.calls[0]?.[0] as string;
		expect(line).not.toContain("\n");
		const parsed = JSON.parse(line);
		expect(parsed.devices[0].serial).toBe("ABC123");
		expect(parsed.devices[0].channels[0]).toMatchObject({ label: "Ambient", value: 225 });
		expect(typeof parsed.timestamp).toBe("string");
		void watchPromise;
	});
});

// =============================================================================
// watch --until-alarm loop behavior
// =============================================================================

// These tests need getChannelAlarmState to return real alarm states (not the
// constant "normal" mock above), so they register their own SDK mock with the
// actual alarm-detection logic inlined.

const mockGetCredentialsAlarm = vi.fn<() => Promise<{ email: string; password: string } | null>>();
const mockGetDevicesAlarm = vi.fn<() => Promise<Device[]>>();
const mockGetAllDeviceChannelsAlarm = vi.fn<(serial: string) => Promise<DeviceChannel[]>>();
const mockCloseAlarm = vi.fn<() => void>();

function registerAlarmMocks() {
	vi.doMock("thermoworks-sdk", () => {
		class MockThermoworksCloud {
			getDevices = mockGetDevicesAlarm;
			getAllDeviceChannels = mockGetAllDeviceChannelsAlarm;
			close = mockCloseAlarm;
		}

		return {
			ThermoworksCloud: MockThermoworksCloud,
			// Real alarm detection so findFirstAlarmingChannel works correctly.
			getChannelAlarmState: (ch: DeviceChannel) => {
				if (ch.alarmHigh?.alarming) return "high";
				if (ch.alarmLow?.alarming) return "low";
				return "none";
			},
			resolveChannelLabel: (
				_serial: string,
				ch: { label?: string | null; number?: string | null },
				_labels?: unknown,
				idx?: number,
			) => ch.label ?? (ch.number ? `Ch ${ch.number}` : `Ch ${(idx ?? 0) + 1}`),
		};
	});

	vi.doMock("../src/credentials.js", () => ({
		getCredentials: mockGetCredentialsAlarm,
	}));

	vi.doMock("../src/preferences.js", () => ({
		loadPreferences: vi.fn(() => Promise.resolve({})),
	}));

	vi.doMock("../src/config.js", () => ({
		loadConfig: vi.fn(() => Promise.resolve({ devices: [], refreshSeconds: 30 })),
		saveConfig: vi.fn(),
	}));
}

describe("watch --until-alarm", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.resetModules();
		vi.useFakeTimers();

		mockGetCredentialsAlarm.mockReset();
		mockGetDevicesAlarm.mockReset();
		mockGetAllDeviceChannelsAlarm.mockReset();
		mockCloseAlarm.mockReset();

		registerAlarmMocks();

		// Suppress console.clear and process.on but we don't need to assert on them.
		vi.spyOn(console, "clear").mockImplementation(() => {});
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
		vi.spyOn(process, "on").mockImplementation(
			((..._args: Parameters<typeof process.on>) => process) as typeof process.on,
		);
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("exits with code 0 when a channel enters high alarm", async () => {
		mockGetCredentialsAlarm.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		mockGetDevicesAlarm.mockResolvedValue([
			makeDevice({ serial: "ABC123", label: "Smoker", type: "signals" }),
		]);
		mockGetAllDeviceChannelsAlarm.mockResolvedValue([
			makeChannel({
				value: 275,
				units: "F",
				label: "Pit",
				number: "1",
				enabled: true,
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

		const { watch } = await import("../src/commands/watch.js");

		await expect(watch(["--until-alarm", "--interval", "1"], OUTPUT_OPTIONS)).rejects.toThrow(
			"process.exit",
		);

		expect(exitSpy).toHaveBeenCalledWith(0);
		// Should print the alarm trigger details.
		const logOutput = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(logOutput).toContain("Alarm triggered: HIGH");
		expect(logOutput).toContain("Smoker");
		expect(logOutput).toContain("Pit");
		expect(logOutput).toContain("275°F");
		expect(logOutput).toContain("250°F");
	});

	it("exits with code 0 when a channel enters low alarm", async () => {
		mockGetCredentialsAlarm.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		mockGetDevicesAlarm.mockResolvedValue([makeDevice({ serial: "S1", label: "Fridge" })]);
		mockGetAllDeviceChannelsAlarm.mockResolvedValue([
			makeChannel({
				value: 45,
				units: "F",
				label: "Internal",
				number: "1",
				enabled: true,
				alarmLow: {
					enabled: true,
					alarming: true,
					muted: null,
					value: 40,
					units: "F",
					lastNotified: null,
				},
			}),
		]);

		const { watch } = await import("../src/commands/watch.js");

		await expect(watch(["--until-alarm", "--interval", "1"], OUTPUT_OPTIONS)).rejects.toThrow(
			"process.exit",
		);

		expect(exitSpy).toHaveBeenCalledWith(0);
		const logOutput = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(logOutput).toContain("Alarm triggered: LOW");
	});

	it("emits a JSON alarm result with --json", async () => {
		mockGetCredentialsAlarm.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		mockGetDevicesAlarm.mockResolvedValue([
			makeDevice({ serial: "ABC123", label: "Smoker", type: "signals" }),
		]);
		mockGetAllDeviceChannelsAlarm.mockResolvedValue([
			makeChannel({
				value: 205,
				units: "F",
				label: "Meat",
				number: "2",
				enabled: true,
				alarmHigh: {
					enabled: true,
					alarming: true,
					muted: null,
					value: 203,
					units: "F",
					lastNotified: null,
				},
			}),
		]);

		const { watch } = await import("../src/commands/watch.js");

		await expect(watch(["--until-alarm", "--interval", "1"], { json: true })).rejects.toThrow(
			"process.exit",
		);

		expect(exitSpy).toHaveBeenCalledWith(0);

		// The last log call should contain the alarm JSON object.
		const lastLogCall = logSpy.mock.calls[logSpy.mock.calls.length - 1]?.[0] as string;
		const parsed = JSON.parse(lastLogCall);
		expect(parsed.alarm).toEqual({
			device: "Smoker",
			channel: "Meat",
			value: 205,
			units: "F",
			threshold: 203,
			alarmType: "high",
		});
	});

	it("exits with code 2 on timeout", async () => {
		mockGetCredentialsAlarm.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		// Allow exactly two fetch cycles (iteration 1 under timeout, iteration
		// 2 fires the timeout check). Third+ calls hang to prevent residual
		// iterations from producing unhandled rejections.
		mockGetDevicesAlarm
			.mockResolvedValueOnce([makeDevice({ serial: "ABC123", label: "Smoker" })])
			.mockResolvedValueOnce([makeDevice({ serial: "ABC123", label: "Smoker" })])
			.mockImplementation(() => new Promise<Device[]>(() => {}));
		mockGetAllDeviceChannelsAlarm.mockResolvedValue([
			makeChannel({ value: 180, units: "F", label: "Meat", number: "1", enabled: true }),
		]);

		const { watch } = await import("../src/commands/watch.js");

		const watchPromise = watch(
			["--until-alarm", "--timeout", "1", "--interval", "2"],
			OUTPUT_OPTIONS,
		);
		// Attach a rejection handler BEFORE advancing timers so the rejection
		// that fires during advanceTimersByTimeAsync is not reported as unhandled.
		const assertion = expect(watchPromise).rejects.toThrow("process.exit");

		await flushMicrotasks();
		await vi.advanceTimersByTimeAsync(2000);
		await flushMicrotasks();

		await assertion;
		expect(exitSpy).toHaveBeenCalledWith(2);
		expect(errorSpy).toHaveBeenCalledWith("Timeout: no alarm detected within 1s");
	});

	it("emits a JSON timeout result with --json", async () => {
		mockGetCredentialsAlarm.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		mockGetDevicesAlarm
			.mockResolvedValueOnce([makeDevice({ serial: "ABC123", label: "Smoker" })])
			.mockResolvedValueOnce([makeDevice({ serial: "ABC123", label: "Smoker" })])
			.mockImplementation(() => new Promise<Device[]>(() => {}));
		mockGetAllDeviceChannelsAlarm.mockResolvedValue([
			makeChannel({ value: 180, units: "F", label: "Meat", number: "1", enabled: true }),
		]);

		const { watch } = await import("../src/commands/watch.js");

		const watchPromise = watch(["--until-alarm", "--timeout", "1", "--interval", "2"], {
			json: true,
		});
		const assertion = expect(watchPromise).rejects.toThrow("process.exit");

		await flushMicrotasks();
		await vi.advanceTimersByTimeAsync(2000);
		await flushMicrotasks();

		await assertion;
		expect(exitSpy).toHaveBeenCalledWith(2);

		// The last log call should be a JSON timeout object.
		const lastLogCall = logSpy.mock.calls[logSpy.mock.calls.length - 1]?.[0] as string;
		const parsed = JSON.parse(lastLogCall);
		expect(parsed.timeout).toBe(true);
		expect(typeof parsed.elapsed).toBe("number");
	});

	it("fires the timeout well before a long --interval elapses", async () => {
		mockGetCredentialsAlarm.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		// One fetch cycle, then the bounded wait must let the timeout fire at ~1s
		// rather than blocking for the full 10s poll interval.
		mockGetDevicesAlarm
			.mockResolvedValueOnce([makeDevice({ serial: "ABC123", label: "Smoker" })])
			.mockImplementation(() => new Promise<Device[]>(() => {}));
		mockGetAllDeviceChannelsAlarm.mockResolvedValue([
			makeChannel({ value: 180, units: "F", label: "Meat", number: "1", enabled: true }),
		]);

		const { watch } = await import("../src/commands/watch.js");

		const watchPromise = watch(["--until-alarm", "--timeout", "1", "--interval", "10"], {
			json: false,
		});
		const assertion = expect(watchPromise).rejects.toThrow("process.exit");

		await flushMicrotasks();
		// Advance only 1s: far short of the 10s interval. Before the fix this
		// would not exit until 10s; now the bounded wait fires the timeout.
		await vi.advanceTimersByTimeAsync(1000);
		await flushMicrotasks();

		await assertion;
		expect(exitSpy).toHaveBeenCalledWith(2);
		expect(errorSpy).toHaveBeenCalledWith("Timeout: no alarm detected within 1s");
	});

	it("keeps watching without --until-alarm even when a channel is alarming", async () => {
		mockGetCredentialsAlarm.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		mockGetDevicesAlarm
			.mockResolvedValueOnce([makeDevice({ serial: "ABC123", label: "Smoker", type: "signals" })])
			.mockImplementationOnce(() => new Promise<Device[]>(() => {}));
		mockGetAllDeviceChannelsAlarm.mockResolvedValue([
			makeChannel({
				value: 275,
				units: "F",
				label: "Pit",
				number: "1",
				enabled: true,
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

		const { watch } = await import("../src/commands/watch.js");
		// Normal watch (no --until-alarm): should NOT exit on alarm.
		const watchPromise = watch(["--interval", "1"], OUTPUT_OPTIONS);

		await flushMicrotasks();

		// exitSpy should NOT have been called with 0 (alarm exit).
		expect(exitSpy).not.toHaveBeenCalledWith(0);
		// The loop should proceed to the next iteration.
		await vi.advanceTimersByTimeAsync(1000);
		await flushMicrotasks();
		expect(mockGetDevicesAlarm).toHaveBeenCalledTimes(2);

		void watchPromise;
	});
});
