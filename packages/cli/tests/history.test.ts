import type { DeviceHistory, HistoricalReading } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

const mockGetHistory = vi.fn();
const mockClose = vi.fn();
const mockWriteFile = vi.fn();

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();

	class MockThermoworksCloud {
		getHistory = mockGetHistory;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
	writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

import { formatCsv, formatTable, history, parseHistoryArgs } from "../src/commands/history.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

// --- Helpers ---

function makeReading(overrides: Partial<HistoricalReading> & { value: number }): HistoricalReading {
	return {
		value: overrides.value,
		timestamp: overrides.timestamp ?? "2026-01-15T12:00:00.000Z",
		units: overrides.units ?? "F",
	};
}

function makeHistory(serial: string, readings: HistoricalReading[]): DeviceHistory {
	return { deviceId: serial, readings };
}

// --- Test suites ---

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

// =============================================================================
// parseHistoryArgs
// =============================================================================

describe("parseHistoryArgs", () => {
	it("parses serial as positional argument with default format", () => {
		const result = parseHistoryArgs(["ABC123"], { json: false });
		expect(result.serial).toBe("ABC123");
		expect(result.format).toBe("table");
		expect(result.limit).toBeUndefined();
		expect(result.output).toBeUndefined();
	});

	it("uses json format when global --json is active", () => {
		const result = parseHistoryArgs(["ABC123"], { json: true });
		expect(result.format).toBe("json");
	});

	it("explicit --format overrides global --json", () => {
		const result = parseHistoryArgs(["ABC123", "--format", "csv"], { json: true });
		expect(result.format).toBe("csv");
	});

	it("parses --limit flag", () => {
		const result = parseHistoryArgs(["ABC123", "--limit", "10"], { json: false });
		expect(result.limit).toBe(10);
	});

	it("parses --output flag", () => {
		const result = parseHistoryArgs(["ABC123", "--output", "data.csv"], { json: false });
		expect(result.output).toBe("data.csv");
	});

	it("parses all flags combined", () => {
		const result = parseHistoryArgs(
			["SIG001", "--limit", "50", "--format", "csv", "--output", "out.csv"],
			{ json: false },
		);
		expect(result.serial).toBe("SIG001");
		expect(result.format).toBe("csv");
		expect(result.limit).toBe(50);
		expect(result.output).toBe("out.csv");
	});

	it("exits when serial is missing", () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
		expect(() => parseHistoryArgs([], { json: false })).toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
		exitSpy.mockRestore();
	});

	it("exits when serial looks like a flag", () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
		expect(() => parseHistoryArgs(["--format"], { json: false })).toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
		exitSpy.mockRestore();
	});

	it("exits on invalid --format value", () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
		expect(() => parseHistoryArgs(["X", "--format", "xml"], { json: false })).toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--format must be"));
		exitSpy.mockRestore();
	});

	it("exits on non-positive --limit", () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
		expect(() => parseHistoryArgs(["X", "--limit", "0"], { json: false })).toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--limit must be"));
		exitSpy.mockRestore();
	});

	it("exits on non-integer --limit", () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
		expect(() => parseHistoryArgs(["X", "--limit", "abc"], { json: false })).toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--limit must be"));
		exitSpy.mockRestore();
	});

	it("exits on missing --output value", () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
		expect(() => parseHistoryArgs(["X", "--output"], { json: false })).toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--output requires"));
		exitSpy.mockRestore();
	});

	it("exits on unknown option", () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
		expect(() => parseHistoryArgs(["X", "--verbose"], { json: false })).toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown option"));
		exitSpy.mockRestore();
	});
});

// =============================================================================
// formatTable
// =============================================================================

describe("formatTable", () => {
	it("produces aligned columns with header", () => {
		const readings = [
			makeReading({ value: 225, timestamp: "2026-01-15T12:00:00.000Z" }),
			makeReading({ value: 230, timestamp: "2026-01-15T12:01:00.000Z" }),
		];

		const table = formatTable(readings);
		const lines = table.split("\n");
		expect(lines[0]).toContain("Timestamp");
		expect(lines[0]).toContain("Value");
		expect(lines[0]).toContain("Units");
		expect(lines[1]).toContain("225");
		expect(lines[2]).toContain("230");
		expect(table.endsWith("\n")).toBe(true);
	});

	it("returns empty string for no readings", () => {
		expect(formatTable([])).toBe("");
	});

	it("pads columns to align values of different widths", () => {
		const readings = [
			makeReading({ value: 1, timestamp: "2026-01-15T12:00:00.000Z", units: "F" }),
			makeReading({ value: 1000, timestamp: "2026-01-15T12:01:00.000Z", units: "C" }),
		];

		const table = formatTable(readings);
		const lines = table.split("\n").filter((l) => l.length > 0);
		// All data lines should have the same length as the header
		const headerLen = lines[0]?.length ?? 0;
		for (const line of lines) {
			expect(line.length).toBe(headerLen);
		}
	});
});

// =============================================================================
// formatCsv
// =============================================================================

describe("formatCsv", () => {
	it("produces correct header and data lines", () => {
		const readings = [
			makeReading({ value: 225, timestamp: "2026-01-15T12:00:00.000Z" }),
			makeReading({ value: 145, timestamp: "2026-01-15T12:01:00.000Z", units: "C" }),
		];

		const csv = formatCsv(readings);
		const lines = csv.split("\n");
		expect(lines[0]).toBe("timestamp,value,units");
		expect(lines[1]).toBe("2026-01-15T12:00:00.000Z,225,F");
		expect(lines[2]).toBe("2026-01-15T12:01:00.000Z,145,C");
		expect(csv.endsWith("\n")).toBe(true);
	});

	it("produces only header for empty readings", () => {
		const csv = formatCsv([]);
		expect(csv).toBe("timestamp,value,units\n");
	});
});

// =============================================================================
// history (integration)
// =============================================================================

describe("history", () => {
	it("outputs table format by default", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue(
			makeHistory("SMOKE1", [
				makeReading({ value: 225, timestamp: "2026-01-15T12:00:00.000Z" }),
				makeReading({ value: 230, timestamp: "2026-01-15T12:01:00.000Z" }),
			]),
		);

		await history(["SMOKE1"], { json: false });

		expect(mockGetHistory).toHaveBeenCalledWith("SMOKE1");
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Timestamp");
		expect(written).toContain("225");
		expect(written).toContain("230");
	});

	it("outputs csv format with --format csv", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue(
			makeHistory("SIG001", [makeReading({ value: 200, timestamp: "2026-01-15T12:00:00.000Z" })]),
		);

		await history(["SIG001", "--format", "csv"], { json: false });

		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("timestamp,value,units");
		expect(written).toContain("200,F");
	});

	it("outputs json format with --format json", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue(
			makeHistory("DEV1", [makeReading({ value: 165, timestamp: "2026-01-15T12:00:00.000Z" })]),
		);

		await history(["DEV1", "--format", "json"], { json: false });

		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(written);
		expect(parsed.deviceId).toBe("DEV1");
		expect(parsed.readings).toHaveLength(1);
		expect(parsed.readings[0].value).toBe(165);
	});

	it("uses json format when global --json is active", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue(makeHistory("DEV1", [makeReading({ value: 72 })]));

		await history(["DEV1"], { json: true });

		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(written);
		expect(parsed.deviceId).toBe("DEV1");
	});

	it("limits to N most recent readings with --limit", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue(
			makeHistory("SIG001", [
				makeReading({ value: 100, timestamp: "2026-01-15T12:00:00.000Z" }),
				makeReading({ value: 200, timestamp: "2026-01-15T12:01:00.000Z" }),
				makeReading({ value: 300, timestamp: "2026-01-15T12:02:00.000Z" }),
				makeReading({ value: 400, timestamp: "2026-01-15T12:03:00.000Z" }),
			]),
		);

		await history(["SIG001", "--limit", "2", "--format", "json"], { json: false });

		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(written);
		expect(parsed.readings).toHaveLength(2);
		// Should be the 2 most recent (last 2)
		expect(parsed.readings[0].value).toBe(300);
		expect(parsed.readings[1].value).toBe(400);
	});

	it("writes to file with --output", async () => {
		mockWriteFile.mockResolvedValue(undefined);
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue(
			makeHistory("SIG001", [makeReading({ value: 225, timestamp: "2026-01-15T12:00:00.000Z" })]),
		);

		await history(["SIG001", "--format", "csv", "--output", "out.csv"], { json: false });

		expect(mockWriteFile).toHaveBeenCalledWith("out.csv", expect.any(String), "utf8");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Wrote 1 readings to out.csv"));
		expect(stdoutWriteSpy).not.toHaveBeenCalled();
	});

	it("prints empty-readings message for table format", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue(makeHistory("EMPTY1", []));

		await history(["EMPTY1"], { json: false });

		expect(logSpy).toHaveBeenCalledWith("No history available for EMPTY1.");
		expect(stdoutWriteSpy).not.toHaveBeenCalled();
	});

	it("outputs empty json for empty readings with json format", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockResolvedValue(makeHistory("EMPTY1", []));

		await history(["EMPTY1", "--format", "json"], { json: false });

		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(written);
		expect(parsed.deviceId).toBe("EMPTY1");
		expect(parsed.readings).toEqual([]);
	});

	it("errors when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		await expect(history(["X"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));

		exitSpy.mockRestore();
	});

	it("closes client even on error", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetHistory.mockRejectedValue(new Error("network fail"));

		await expect(history(["X"], { json: false })).rejects.toThrow("network fail");
		expect(mockClose).toHaveBeenCalled();
	});
});
