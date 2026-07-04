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
		};
	});

	vi.doMock("../src/credentials.js", () => ({
		getCredentials: mockGetCredentials,
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

		await flushMicrotasks();

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

		await flushMicrotasks();

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
