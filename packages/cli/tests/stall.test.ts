import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetHistory = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getHistory = mockGetHistory;
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
const mockGetHistory = vi.mocked(mockClient.getHistory);

// --- Helpers ---

/** Build a flat plateau history: `count` readings around `value` at `stepMinutes` apart. */
function plateauHistory(value: number, count: number, stepMinutes: number) {
	const base = Date.parse("2024-03-15T12:00:00.000Z");
	const readings = Array.from({ length: count }, (_, i) => ({
		value,
		timestamp: new Date(base + i * stepMinutes * 60_000).toISOString(),
		units: "F",
	}));
	return { deviceId: "ABC123", readings };
}

// --- Test setup ---

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
// parseStallArgs
// =============================================================================

describe("parseStallArgs", () => {
	it("returns null when the serial is missing", async () => {
		const { parseStallArgs } = await import("../src/commands/stall.js");
		expect(parseStallArgs([])).toBeNull();
	});

	it("reads the serial and numeric flags", async () => {
		const { parseStallArgs } = await import("../src/commands/stall.js");
		expect(parseStallArgs(["ABC123", "--threshold", "3", "--duration", "45"])).toEqual({
			serial: "ABC123",
			thresholdDegrees: 3,
			durationMinutes: 45,
		});
	});

	it("leaves flags undefined when not provided", async () => {
		const { parseStallArgs } = await import("../src/commands/stall.js");
		expect(parseStallArgs(["ABC123"])).toEqual({
			serial: "ABC123",
			thresholdDegrees: undefined,
			durationMinutes: undefined,
		});
	});

	it("exits when a numeric flag is not a positive number", async () => {
		const { parseStallArgs } = await import("../src/commands/stall.js");
		expect(() => parseStallArgs(["ABC123", "--threshold", "0"])).toThrow("process.exit");
		expect(() => parseStallArgs(["ABC123", "--duration", "abc"])).toThrow("process.exit");
	});
});

// =============================================================================
// stall
// =============================================================================

describe("stall", () => {
	it("reports an active stall with a wrap suggestion", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue(plateauHistory(165, 12, 5));

		const { stall } = await import("../src/commands/stall.js");
		await stall(["ABC123"], { json: false });

		expect(mockGetHistory).toHaveBeenCalledWith("ABC123");
		const printed = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(printed).toContain("Stall on ABC123:");
		expect(printed).toContain("Suggestion:");
	});

	it("outputs JSON with the stall result when --json is set", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue(plateauHistory(165, 12, 5));

		const { stall } = await import("../src/commands/stall.js");
		await stall(["ABC123"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.serial).toBe("ABC123");
		expect(output.isStalling).toBe(true);
		expect(output.avgTemp).toBe(165);
	});

	it("reports no stall when the temperature is still climbing", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		const base = Date.parse("2024-03-15T12:00:00.000Z");
		const readings = Array.from({ length: 12 }, (_, i) => ({
			value: 140 + i * 5,
			timestamp: new Date(base + i * 5 * 60_000).toISOString(),
			units: "F",
		}));
		mockGetHistory.mockResolvedValue({ deviceId: "ABC123", readings });

		const { stall } = await import("../src/commands/stall.js");
		await stall(["ABC123"], { json: false });

		const printed = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(printed).toContain("No stall on ABC123");
	});

	it("sorts unordered readings before detecting", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		const history = plateauHistory(165, 12, 5);
		history.readings.reverse();
		mockGetHistory.mockResolvedValue(history);

		const { stall } = await import("../src/commands/stall.js");
		await stall(["ABC123"], { json: true });

		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.isStalling).toBe(true);
	});

	it("exits when there is not enough history", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue({ deviceId: "ABC123", readings: [] });

		const { stall } = await import("../src/commands/stall.js");
		await expect(stall(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not enough history"));
	});

	it("exits when no serial is provided", async () => {
		const { stall } = await import("../src/commands/stall.js");
		await expect(stall([], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);

		const { stall } = await import("../src/commands/stall.js");
		await expect(stall(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});
});
