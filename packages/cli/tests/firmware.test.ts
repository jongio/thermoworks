import type { Device, FirmwareInfo } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetDevices = vi.fn();
	const mockGetFirmwareInfo = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getDevices = mockGetDevices;
		getFirmwareInfo = mockGetFirmwareInfo;
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
const mockGetFirmwareInfo = vi.mocked(
	(mockClient as unknown as { getFirmwareInfo: (type: string) => Promise<FirmwareInfo> })
		.getFirmwareInfo,
);

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
		firmware: overrides.firmware ?? null,
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
// commands/firmware.ts
// =============================================================================

describe("firmware", () => {
	it("shows firmware status with update available", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "SIG001", label: "Smoker", type: "signals", firmware: "2.90" }),
		]);
		mockGetFirmwareInfo.mockResolvedValue({
			name: "signals",
			version: "2.92",
			location: "https://example.com/fw.bin",
			md5: "abc123",
		});

		const { firmware } = await import("../src/commands/firmware.js");
		await firmware();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Smoker (signals)");
		expect(output).toContain("firmware: 2.90");
		expect(output).toContain("latest: 2.92");
		expect(output).toContain("UPDATE AVAILABLE");
	});

	it("shows up to date when firmware matches", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "NODE01", label: "Fridge", type: "node", firmware: "1.05" }),
		]);
		mockGetFirmwareInfo.mockResolvedValue({
			name: "node",
			version: "1.05",
			location: "https://example.com/fw.bin",
			md5: "def456",
		});

		const { firmware } = await import("../src/commands/firmware.js");
		await firmware();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Fridge (node)");
		expect(output).toContain("firmware: 1.05");
		expect(output).toContain("latest: 1.05");
		expect(output).toContain("UP TO DATE");
	});

	it("filters by --device serial", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "SIG001", label: "Smoker", type: "signals", firmware: "2.90" }),
			makeDevice({ serial: "NODE01", label: "Fridge", type: "node", firmware: "1.05" }),
		]);
		mockGetFirmwareInfo.mockResolvedValue({
			name: "node",
			version: "1.05",
			location: "",
			md5: "",
		});

		const { firmware } = await import("../src/commands/firmware.js");
		await firmware({ json: false }, "NODE01");

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Fridge (node)");
		expect(output).not.toContain("Smoker");
	});

	it("exits with error when --device serial not found", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "SIG001", label: "Smoker", type: "signals", firmware: "2.90" }),
		]);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { firmware } = await import("../src/commands/firmware.js");
		await expect(firmware({ json: false }, "UNKNOWN")).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No device found"));
		exitSpy.mockRestore();
	});

	it("shows message when no devices have firmware info", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "X", label: "No FW", type: null, firmware: null }),
		]);

		const { firmware } = await import("../src/commands/firmware.js");
		await firmware();

		expect(logSpy).toHaveBeenCalledWith("No devices with firmware information found.");
	});

	it("skips devices where getFirmwareInfo throws", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "SIG001", label: "Smoker", type: "signals", firmware: "2.90" }),
			makeDevice({ serial: "NODE01", label: "Fridge", type: "node", firmware: "1.05" }),
		]);
		mockGetFirmwareInfo
			.mockRejectedValueOnce(new Error("Not found")) // signals fails
			.mockResolvedValueOnce({ name: "node", version: "1.05", location: "", md5: "" });

		const { firmware } = await import("../src/commands/firmware.js");
		await firmware();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).not.toContain("Smoker");
		expect(output).toContain("Fridge (node)");
	});

	it("deduplicates firmware info calls for same device type", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "SIG001", label: "Pit", type: "signals", firmware: "2.90" }),
			makeDevice({ serial: "SIG002", label: "Meat", type: "signals", firmware: "2.90" }),
		]);
		mockGetFirmwareInfo.mockResolvedValue({
			name: "signals",
			version: "2.92",
			location: "",
			md5: "",
		});

		const { firmware } = await import("../src/commands/firmware.js");
		await firmware();

		// Should only call getFirmwareInfo once for "signals" type
		expect(mockGetFirmwareInfo).toHaveBeenCalledTimes(1);
		expect(mockGetFirmwareInfo).toHaveBeenCalledWith("signals");
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { firmware } = await import("../src/commands/firmware.js");
		await expect(firmware()).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});

	it("uses serial as label when label is null", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "SIG001", label: null, type: "signals", firmware: "2.90" }),
		]);
		mockGetFirmwareInfo.mockResolvedValue({
			name: "signals",
			version: "2.92",
			location: "",
			md5: "",
		});

		const { firmware } = await import("../src/commands/firmware.js");
		await firmware();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("SIG001 (signals)");
	});
});

// =============================================================================
// commands/firmware.ts --json
// =============================================================================

describe("firmware --json", () => {
	it("outputs firmware status as JSON array", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "SIG001", label: "Smoker", type: "signals", firmware: "2.90" }),
			makeDevice({ serial: "NODE01", label: "Fridge", type: "node", firmware: "1.05" }),
		]);
		mockGetFirmwareInfo
			.mockResolvedValueOnce({ name: "signals", version: "2.92", location: "", md5: "" })
			.mockResolvedValueOnce({ name: "node", version: "1.05", location: "", md5: "" });

		const { firmware } = await import("../src/commands/firmware.js");
		await firmware({ json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toHaveLength(2);
		expect(output[0]).toEqual({
			serial: "SIG001",
			label: "Smoker",
			type: "signals",
			current: "2.90",
			latest: "2.92",
			updateAvailable: true,
		});
		expect(output[1]).toEqual({
			serial: "NODE01",
			label: "Fridge",
			type: "node",
			current: "1.05",
			latest: "1.05",
			updateAvailable: false,
		});
	});

	it("outputs empty array when no devices have firmware", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "X", type: null, firmware: null })]);

		const { firmware } = await import("../src/commands/firmware.js");
		await firmware({ json: true });

		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual([]);
	});

	it("outputs valid JSON with no ANSI codes", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "SIG001", label: "Test", type: "signals", firmware: "2.90" }),
		]);
		mockGetFirmwareInfo.mockResolvedValue({
			name: "signals",
			version: "2.92",
			location: "",
			md5: "",
		});

		const { firmware } = await import("../src/commands/firmware.js");
		await firmware({ json: true });

		const raw = logSpy.mock.calls[0][0] as string;
		expect(raw).not.toContain("\u001b[");
		expect(() => JSON.parse(raw)).not.toThrow();
	});
});
