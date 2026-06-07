import type { Device } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { outputJson, parseGlobalFlags } from "../src/output.js";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetDevices = vi.fn();
	const mockGetAllDeviceChannels = vi.fn().mockResolvedValue([]);
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
	getStoredEmail: vi.fn(),
}));

vi.mock("../src/prompt.js", () => ({
	prompt: vi.fn(),
	promptPassword: vi.fn(),
}));

import { ThermoworksCloud } from "thermoworks-sdk";
import { getCredentials, getStoredEmail } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);
const mockGetStoredEmail = vi.mocked(getStoredEmail);

const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetDevices = vi.mocked(mockClient.getDevices);

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
// output.ts - parseGlobalFlags
// =============================================================================

describe("parseGlobalFlags", () => {
	it("parses --json flag and removes it from remaining args", () => {
		const result = parseGlobalFlags(["devices", "--json"]);
		expect(result.options.json).toBe(true);
		expect(result.remaining).toEqual(["devices"]);
	});

	it("returns json: false when --json is absent", () => {
		const result = parseGlobalFlags(["auth", "status"]);
		expect(result.options.json).toBe(false);
		expect(result.remaining).toEqual(["auth", "status"]);
	});

	it("handles --json anywhere in args", () => {
		const result = parseGlobalFlags(["--json", "devices"]);
		expect(result.options.json).toBe(true);
		expect(result.remaining).toEqual(["devices"]);
	});

	it("handles empty args", () => {
		const result = parseGlobalFlags([]);
		expect(result.options.json).toBe(false);
		expect(result.remaining).toEqual([]);
	});
});

// =============================================================================
// output.ts - outputJson
// =============================================================================

describe("outputJson", () => {
	it("outputs pretty-printed JSON to console.log", () => {
		outputJson({ foo: "bar", count: 42 });
		expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ foo: "bar", count: 42 }, null, 2));
	});

	it("outputs arrays as JSON", () => {
		outputJson([1, 2, 3]);
		expect(logSpy).toHaveBeenCalledWith(JSON.stringify([1, 2, 3], null, 2));
	});
});

// =============================================================================
// commands/devices.ts --json
// =============================================================================

describe("devices --json", () => {
	it("outputs device list as JSON array", async () => {
		const deviceData = [
			makeDevice({
				serial: "ABC123",
				label: "Pit Sensor",
				type: "smoke",
				status: "online",
				battery: 85,
			}),
		];
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue(deviceData);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toBeInstanceOf(Array);
		expect(output).toHaveLength(1);
		expect(output[0].serial).toBe("ABC123");
		expect(output[0].label).toBe("Pit Sensor");
		expect(output[0].type).toBe("smoke");
		expect(output[0].status).toBe("online");
		expect(output[0].battery).toBe(85);
	});

	it("outputs empty array as JSON when no devices", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual([]);
	});

	it("outputs valid JSON with no ANSI codes", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "X", label: "Test" })]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: true });

		const raw = logSpy.mock.calls[0][0] as string;
		// ANSI escape codes start with ESC[ - verify none present
		expect(raw).not.toContain("\u001b[");
		// Verify it's valid JSON
		expect(() => JSON.parse(raw)).not.toThrow();
	});

	it("still exits with error on stderr when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { devices } = await import("../src/commands/devices.js");
		await expect(devices({ json: true })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});
});

// =============================================================================
// commands/auth.ts - authStatus --json
// =============================================================================

describe("authStatus --json", () => {
	it("outputs { loggedIn: true, email } when credentials exist", async () => {
		mockGetCredentials.mockResolvedValue({ email: "user@example.com", password: "pw" });

		const { authStatus } = await import("../src/commands/auth.js");
		await authStatus({ json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual({ loggedIn: true, email: "user@example.com" });
	});

	it("outputs { loggedIn: false, email, passwordMissing } when only email stored", async () => {
		mockGetCredentials.mockResolvedValue(null);
		mockGetStoredEmail.mockResolvedValue("partial@example.com");

		const { authStatus } = await import("../src/commands/auth.js");
		await authStatus({ json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual({
			loggedIn: false,
			email: "partial@example.com",
			passwordMissing: true,
		});
	});

	it("outputs { loggedIn: false } when no credentials at all", async () => {
		mockGetCredentials.mockResolvedValue(null);
		mockGetStoredEmail.mockResolvedValue(null);

		const { authStatus } = await import("../src/commands/auth.js");
		await authStatus({ json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual({ loggedIn: false });
	});

	it("outputs valid JSON with no ANSI codes", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });

		const { authStatus } = await import("../src/commands/auth.js");
		await authStatus({ json: true });

		const raw = logSpy.mock.calls[0][0] as string;
		expect(raw).not.toContain("\u001b[");
		expect(() => JSON.parse(raw)).not.toThrow();
	});
});
