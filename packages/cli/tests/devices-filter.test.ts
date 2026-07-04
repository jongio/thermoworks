import type { Device } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetDevices = vi.fn();
	const mockGetAllDeviceChannels = vi.fn();
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
}));

import { ThermoworksCloud } from "thermoworks-sdk";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetDevices = vi.mocked(mockClient.getDevices);
const mockGetAllDeviceChannels = vi.mocked(mockClient.getAllDeviceChannels);

// --- Helpers ---

function makeDevice(overrides: Partial<Device> & { serial: string }): Device {
	return {
		serial: overrides.serial,
		label: overrides.label ?? null,
		type: overrides.type ?? null,
		status: overrides.status ?? null,
	} as Device;
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(process, "exit").mockImplementation(() => {
		throw new Error("process.exit");
	});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

// =============================================================================
// parseDevicesArgs
// =============================================================================

describe("parseDevicesArgs", () => {
	it("returns no filter when no filter flags are given", async () => {
		const { parseDevicesArgs } = await import("../src/commands/devices.js");
		const opts = parseDevicesArgs([], { json: false });
		expect(opts.filter).toBeUndefined();
		expect(opts.channels).toBe(true);
	});

	it("sets channels false when --no-channels is present", async () => {
		const { parseDevicesArgs } = await import("../src/commands/devices.js");
		const opts = parseDevicesArgs(["--no-channels"], { json: false });
		expect(opts.channels).toBe(false);
	});

	it("maps single-value filter flags onto DeviceFilter", async () => {
		const { parseDevicesArgs } = await import("../src/commands/devices.js");
		const opts = parseDevicesArgs(
			["--type", "signals", "--status", "online", "--label", "Smoker", "--serial", "ABC123"],
			{ json: false },
		);
		expect(opts.filter).toEqual({
			type: "signals",
			status: "online",
			label: "Smoker",
			serial: "ABC123",
		});
	});

	it("treats comma-separated values as match-any arrays", async () => {
		const { parseDevicesArgs } = await import("../src/commands/devices.js");
		const opts = parseDevicesArgs(["--type", "node,smoke"], { json: false });
		expect(opts.filter).toEqual({ type: ["node", "smoke"] });
	});

	it("parses --active-within as a number of minutes", async () => {
		const { parseDevicesArgs } = await import("../src/commands/devices.js");
		const opts = parseDevicesArgs(["--active-within", "30"], { json: false });
		expect(opts.filter).toEqual({ activeWithinMinutes: 30 });
	});

	it("exits when --active-within is not a positive number", async () => {
		const { parseDevicesArgs } = await import("../src/commands/devices.js");
		expect(() => parseDevicesArgs(["--active-within", "0"], { json: false })).toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid --active-within"));
	});

	it("exits when --active-within is not a number", async () => {
		const { parseDevicesArgs } = await import("../src/commands/devices.js");
		expect(() => parseDevicesArgs(["--active-within", "soon"], { json: false })).toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid --active-within"));
	});
});

// =============================================================================
// devices (filter passthrough)
// =============================================================================

describe("devices with filter", () => {
	it("passes the parsed filter to getDevices", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "ABC123", label: "Smoker" })]);
		mockGetAllDeviceChannels.mockResolvedValue([]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: false, channels: false, filter: { status: "online" } });

		expect(mockGetDevices).toHaveBeenCalledWith({ status: "online" });
	});

	it("prints a filter-specific message when nothing matches", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: false, channels: false, filter: { type: "node" } });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("No devices match the filter.");
	});

	it("prints the default empty message when no filter is set", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDevices.mockResolvedValue([]);

		const { devices } = await import("../src/commands/devices.js");
		await devices({ json: false, channels: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("No devices found.");
	});
});
