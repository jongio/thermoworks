import type { Archive, ArchiveChannel, TemperatureReading } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

const mockGetArchives = vi.fn();
const mockGetArchive = vi.fn();
const mockClose = vi.fn();
const mockWriteFile = vi.fn();

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();

	class MockThermoworksCloud {
		getArchives = mockGetArchives;
		getArchive = mockGetArchive;
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

import {
	type ExportRow,
	exportData,
	flattenArchive,
	formatCsv,
	formatInflux,
	formatJson,
	parseExportArgs,
} from "../src/commands/export.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

// --- Helpers ---

function makeReading(
	overrides: Partial<TemperatureReading> & { value: number },
): TemperatureReading {
	return {
		value: overrides.value,
		timestamp: overrides.timestamp ?? new Date("2026-01-15T12:00:00Z"),
		units: overrides.units ?? "F",
	};
}

function makeArchiveChannel(
	overrides: Partial<ArchiveChannel> & { recentReadings: TemperatureReading[] },
): ArchiveChannel {
	return {
		number: overrides.number ?? null,
		label: overrides.label ?? null,
		units: overrides.units ?? null,
		value: overrides.value ?? null,
		status: null,
		enabled: null,
		color: null,
		type: null,
		alarmHigh: null,
		alarmLow: null,
		minimum: null,
		maximum: null,
		recentReadings: overrides.recentReadings,
	};
}

function makeArchive(overrides: Partial<Archive> & { id: string }): Archive {
	return {
		id: overrides.id,
		start: overrides.start ?? null,
		end: overrides.end ?? null,
		count: overrides.count ?? null,
		type: overrides.type ?? null,
		label: overrides.label ?? null,
		deviceLabel: overrides.deviceLabel ?? null,
		notes: overrides.notes ?? null,
		createdOn: overrides.createdOn ?? null,
		public: overrides.public ?? null,
		publicLink: overrides.publicLink ?? null,
		filename: overrides.filename ?? null,
		channels: overrides.channels ?? null,
	};
}

// --- Test suites ---

let _logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	_logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

// =============================================================================
// parseExportArgs
// =============================================================================

describe("parseExportArgs", () => {
	it("parses serial as positional argument", () => {
		const result = parseExportArgs(["export", "ABC123"]);
		expect(result.serial).toBe("ABC123");
		expect(result.format).toBe("json");
		expect(result.archiveId).toBeUndefined();
		expect(result.output).toBeUndefined();
	});

	it("parses --archive flag", () => {
		const result = parseExportArgs(["export", "ABC123", "--archive", "arch-001"]);
		expect(result.archiveId).toBe("arch-001");
	});

	it("parses --format csv", () => {
		const result = parseExportArgs(["export", "ABC123", "--format", "csv"]);
		expect(result.format).toBe("csv");
	});

	it("parses --format json", () => {
		const result = parseExportArgs(["export", "ABC123", "--format", "json"]);
		expect(result.format).toBe("json");
	});

	it("parses --format influx", () => {
		const result = parseExportArgs(["export", "ABC123", "--format", "influx"]);
		expect(result.format).toBe("influx");
	});

	it("parses --output flag", () => {
		const result = parseExportArgs(["export", "ABC123", "--output", "readings.csv"]);
		expect(result.output).toBe("readings.csv");
	});

	it("parses all flags combined", () => {
		const result = parseExportArgs([
			"export",
			"DEV99",
			"--archive",
			"session-5",
			"--format",
			"csv",
			"--output",
			"out.csv",
		]);
		expect(result.serial).toBe("DEV99");
		expect(result.archiveId).toBe("session-5");
		expect(result.format).toBe("csv");
		expect(result.output).toBe("out.csv");
	});

	it("throws when serial is missing", () => {
		expect(() => parseExportArgs(["export"])).toThrow("Usage:");
	});

	it("throws when serial looks like a flag", () => {
		expect(() => parseExportArgs(["export", "--format"])).toThrow("Usage:");
	});

	it("throws on invalid --format value", () => {
		expect(() => parseExportArgs(["export", "X", "--format", "xml"])).toThrow("--format must be");
	});

	it("throws on missing --archive value", () => {
		expect(() => parseExportArgs(["export", "X", "--archive"])).toThrow("--archive requires");
	});

	it("throws on missing --output value", () => {
		expect(() => parseExportArgs(["export", "X", "--output"])).toThrow("--output requires");
	});

	it("throws on unknown option", () => {
		expect(() => parseExportArgs(["export", "X", "--verbose"])).toThrow("Unknown option");
	});
});

// =============================================================================
// flattenArchive
// =============================================================================

describe("flattenArchive", () => {
	it("flattens readings from multiple channels into rows", () => {
		const archive = makeArchive({
			id: "a1",
			channels: [
				makeArchiveChannel({
					label: "Pit",
					recentReadings: [
						makeReading({ value: 225, timestamp: new Date("2026-01-15T12:01:00Z") }),
						makeReading({ value: 230, timestamp: new Date("2026-01-15T12:02:00Z") }),
					],
				}),
				makeArchiveChannel({
					label: "Meat",
					recentReadings: [
						makeReading({ value: 145, timestamp: new Date("2026-01-15T12:01:00Z") }),
					],
				}),
			],
		});

		const rows = flattenArchive(archive);
		expect(rows).toHaveLength(3);
		expect(rows[0]).toEqual({
			timestamp: "2026-01-15T12:01:00.000Z",
			channel: "Pit",
			value: 225,
			units: "F",
		});
		expect(rows[1]).toEqual({
			timestamp: "2026-01-15T12:01:00.000Z",
			channel: "Meat",
			value: 145,
			units: "F",
		});
		expect(rows[2]).toEqual({
			timestamp: "2026-01-15T12:02:00.000Z",
			channel: "Pit",
			value: 230,
			units: "F",
		});
	});

	it("sorts rows by timestamp ascending", () => {
		const archive = makeArchive({
			id: "a2",
			channels: [
				makeArchiveChannel({
					label: "Probe",
					recentReadings: [
						makeReading({ value: 300, timestamp: new Date("2026-01-15T13:00:00Z") }),
						makeReading({ value: 100, timestamp: new Date("2026-01-15T11:00:00Z") }),
						makeReading({ value: 200, timestamp: new Date("2026-01-15T12:00:00Z") }),
					],
				}),
			],
		});

		const rows = flattenArchive(archive);
		expect(rows[0]?.value).toBe(100);
		expect(rows[1]?.value).toBe(200);
		expect(rows[2]?.value).toBe(300);
	});

	it("uses channel number when label is null", () => {
		const archive = makeArchive({
			id: "a3",
			channels: [
				makeArchiveChannel({
					label: null,
					number: "2",
					recentReadings: [makeReading({ value: 72 })],
				}),
			],
		});

		const rows = flattenArchive(archive);
		expect(rows[0]?.channel).toBe("2");
	});

	it("uses 'unknown' when both label and number are null", () => {
		const archive = makeArchive({
			id: "a4",
			channels: [
				makeArchiveChannel({
					label: null,
					number: null,
					recentReadings: [makeReading({ value: 72 })],
				}),
			],
		});

		const rows = flattenArchive(archive);
		expect(rows[0]?.channel).toBe("unknown");
	});

	it("handles archive with null channels", () => {
		const archive = makeArchive({ id: "a5", channels: null });
		const rows = flattenArchive(archive);
		expect(rows).toEqual([]);
	});

	it("handles channel with empty recentReadings", () => {
		const archive = makeArchive({
			id: "a6",
			channels: [makeArchiveChannel({ label: "Empty", recentReadings: [] })],
		});
		const rows = flattenArchive(archive);
		expect(rows).toEqual([]);
	});
});

// =============================================================================
// formatCsv
// =============================================================================

describe("formatCsv", () => {
	it("produces correct header and data lines", () => {
		const rows: ExportRow[] = [
			{ timestamp: "2026-01-15T12:00:00.000Z", channel: "Pit", value: 225, units: "F" },
			{ timestamp: "2026-01-15T12:01:00.000Z", channel: "Meat", value: 145, units: "F" },
		];

		const csv = formatCsv(rows);
		const lines = csv.split("\n");
		expect(lines[0]).toBe("timestamp,channel,value,units");
		expect(lines[1]).toBe("2026-01-15T12:00:00.000Z,Pit,225,F");
		expect(lines[2]).toBe("2026-01-15T12:01:00.000Z,Meat,145,F");
		expect(csv.endsWith("\n")).toBe(true);
	});

	it("escapes channel names with commas", () => {
		const rows: ExportRow[] = [
			{ timestamp: "2026-01-15T12:00:00.000Z", channel: "Pit, Left", value: 225, units: "F" },
		];

		const csv = formatCsv(rows);
		expect(csv).toContain('"Pit, Left"');
	});

	it("escapes channel names with quotes", () => {
		const rows: ExportRow[] = [
			{ timestamp: "2026-01-15T12:00:00.000Z", channel: 'Probe "A"', value: 225, units: "F" },
		];

		const csv = formatCsv(rows);
		expect(csv).toContain('"Probe ""A"""');
	});

	it("produces only header for empty rows", () => {
		const csv = formatCsv([]);
		expect(csv).toBe("timestamp,channel,value,units\n");
	});
});

// =============================================================================
// formatJson
// =============================================================================

describe("formatJson", () => {
	it("produces pretty-printed JSON array", () => {
		const rows: ExportRow[] = [
			{ timestamp: "2026-01-15T12:00:00.000Z", channel: "Pit", value: 225, units: "F" },
		];

		const json = formatJson(rows);
		const parsed = JSON.parse(json);
		expect(parsed).toEqual(rows);
		expect(json).toContain("  "); // indented
		expect(json.endsWith("\n")).toBe(true);
	});

	it("produces empty array for no rows", () => {
		const json = formatJson([]);
		expect(JSON.parse(json)).toEqual([]);
	});
});

// =============================================================================
// formatInflux
// =============================================================================

describe("formatInflux", () => {
	it("produces one line protocol record per reading", () => {
		const rows: ExportRow[] = [
			{ timestamp: "2026-01-15T12:00:00.000Z", channel: "Pit", value: 225, units: "F" },
			{ timestamp: "2026-01-15T12:01:00.000Z", channel: "Meat", value: 145.5, units: "F" },
		];

		const out = formatInflux(rows, "ABC123");
		const lines = out.trimEnd().split("\n");
		expect(lines).toHaveLength(2);
		expect(lines[0]).toBe(
			"thermoworks_temperature,serial=ABC123,channel=Pit,units=F value=225 1768478400000000000",
		);
		expect(lines[1]).toBe(
			"thermoworks_temperature,serial=ABC123,channel=Meat,units=F value=145.5 1768478460000000000",
		);
		expect(out.endsWith("\n")).toBe(true);
	});

	it("computes the timestamp in nanoseconds since the epoch", () => {
		const rows: ExportRow[] = [
			{ timestamp: "2026-01-15T12:00:00.000Z", channel: "Pit", value: 225, units: "F" },
		];
		const ns = BigInt(Date.parse("2026-01-15T12:00:00.000Z")) * 1_000_000n;
		expect(formatInflux(rows, "S1").trimEnd().endsWith(` ${ns}`)).toBe(true);
	});

	it("escapes spaces, commas, and equals signs in tag values", () => {
		const rows: ExportRow[] = [
			{ timestamp: "2026-01-15T12:00:00.000Z", channel: "Pit, Left=Front", value: 225, units: "F" },
		];
		const out = formatInflux(rows, "SN 1");
		expect(out).toContain("serial=SN\\ 1");
		expect(out).toContain("channel=Pit\\,\\ Left\\=Front");
	});

	it("skips readings with an unparseable timestamp", () => {
		const rows: ExportRow[] = [
			{ timestamp: "not-a-date", channel: "Pit", value: 225, units: "F" },
			{ timestamp: "2026-01-15T12:00:00.000Z", channel: "Meat", value: 145, units: "F" },
		];
		const out = formatInflux(rows, "S1");
		expect(out.trimEnd().split("\n")).toHaveLength(1);
		expect(out).toContain("channel=Meat");
	});

	it("returns an empty string for no rows", () => {
		expect(formatInflux([], "S1")).toBe("");
	});
});

// =============================================================================
// exportData (integration)
// =============================================================================

describe("exportData", () => {
	it("exports latest archive as JSON to stdout", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([
			makeArchive({
				id: "latest",
				channels: [
					makeArchiveChannel({
						label: "Pit",
						recentReadings: [makeReading({ value: 225 })],
					}),
				],
			}),
		]);

		await exportData(["export", "SMOKE1"]);

		expect(mockGetArchives).toHaveBeenCalledWith("SMOKE1", { limit: 1 });
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		const parsed = JSON.parse(written);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].channel).toBe("Pit");
		expect(parsed[0].value).toBe(225);
	});

	it("exports specific archive when --archive is provided", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchive.mockResolvedValue(
			makeArchive({
				id: "session-5",
				channels: [
					makeArchiveChannel({
						label: "Meat",
						recentReadings: [makeReading({ value: 165, units: "F" })],
					}),
				],
			}),
		);

		await exportData(["export", "DEV1", "--archive", "session-5"]);

		expect(mockGetArchive).toHaveBeenCalledWith("DEV1", "session-5");
		expect(mockGetArchives).not.toHaveBeenCalled();
	});

	it("exports as CSV when --format csv", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([
			makeArchive({
				id: "a1",
				channels: [
					makeArchiveChannel({
						label: "Probe",
						recentReadings: [makeReading({ value: 200 })],
					}),
				],
			}),
		]);

		await exportData(["export", "X", "--format", "csv"]);

		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("timestamp,channel,value,units");
		expect(written).toContain("Probe,200,F");
	});

	it("writes to file when --output is specified", async () => {
		mockWriteFile.mockResolvedValue(undefined);
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([
			makeArchive({
				id: "a1",
				channels: [
					makeArchiveChannel({
						label: "Pit",
						recentReadings: [makeReading({ value: 225 })],
					}),
				],
			}),
		]);

		await exportData(["export", "X", "--output", "out.json"]);

		expect(mockWriteFile).toHaveBeenCalledWith("out.json", expect.any(String), "utf8");
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Exported 1 readings to out.json"),
		);
		// Should NOT write to stdout when output is file
		expect(stdoutWriteSpy).not.toHaveBeenCalled();
	});

	it("errors when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		await expect(exportData(["export", "X"])).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));

		exitSpy.mockRestore();
	});

	it("errors when no archives found for device", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([]);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		await expect(exportData(["export", "NOSUCH"])).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No archives found"));

		exitSpy.mockRestore();
	});

	it("closes client even on error", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockRejectedValue(new Error("network fail"));

		await expect(exportData(["export", "X"])).rejects.toThrow("network fail");
		expect(mockClose).toHaveBeenCalled();
	});
});
