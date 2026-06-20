import type { DataUsage, DeviceDataUsage } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetDataUsage = vi.fn();
	const mockGetDataUsageByDevice = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getDataUsage = mockGetDataUsage;
		getDataUsageByDevice = mockGetDataUsageByDevice;
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
const mockGetDataUsage = vi.mocked(
	(mockClient as unknown as { getDataUsage: () => Promise<DataUsage> }).getDataUsage,
);
const mockGetDataUsageByDevice = vi.mocked(
	(mockClient as unknown as { getDataUsageByDevice: () => Promise<DeviceDataUsage[]> })
		.getDataUsageByDevice,
);

// --- Helpers ---

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
// commands/data-usage.ts — total view
// =============================================================================

describe("data-usage (total)", () => {
	it("shows formatted account data usage", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDataUsage.mockResolvedValue({ totalBytes: 13_002_342, formattedSize: "12.4 MB" });

		const { dataUsage } = await import("../src/commands/data-usage.js");
		await dataUsage([], { json: false });

		expect(logSpy).toHaveBeenCalledWith("Account data usage: 12.4 MB");
	});

	it("handles zero bytes total", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDataUsage.mockResolvedValue({ totalBytes: 0, formattedSize: "0 B" });

		const { dataUsage } = await import("../src/commands/data-usage.js");
		await dataUsage([], { json: false });

		expect(logSpy).toHaveBeenCalledWith("Account data usage: 0 B");
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { dataUsage } = await import("../src/commands/data-usage.js");
		await expect(dataUsage([], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});
});

// =============================================================================
// commands/data-usage.ts — total --json
// =============================================================================

describe("data-usage --json (total)", () => {
	it("outputs DataUsage as JSON", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDataUsage.mockResolvedValue({ totalBytes: 13_002_342, formattedSize: "12.4 MB" });

		const { dataUsage } = await import("../src/commands/data-usage.js");
		await dataUsage([], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual({ totalBytes: 13_002_342, formattedSize: "12.4 MB" });
	});
});

// =============================================================================
// commands/data-usage.ts — --by-device view
// =============================================================================

describe("data-usage --by-device", () => {
	it("shows per-device table sorted by size descending", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDataUsageByDevice.mockResolvedValue([
			{ deviceId: "DEV-A", bytes: 1_000, formattedSize: "1.0 KB" },
			{ deviceId: "DEV-C", bytes: 50_000, formattedSize: "48.8 KB" },
			{ deviceId: "DEV-B", bytes: 10_000, formattedSize: "9.8 KB" },
		]);

		const { dataUsage } = await import("../src/commands/data-usage.js");
		await dataUsage(["--by-device"], { json: false });

		// Should have 3 lines, sorted descending by bytes
		expect(logSpy).toHaveBeenCalledTimes(3);
		const lines = logSpy.mock.calls.map((c) => c[0] as string);

		// First line: DEV-C (largest)
		expect(lines[0]).toContain("DEV-C");
		expect(lines[0]).toContain("48.8 KB");

		// Second line: DEV-B
		expect(lines[1]).toContain("DEV-B");
		expect(lines[1]).toContain("9.8 KB");

		// Third line: DEV-A (smallest)
		expect(lines[2]).toContain("DEV-A");
		expect(lines[2]).toContain("1.0 KB");
	});

	it("shows friendly message when no devices", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDataUsageByDevice.mockResolvedValue([]);

		const { dataUsage } = await import("../src/commands/data-usage.js");
		await dataUsage(["--by-device"], { json: false });

		expect(logSpy).toHaveBeenCalledWith("No device data usage.");
	});
});

// =============================================================================
// commands/data-usage.ts — --by-device --json
// =============================================================================

describe("data-usage --by-device --json", () => {
	it("outputs DeviceDataUsage[] sorted descending as JSON", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDataUsageByDevice.mockResolvedValue([
			{ deviceId: "DEV-A", bytes: 1_000, formattedSize: "1.0 KB" },
			{ deviceId: "DEV-C", bytes: 50_000, formattedSize: "48.8 KB" },
			{ deviceId: "DEV-B", bytes: 10_000, formattedSize: "9.8 KB" },
		]);

		const { dataUsage } = await import("../src/commands/data-usage.js");
		await dataUsage(["--by-device"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toHaveLength(3);
		expect(output[0].deviceId).toBe("DEV-C");
		expect(output[1].deviceId).toBe("DEV-B");
		expect(output[2].deviceId).toBe("DEV-A");
	});

	it("outputs empty array when no devices", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetDataUsageByDevice.mockResolvedValue([]);

		const { dataUsage } = await import("../src/commands/data-usage.js");
		await dataUsage(["--by-device"], { json: true });

		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual([]);
	});
});
