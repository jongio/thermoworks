import type { Archive, ArchiveChannel, MinMaxReading } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetArchives = vi.fn();
	const mockGetArchive = vi.fn();
	const mockClose = vi.fn();

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

import { ThermoworksCloud } from "thermoworks-sdk";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetArchives = vi.mocked(mockClient.getArchives);
const mockGetArchive = vi.mocked(mockClient.getArchive);

// --- Helpers ---

function makeMinMax(value: number | null, units: string | null = "F"): MinMaxReading {
	return { value, units, date: value != null ? new Date("2026-01-15T12:00:00Z") : null };
}

function makeChannel(overrides: Partial<ArchiveChannel> = {}): ArchiveChannel {
	return {
		number: overrides.number ?? "1",
		label: overrides.label ?? null,
		units: overrides.units ?? "F",
		value: overrides.value ?? null,
		status: overrides.status ?? null,
		enabled: overrides.enabled ?? true,
		color: overrides.color ?? null,
		type: overrides.type ?? null,
		alarmHigh: overrides.alarmHigh ?? null,
		alarmLow: overrides.alarmLow ?? null,
		minimum: overrides.minimum ?? null,
		maximum: overrides.maximum ?? null,
		recentReadings: overrides.recentReadings ?? [],
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
// parseArchivesArgs
// =============================================================================

describe("parseArchivesArgs", () => {
	it("parses serial from positional args", async () => {
		const { parseArchivesArgs } = await import("../src/commands/archives.js");
		const result = parseArchivesArgs(["archives", "ABC123"]);
		expect(result).toEqual({ serial: "ABC123", id: undefined, limit: undefined });
	});

	it("parses --id flag", async () => {
		const { parseArchivesArgs } = await import("../src/commands/archives.js");
		const result = parseArchivesArgs(["archives", "ABC123", "--id", "archive-42"]);
		expect(result).toEqual({ serial: "ABC123", id: "archive-42", limit: undefined });
	});

	it("parses --limit flag", async () => {
		const { parseArchivesArgs } = await import("../src/commands/archives.js");
		const result = parseArchivesArgs(["archives", "ABC123", "--limit", "5"]);
		expect(result).toEqual({ serial: "ABC123", id: undefined, limit: 5 });
	});

	it("parses both --id and --limit", async () => {
		const { parseArchivesArgs } = await import("../src/commands/archives.js");
		const result = parseArchivesArgs(["archives", "XYZ", "--id", "a1", "--limit", "10"]);
		expect(result).toEqual({ serial: "XYZ", id: "a1", limit: 10 });
	});

	it("returns null when serial is missing", async () => {
		const { parseArchivesArgs } = await import("../src/commands/archives.js");
		const result = parseArchivesArgs(["archives"]);
		expect(result).toBeNull();
	});

	it("ignores unknown flags", async () => {
		const { parseArchivesArgs } = await import("../src/commands/archives.js");
		const result = parseArchivesArgs(["archives", "S1", "--verbose"]);
		expect(result).toEqual({ serial: "S1", id: undefined, limit: undefined });
	});
});

// =============================================================================
// archives - list mode
// =============================================================================

describe("archives (list mode)", () => {
	it("lists archives with label, start, duration, and count", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([
			makeArchive({
				id: "arc-1",
				label: "Weekend Brisket",
				start: new Date("2026-01-15T08:00:00Z"),
				end: new Date("2026-01-15T20:00:00Z"),
				count: 720,
			}),
		]);

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "ABC123" });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Found 1 archive");
		expect(output).toContain("Weekend Brisket");
		expect(output).toContain("12h 0m");
		expect(output).toContain("720");
		expect(output).toContain("arc-1");
	});

	it("shows 'No archives found.' when empty", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([]);

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "ABC123" });

		expect(logSpy).toHaveBeenCalledWith("No archives found.");
	});

	it("shows plural 'archives' for multiple results", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([
			makeArchive({ id: "a1", label: "Cook 1" }),
			makeArchive({ id: "a2", label: "Cook 2" }),
		]);

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "S1" });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Found 2 archives");
	});

	it("falls back to ID when label is null", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([makeArchive({ id: "fallback-id", label: null })]);

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "S1" });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("fallback-id");
	});

	it("shows '-' for duration when start or end is null", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([makeArchive({ id: "a1", start: null, end: null })]);

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "S1" });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Duration: -");
	});

	it("passes limit to getArchives when specified", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([]);

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "S1", limit: 5 });

		expect(mockGetArchives).toHaveBeenCalledWith("S1", { limit: 5 });
	});

	it("calls getArchives without options when limit is not specified", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([]);

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "S1" });

		expect(mockGetArchives).toHaveBeenCalledWith("S1", undefined);
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { archives } = await import("../src/commands/archives.js");
		await expect(archives({ serial: "S1" })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});
});

// =============================================================================
// archives - detail mode (--id)
// =============================================================================

describe("archives (detail mode)", () => {
	it("shows archive details with per-channel min/max/last", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchive.mockResolvedValue(
			makeArchive({
				id: "arc-99",
				label: "Sunday Ribs",
				start: new Date("2026-01-15T10:00:00Z"),
				end: new Date("2026-01-15T16:30:00Z"),
				count: 390,
				notes: "Fell asleep halfway through",
				channels: [
					makeChannel({
						number: "1",
						label: "Pit",
						units: "F",
						value: 225,
						minimum: makeMinMax(210),
						maximum: makeMinMax(250),
					}),
					makeChannel({
						number: "2",
						label: "Meat",
						units: "F",
						value: 195,
						minimum: makeMinMax(40),
						maximum: makeMinMax(195),
					}),
				],
			}),
		);

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "ABC123", id: "arc-99" });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Archive: Sunday Ribs");
		expect(output).toContain("arc-99");
		expect(output).toContain("6h 30m");
		expect(output).toContain("390");
		expect(output).toContain("Fell asleep halfway through");
		expect(output).toContain("Pit: min=210\u00B0F max=250\u00B0F last=225\u00B0F");
		expect(output).toContain("Meat: min=40\u00B0F max=195\u00B0F last=195\u00B0F");
	});

	it("shows '-' for missing min/max/last values", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchive.mockResolvedValue(
			makeArchive({
				id: "arc-empty",
				channels: [
					makeChannel({
						number: "1",
						label: "Probe",
						value: null,
						minimum: null,
						maximum: null,
					}),
				],
			}),
		);

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "S1", id: "arc-empty" });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Probe: min=- max=- last=-");
	});

	it("uses channel number as fallback label", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchive.mockResolvedValue(
			makeArchive({
				id: "arc-x",
				channels: [makeChannel({ number: "3", label: null, value: 100, units: "C" })],
			}),
		);

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "S1", id: "arc-x" });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Ch 3:");
	});

	it("does not show channels section when channels is null", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchive.mockResolvedValue(makeArchive({ id: "arc-no-ch", channels: null }));

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "S1", id: "arc-no-ch" });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).not.toContain("Channels:");
	});

	it("does not show notes when notes is null", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchive.mockResolvedValue(makeArchive({ id: "arc-no-notes", notes: null }));

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "S1", id: "arc-no-notes" });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).not.toContain("Notes:");
	});
});

// =============================================================================
// archives --json
// =============================================================================

describe("archives --json", () => {
	it("outputs archive list as JSON array in list mode", async () => {
		const archiveData = [
			makeArchive({
				id: "arc-1",
				label: "Brisket",
				start: new Date("2026-01-15T08:00:00Z"),
				count: 100,
			}),
		];
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue(archiveData);

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "S1" }, { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toBeInstanceOf(Array);
		expect(output).toHaveLength(1);
		expect(output[0].id).toBe("arc-1");
		expect(output[0].label).toBe("Brisket");
	});

	it("outputs single archive as JSON object in detail mode", async () => {
		const archiveData = makeArchive({
			id: "arc-42",
			label: "Pulled Pork",
			count: 500,
			channels: [makeChannel({ label: "Pit", value: 225 })],
		});
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchive.mockResolvedValue(archiveData);

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "S1", id: "arc-42" }, { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.id).toBe("arc-42");
		expect(output.label).toBe("Pulled Pork");
		expect(output.channels).toHaveLength(1);
		expect(output.channels[0].label).toBe("Pit");
	});

	it("outputs valid JSON with no ANSI codes", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([makeArchive({ id: "x" })]);

		const { archives } = await import("../src/commands/archives.js");
		await archives({ serial: "S1" }, { json: true });

		const raw = logSpy.mock.calls[0][0] as string;
		expect(raw).not.toContain("\u001b[");
		expect(() => JSON.parse(raw)).not.toThrow();
	});
});
