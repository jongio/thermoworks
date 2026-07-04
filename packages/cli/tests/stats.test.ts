import type { Archive } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetArchives = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getArchives = mockGetArchives;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

import { ThermoworksCloud } from "thermoworks-sdk";
import {
	computeStats,
	formatDurationMs,
	formatStats,
	parseStatsArgs,
	stats,
	toJsonStats,
} from "../src/commands/stats.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);
const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetArchives = vi.mocked(mockClient.getArchives);

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

/** Build an archive that ran for `hours` starting at `startIso`. */
function cook(id: string, startIso: string, hours: number, count = 100, label?: string): Archive {
	const start = new Date(startIso);
	const end = new Date(start.getTime() + hours * 3600_000);
	return makeArchive({ id, start, end, count, label: label ?? null });
}

// =============================================================================
// parseStatsArgs
// =============================================================================

describe("parseStatsArgs", () => {
	it("returns null when serial is missing", () => {
		expect(parseStatsArgs(["stats"])).toBeNull();
	});

	it("parses the serial", () => {
		expect(parseStatsArgs(["stats", "ABC123"])).toEqual({ serial: "ABC123", limit: undefined });
	});

	it("parses --limit", () => {
		expect(parseStatsArgs(["stats", "ABC123", "--limit", "25"])).toEqual({
			serial: "ABC123",
			limit: 25,
		});
	});
});

// =============================================================================
// formatDurationMs
// =============================================================================

describe("formatDurationMs", () => {
	it("returns '-' for null", () => {
		expect(formatDurationMs(null)).toBe("-");
	});

	it("formats minutes only under an hour", () => {
		expect(formatDurationMs(45 * 60_000)).toBe("45m");
	});

	it("formats hours and minutes", () => {
		expect(formatDurationMs(3 * 3600_000 + 30 * 60_000)).toBe("3h 30m");
	});
});

// =============================================================================
// computeStats
// =============================================================================

describe("computeStats", () => {
	it("returns zeroed stats for no archives", () => {
		const s = computeStats([]);
		expect(s.totalArchives).toBe(0);
		expect(s.sessionsWithDuration).toBe(0);
		expect(s.averageDurationMs).toBeNull();
		expect(s.medianDurationMs).toBeNull();
		expect(s.longest).toBeNull();
		expect(s.shortest).toBeNull();
		expect(s.earliestStart).toBeNull();
		expect(s.latestEnd).toBeNull();
	});

	it("aggregates duration, total, average, and median", () => {
		const archives = [
			cook("a", "2026-01-01T00:00:00Z", 2, 120, "Brisket"),
			cook("b", "2026-01-02T00:00:00Z", 4, 240, "Pork"),
			cook("c", "2026-01-03T00:00:00Z", 6, 360, "Ribs"),
		];
		const s = computeStats(archives);
		expect(s.totalArchives).toBe(3);
		expect(s.sessionsWithDuration).toBe(3);
		expect(s.totalDurationMs).toBe(12 * 3600_000);
		expect(s.averageDurationMs).toBe(4 * 3600_000);
		expect(s.medianDurationMs).toBe(4 * 3600_000);
		expect(s.totalReadings).toBe(720);
		expect(s.longest?.label).toBe("Ribs");
		expect(s.shortest?.label).toBe("Brisket");
	});

	it("averages the two middle durations for an even count", () => {
		const archives = [
			cook("a", "2026-01-01T00:00:00Z", 2),
			cook("b", "2026-01-02T00:00:00Z", 4),
			cook("c", "2026-01-03T00:00:00Z", 6),
			cook("d", "2026-01-04T00:00:00Z", 8),
		];
		const s = computeStats(archives);
		expect(s.medianDurationMs).toBe(5 * 3600_000);
	});

	it("tracks the earliest start and latest end across sessions", () => {
		const archives = [
			cook("b", "2026-01-05T00:00:00Z", 3),
			cook("a", "2026-01-01T00:00:00Z", 2),
			cook("c", "2026-01-10T00:00:00Z", 1),
		];
		const s = computeStats(archives);
		expect(s.earliestStart?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
		expect(s.latestEnd?.toISOString()).toBe("2026-01-10T01:00:00.000Z");
	});

	it("counts archives missing times but excludes them from durations", () => {
		const archives = [
			cook("a", "2026-01-01T00:00:00Z", 2, 100),
			makeArchive({ id: "b", start: null, end: null, count: 50 }),
		];
		const s = computeStats(archives);
		expect(s.totalArchives).toBe(2);
		expect(s.sessionsWithDuration).toBe(1);
		expect(s.totalReadings).toBe(150);
	});

	it("ignores archives with a negative duration", () => {
		const bad = makeArchive({
			id: "bad",
			start: new Date("2026-01-02T00:00:00Z"),
			end: new Date("2026-01-01T00:00:00Z"),
		});
		const s = computeStats([bad]);
		expect(s.sessionsWithDuration).toBe(0);
	});
});

// =============================================================================
// formatStats
// =============================================================================

describe("formatStats", () => {
	it("notes when there are no timed sessions", () => {
		const s = computeStats([makeArchive({ id: "a", count: 10 })]);
		const text = formatStats("ABC123", s);
		expect(text).toContain("Cook statistics for ABC123");
		expect(text).toContain("Archived sessions:   1");
		expect(text).toContain("No sessions with a recorded start and end");
	});

	it("renders duration figures when sessions exist", () => {
		const s = computeStats([
			cook("a", "2026-01-01T00:00:00Z", 2, 120, "Brisket"),
			cook("b", "2026-01-02T00:00:00Z", 6, 360, "Ribs"),
		]);
		const text = formatStats("ABC123", s);
		expect(text).toContain("Total cook time:     8h 0m");
		expect(text).toContain("Average cook time:   4h 0m");
		expect(text).toContain("Longest cook:        6h 0m  (Ribs)");
		expect(text).toContain("Shortest cook:       2h 0m  (Brisket)");
	});
});

// =============================================================================
// toJsonStats
// =============================================================================

describe("toJsonStats", () => {
	it("produces machine-readable seconds and ISO dates", () => {
		const s = computeStats([cook("a", "2026-01-01T00:00:00Z", 2, 120, "Brisket")]);
		const json = toJsonStats("ABC123", s);
		expect(json).toMatchObject({
			serial: "ABC123",
			totalArchives: 1,
			sessionsWithDuration: 1,
			totalDurationSeconds: 7200,
			averageDurationSeconds: 7200,
			medianDurationSeconds: 7200,
			totalReadings: 120,
			earliestStart: "2026-01-01T00:00:00.000Z",
			latestEnd: "2026-01-01T02:00:00.000Z",
		});
		expect(json.longest).toMatchObject({ label: "Brisket", durationSeconds: 7200 });
	});

	it("emits nulls when there are no timed sessions", () => {
		const json = toJsonStats("ABC123", computeStats([]));
		expect(json.longest).toBeNull();
		expect(json.shortest).toBeNull();
		expect(json.averageDurationSeconds).toBeNull();
		expect(json.earliestStart).toBeNull();
	});
});

// =============================================================================
// stats (command)
// =============================================================================

describe("stats command", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		mockGetCredentials.mockResolvedValue({ email: "pit@example.com", password: "secret" });
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("prints human-readable stats", async () => {
		mockGetArchives.mockResolvedValue([cook("a", "2026-01-01T00:00:00Z", 3, 180, "Brisket")]);
		await stats({ serial: "ABC123" }, { json: false });
		expect(mockGetArchives).toHaveBeenCalledWith("ABC123", undefined);
		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Cook statistics for ABC123");
		expect(output).toContain("Total cook time:     3h 0m");
	});

	it("passes the limit through to getArchives", async () => {
		mockGetArchives.mockResolvedValue([]);
		await stats({ serial: "ABC123", limit: 5 }, { json: false });
		expect(mockGetArchives).toHaveBeenCalledWith("ABC123", { limit: 5 });
	});

	it("emits JSON when --json is set", async () => {
		mockGetArchives.mockResolvedValue([cook("a", "2026-01-01T00:00:00Z", 2, 120)]);
		await stats({ serial: "ABC123" }, { json: true });
		const output = logSpy.mock.calls.map((c) => c[0]).join("");
		const parsed = JSON.parse(output);
		expect(parsed.serial).toBe("ABC123");
		expect(parsed.totalDurationSeconds).toBe(7200);
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		await expect(stats({ serial: "ABC123" }, { json: false })).rejects.toThrow("exit");
		expect(errorSpy).toHaveBeenCalledWith("Not logged in. Run: thermoworks auth login");
	});
});
