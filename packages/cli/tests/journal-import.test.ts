import type { Archive } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetArchives = vi.fn();
const mockClose = vi.fn();

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	class MockThermoworksCloud {
		getArchives = mockGetArchives;
		close = mockClose;
	}
	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

vi.mock("../src/preferences.js", () => ({
	loadPreferences: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	mkdir: vi.fn(),
}));

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { buildImportEntry, journalImport, parseImportArgs } from "../src/commands/journal.js";
import { getCredentials } from "../src/credentials.js";
import { loadPreferences } from "../src/preferences.js";

const mockGetCredentials = vi.mocked(getCredentials);
const mockLoadPreferences = vi.mocked(loadPreferences);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

function makeArchive(overrides: Partial<Archive> = {}): Archive {
	return {
		id: "arch1",
		start: new Date("2026-01-10T15:00:00.000Z"),
		end: new Date("2026-01-10T21:00:00.000Z"),
		count: 100,
		type: "session",
		label: null,
		deviceLabel: "My Smoke",
		notes: null,
		createdOn: new Date("2026-01-10T14:00:00.000Z"),
		public: false,
		publicLink: null,
		filename: null,
		channels: null,
		...overrides,
	};
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	mockMkdir.mockResolvedValue(undefined as never);
	mockWriteFile.mockResolvedValue(undefined as never);
	mockReadFile.mockRejectedValue(new Error("ENOENT"));
	mockLoadPreferences.mockResolvedValue({} as never);
	mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" } as never);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe("parseImportArgs", () => {
	it("defaults limit to 20 and dry-run to false", () => {
		expect(parseImportArgs([])).toEqual({ serial: undefined, limit: 20, dryRun: false });
	});

	it("reads a positional serial", () => {
		expect(parseImportArgs(["SMOKE1"])).toEqual({ serial: "SMOKE1", limit: 20, dryRun: false });
	});

	it("parses --limit and --dry-run", () => {
		expect(parseImportArgs(["SMOKE1", "--limit", "5", "--dry-run"])).toEqual({
			serial: "SMOKE1",
			limit: 5,
			dryRun: true,
		});
	});

	it("rejects a non-positive limit", () => {
		expect(parseImportArgs(["--limit", "0"])).toEqual({
			error: '--limit must be a positive integer, got "0"',
		});
	});

	it("rejects unknown options", () => {
		expect(parseImportArgs(["--nope"])).toEqual({ error: "Unknown option: --nope" });
	});

	it("rejects a second positional argument", () => {
		expect(parseImportArgs(["a", "b"])).toEqual({ error: "Unexpected argument: b" });
	});
});

describe("buildImportEntry", () => {
	it("uses the archive label as the title when present", () => {
		const entry = buildImportEntry(makeArchive({ label: "Sunday brisket" }), "SMOKE1");
		expect(entry.title).toBe("Sunday brisket");
		expect(entry.device).toBe("SMOKE1");
		expect(entry.archive).toBe("arch1");
	});

	it("falls back to a dated title and carries the cook date", () => {
		const start = new Date("2026-01-10T15:00:00.000Z");
		const entry = buildImportEntry(makeArchive({ label: null, start }), "SMOKE1");
		expect(entry.title.startsWith("Cook on ")).toBe(true);
		expect(entry.createdAt).toBe(start.toISOString());
	});

	it("includes notes when present", () => {
		const entry = buildImportEntry(makeArchive({ notes: "  low and slow  " }), "SMOKE1");
		expect(entry.notes).toBe("low and slow");
	});

	it("uses a stable title when there is no label or date", () => {
		const entry = buildImportEntry(
			makeArchive({ label: null, start: null, createdOn: null }),
			"S1",
		);
		expect(entry.title).toBe("Cook arch1");
		expect(entry.createdAt).toBeUndefined();
	});
});

describe("journalImport", () => {
	it("imports new archives and skips ones already in the journal", async () => {
		mockReadFile.mockResolvedValue(
			JSON.stringify([
				{ id: "e1", createdAt: "2026-01-01T00:00:00.000Z", title: "Old", archive: "arch1" },
			]) as never,
		);
		mockGetArchives.mockResolvedValue([
			makeArchive({ id: "arch1", label: "Already imported" }),
			makeArchive({ id: "arch2", label: "New cook" }),
		]);

		await journalImport(["SMOKE1"], { json: false });

		expect(mockGetArchives).toHaveBeenCalledWith("SMOKE1", { limit: 20 });
		expect(mockClose).toHaveBeenCalled();
		expect(mockWriteFile).toHaveBeenCalledTimes(1);
		const written = JSON.parse((mockWriteFile.mock.calls[0]?.[1] as string) ?? "[]");
		const archives = written.map((e: { archive?: string }) => e.archive);
		expect(archives).toContain("arch2");
		expect(logSpy).toHaveBeenCalledWith(
			"Imported 1 cook(s) from SMOKE1. Skipped 1 already in the journal.",
		);
	});

	it("does not write anything in dry-run mode", async () => {
		mockGetArchives.mockResolvedValue([makeArchive({ id: "arch2", label: "New cook" })]);
		await journalImport(["SMOKE1", "--dry-run"], { json: false });
		expect(mockWriteFile).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith("Would import 1 cook(s) from SMOKE1:");
	});

	it("falls back to the configured default device", async () => {
		mockLoadPreferences.mockResolvedValue({ device: "DEFAULTSN" } as never);
		mockGetArchives.mockResolvedValue([]);
		await journalImport([], { json: false });
		expect(mockGetArchives).toHaveBeenCalledWith("DEFAULTSN", { limit: 20 });
	});

	it("errors when no device is given and none is configured", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
		await expect(journalImport([], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalled();
		expect(mockGetArchives).not.toHaveBeenCalled();
		exitSpy.mockRestore();
	});

	it("emits JSON of the added entries when --json is set", async () => {
		mockGetArchives.mockResolvedValue([makeArchive({ id: "arch9", label: "JSON cook" })]);
		await journalImport(["SMOKE1"], { json: true });
		const out = logSpy.mock.calls.map((c) => String(c[0])).join("\n");
		const parsed = JSON.parse(out);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].archive).toBe("arch9");
	});
});
