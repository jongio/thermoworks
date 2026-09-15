import type { Archive, ArchiveChannel, Device, TemperatureReading } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

const mockGetDevices = vi.fn();
const mockGetArchives = vi.fn();
const mockGetArchive = vi.fn();
const mockClose = vi.fn();
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();

	class MockThermoworksCloud {
		getDevices = mockGetDevices;
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
	mkdir: (...args: unknown[]) => mockMkdir(...args),
}));

import { backup, parseBackupArgs } from "../src/commands/backup.js";
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

function makeDevice(serial: string): Device {
	return { serial } as Device;
}

// --- Spies ---

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	mockMkdir.mockResolvedValue(undefined);
	mockWriteFile.mockResolvedValue(undefined);
	mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

// =============================================================================
// parseBackupArgs
// =============================================================================

describe("parseBackupArgs", () => {
	it("defaults to no serial, json format, default dir and limit", () => {
		const result = parseBackupArgs(["backup"]);
		expect(result.serial).toBeUndefined();
		expect(result.output).toBe("thermoworks-backup");
		expect(result.format).toBe("json");
		expect(result.limit).toBe(20);
		expect(result.manifest).toBe(false);
	});

	it("parses a positional serial", () => {
		const result = parseBackupArgs(["backup", "ABC123"]);
		expect(result.serial).toBe("ABC123");
	});

	it("parses --output and -o", () => {
		expect(parseBackupArgs(["backup", "--output", "dir1"]).output).toBe("dir1");
		expect(parseBackupArgs(["backup", "-o", "dir2"]).output).toBe("dir2");
	});

	it("parses --format csv", () => {
		expect(parseBackupArgs(["backup", "--format", "csv"]).format).toBe("csv");
	});

	it("parses --limit", () => {
		expect(parseBackupArgs(["backup", "--limit", "5"]).limit).toBe(5);
	});

	it("parses --manifest", () => {
		expect(parseBackupArgs(["backup", "--manifest"]).manifest).toBe(true);
	});

	it("parses serial combined with flags", () => {
		const result = parseBackupArgs([
			"backup",
			"DEV9",
			"--output",
			"out",
			"--format",
			"csv",
			"--limit",
			"3",
		]);
		expect(result.serial).toBe("DEV9");
		expect(result.output).toBe("out");
		expect(result.format).toBe("csv");
		expect(result.limit).toBe(3);
	});

	it("throws on invalid --format value", () => {
		expect(() => parseBackupArgs(["backup", "--format", "xml"])).toThrow("--format must be");
	});

	it("throws on non-positive --limit", () => {
		expect(() => parseBackupArgs(["backup", "--limit", "0"])).toThrow("--limit must be");
		expect(() => parseBackupArgs(["backup", "--limit", "abc"])).toThrow("--limit must be");
	});

	it("throws on missing --output value", () => {
		expect(() => parseBackupArgs(["backup", "--output"])).toThrow("--output requires");
	});

	it("throws on unknown option", () => {
		expect(() => parseBackupArgs(["backup", "--verbose"])).toThrow("Unknown option");
	});

	it("throws on a second positional argument", () => {
		expect(() => parseBackupArgs(["backup", "A", "B"])).toThrow("Unexpected argument");
	});
});

// =============================================================================
// backup (integration)
// =============================================================================

describe("backup", () => {
	it("backs up all devices when no serial is given", async () => {
		mockGetDevices.mockResolvedValue([makeDevice("DEV1"), makeDevice("DEV2")]);
		mockGetArchives.mockImplementation(async (serial: string) => [
			makeArchive({
				id: `${serial}-a1`,
				label: "Cook",
				channels: [
					makeArchiveChannel({ label: "Pit", recentReadings: [makeReading({ value: 225 })] }),
				],
			}),
		]);

		await backup(["backup"], { json: false });

		expect(mockGetDevices).toHaveBeenCalled();
		expect(mockMkdir).toHaveBeenCalledWith("thermoworks-backup", { recursive: true });
		expect(mockWriteFile).toHaveBeenCalledTimes(2);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Backed up 2 archive(s)"));
	});

	it("backs up only the given device", async () => {
		mockGetArchives.mockResolvedValue([
			makeArchive({
				id: "arch-001",
				channels: [
					makeArchiveChannel({ label: "Pit", recentReadings: [makeReading({ value: 200 })] }),
				],
			}),
		]);

		await backup(["backup", "SMOKE1", "--limit", "5"], { json: false });

		expect(mockGetDevices).not.toHaveBeenCalled();
		expect(mockGetArchives).toHaveBeenCalledWith("SMOKE1", { limit: 5 });
		expect(mockWriteFile).toHaveBeenCalledTimes(1);
	});

	it("writes CSV files when --format csv", async () => {
		mockGetArchives.mockResolvedValue([
			makeArchive({
				id: "a1",
				channels: [
					makeArchiveChannel({ label: "Probe", recentReadings: [makeReading({ value: 150 })] }),
				],
			}),
		]);

		await backup(["backup", "X", "--format", "csv", "--output", "cooks"], { json: false });

		const [path, content] = mockWriteFile.mock.calls[0] as [string, string, string];
		expect(path).toContain("cooks");
		expect(path.endsWith(".csv")).toBe(true);
		expect(content).toContain("timestamp,channel,value,units");
	});

	it("falls back to getArchive when a listed archive has no channels", async () => {
		mockGetArchives.mockResolvedValue([makeArchive({ id: "empty", channels: null })]);
		mockGetArchive.mockResolvedValue(
			makeArchive({
				id: "empty",
				channels: [
					makeArchiveChannel({ label: "Pit", recentReadings: [makeReading({ value: 99 })] }),
				],
			}),
		);

		await backup(["backup", "X"], { json: false });

		expect(mockGetArchive).toHaveBeenCalledWith("X", "empty");
		expect(mockWriteFile).toHaveBeenCalledTimes(1);
	});

	it("writes a manifest file when --manifest is set", async () => {
		mockGetArchives.mockResolvedValue([
			makeArchive({
				id: "a1",
				label: "Brisket",
				channels: [
					makeArchiveChannel({ label: "Pit", recentReadings: [makeReading({ value: 225 })] }),
				],
			}),
		]);

		await backup(["backup", "X", "--output", "cooks", "--manifest"], { json: false });

		expect(mockWriteFile).toHaveBeenCalledTimes(2);
		const [manifestPath, manifestContent] = mockWriteFile.mock.calls[1] as [string, string, string];
		expect(manifestPath).toContain("manifest.json");
		const manifest = JSON.parse(manifestContent);
		expect(manifest.format).toBe("json");
		expect(manifest.entries[0]).toMatchObject({
			serial: "X",
			archiveId: "a1",
			label: "Brisket",
			format: "json",
			readings: 1,
		});
	});

	it("includes the manifest path in JSON output when --manifest is set", async () => {
		mockGetArchives.mockResolvedValue([
			makeArchive({
				id: "arch-001",
				channels: [
					makeArchiveChannel({ label: "Pit", recentReadings: [makeReading({ value: 225 })] }),
				],
			}),
		]);

		await backup(["backup", "ABC123", "--output", "cooks", "--manifest"], { json: true });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const parsed = JSON.parse(output);
		expect(parsed.manifest).toContain("manifest.json");
		expect(parsed.entries).toHaveLength(1);
	});

	it("prints a JSON manifest with --json", async () => {
		mockGetArchives.mockResolvedValue([
			makeArchive({
				id: "arch-001",
				label: "Brisket",
				channels: [
					makeArchiveChannel({ label: "Pit", recentReadings: [makeReading({ value: 225 })] }),
				],
			}),
		]);

		await backup(["backup", "ABC123"], { json: true });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const parsed = JSON.parse(output);
		expect(parsed).toHaveLength(1);
		expect(parsed[0]).toMatchObject({
			serial: "ABC123",
			archiveId: "arch-001",
			label: "Brisket",
			readings: 1,
		});
	});

	it("reports when there are no archives to back up", async () => {
		mockGetArchives.mockResolvedValue([]);

		await backup(["backup", "X"], { json: false });

		expect(mockWriteFile).not.toHaveBeenCalled();
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No archives found"));
	});

	it("prints an empty array with --json when nothing is backed up", async () => {
		mockGetDevices.mockResolvedValue([]);

		await backup(["backup"], { json: true });

		expect(logSpy).toHaveBeenCalledWith("[]");
	});

	it("errors when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		await expect(backup(["backup", "X"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));

		exitSpy.mockRestore();
	});

	it("closes the client even on error", async () => {
		mockGetArchives.mockRejectedValue(new Error("network fail"));

		await expect(backup(["backup", "X"], { json: false })).rejects.toThrow("network fail");
		expect(mockClose).toHaveBeenCalled();
	});
});
