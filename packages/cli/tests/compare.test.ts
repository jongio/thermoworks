import type { Archive, ArchiveChannel, MinMaxReading, TemperatureReading } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetArchive = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getArchive = mockGetArchive;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

import { ThermoworksCloud } from "thermoworks-sdk";
import {
	compare,
	computeComparison,
	formatComparison,
	parseCompareArgs,
	toJsonComparison,
} from "../src/commands/compare.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

const mockClient = new ThermoworksCloud({ email: "", password: "" });
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

function makeReading(value: number, minutesOffset: number): TemperatureReading {
	const base = new Date("2026-01-15T08:00:00Z");
	return {
		value,
		timestamp: new Date(base.getTime() + minutesOffset * 60_000),
		units: "F",
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
// parseCompareArgs
// =============================================================================

describe("parseCompareArgs", () => {
	it("parses serial and two archive IDs from positional args", () => {
		const result = parseCompareArgs(["archives", "compare", "ABC123", "arc-1", "arc-2"]);
		expect(result).toEqual({ serial: "ABC123", archiveA: "arc-1", archiveB: "arc-2" });
	});

	it("returns null when serial is missing", () => {
		expect(parseCompareArgs(["archives", "compare"])).toBeNull();
	});

	it("returns null when only serial is provided", () => {
		expect(parseCompareArgs(["archives", "compare", "ABC123"])).toBeNull();
	});

	it("returns null when only one archive ID is provided", () => {
		expect(parseCompareArgs(["archives", "compare", "ABC123", "arc-1"])).toBeNull();
	});

	it("ignores unknown flags", () => {
		const result = parseCompareArgs(["archives", "compare", "SN1", "a1", "a2", "--verbose"]);
		expect(result).toEqual({ serial: "SN1", archiveA: "a1", archiveB: "a2" });
	});
});

// =============================================================================
// computeComparison
// =============================================================================

describe("computeComparison", () => {
	it("computes duration, readings, and channel counts", () => {
		const a = makeArchive({
			id: "a1",
			label: "Brisket",
			start: new Date("2026-01-15T08:00:00Z"),
			end: new Date("2026-01-15T20:00:00Z"),
			count: 720,
			channels: [
				makeChannel({
					label: "Pit",
					minimum: makeMinMax(210),
					maximum: makeMinMax(260),
					value: 225,
				}),
			],
		});
		const b = makeArchive({
			id: "a2",
			label: "Pork Butt",
			start: new Date("2026-01-16T07:00:00Z"),
			end: new Date("2026-01-16T17:00:00Z"),
			count: 600,
			channels: [
				makeChannel({
					label: "Pit",
					minimum: makeMinMax(220),
					maximum: makeMinMax(250),
					value: 235,
				}),
			],
		});

		const result = computeComparison("SN1", a, b);

		expect(result.serial).toBe("SN1");
		expect(result.archiveA.label).toBe("Brisket");
		expect(result.archiveB.label).toBe("Pork Butt");
		expect(result.archiveA.durationMs).toBe(12 * 3600_000);
		expect(result.archiveB.durationMs).toBe(10 * 3600_000);
		expect(result.durationDiffMs).toBe(-2 * 3600_000);
		expect(result.archiveA.readingCount).toBe(720);
		expect(result.archiveB.readingCount).toBe(600);
		expect(result.readingCountDiff).toBe(-120);
	});

	it("compares per-channel min/max/last", () => {
		const a = makeArchive({
			id: "a1",
			channels: [
				makeChannel({
					label: "Meat",
					units: "F",
					minimum: makeMinMax(40),
					maximum: makeMinMax(195),
					value: 195,
				}),
			],
		});
		const b = makeArchive({
			id: "a2",
			channels: [
				makeChannel({
					label: "Meat",
					units: "F",
					minimum: makeMinMax(42),
					maximum: makeMinMax(203),
					value: 203,
				}),
			],
		});

		const result = computeComparison("SN1", a, b);
		expect(result.channels).toHaveLength(1);
		const ch = result.channels[0]!;
		expect(ch.label).toBe("Meat");
		expect(ch.diff.min).toBe(2);
		expect(ch.diff.max).toBe(8);
		expect(ch.diff.last).toBe(8);
	});

	it("computes channel average from recentReadings", () => {
		const a = makeArchive({
			id: "a1",
			channels: [
				makeChannel({
					label: "Probe",
					recentReadings: [makeReading(100, 0), makeReading(200, 10)],
				}),
			],
		});
		const b = makeArchive({
			id: "a2",
			channels: [
				makeChannel({
					label: "Probe",
					recentReadings: [makeReading(150, 0), makeReading(250, 10)],
				}),
			],
		});

		const result = computeComparison("SN1", a, b);
		expect(result.channels[0]!.a.avg).toBe(150);
		expect(result.channels[0]!.b.avg).toBe(200);
		expect(result.channels[0]!.diff.avg).toBe(50);
	});

	it("handles archives with no channels", () => {
		const a = makeArchive({ id: "a1", channels: null });
		const b = makeArchive({ id: "a2", channels: null });

		const result = computeComparison("SN1", a, b);
		expect(result.channels).toHaveLength(0);
		expect(result.archiveA.channelCount).toBe(0);
		expect(result.archiveB.channelCount).toBe(0);
	});

	it("handles mismatched channel sets", () => {
		const a = makeArchive({
			id: "a1",
			channels: [makeChannel({ label: "Pit", value: 225 })],
		});
		const b = makeArchive({
			id: "a2",
			channels: [makeChannel({ label: "Meat", value: 195 })],
		});

		const result = computeComparison("SN1", a, b);
		expect(result.channels).toHaveLength(2);

		const pitCh = result.channels.find((c) => c.label === "Pit")!;
		expect(pitCh.a.last).toBe(225);
		expect(pitCh.b.last).toBeNull();

		const meatCh = result.channels.find((c) => c.label === "Meat")!;
		expect(meatCh.a.last).toBeNull();
		expect(meatCh.b.last).toBe(195);
	});

	it("handles archives with no start/end", () => {
		const a = makeArchive({ id: "a1", start: null, end: null });
		const b = makeArchive({ id: "a2", start: null, end: null });

		const result = computeComparison("SN1", a, b);
		expect(result.archiveA.durationMs).toBeNull();
		expect(result.archiveB.durationMs).toBeNull();
		expect(result.durationDiffMs).toBeNull();
	});

	it("falls back to archive ID when label is null", () => {
		const a = makeArchive({ id: "arc-no-label-a", label: null });
		const b = makeArchive({ id: "arc-no-label-b", label: null });

		const result = computeComparison("SN1", a, b);
		expect(result.archiveA.label).toBe("arc-no-label-a");
		expect(result.archiveB.label).toBe("arc-no-label-b");
	});
});

// =============================================================================
// formatComparison
// =============================================================================

describe("formatComparison", () => {
	it("renders a readable comparison table", () => {
		const a = makeArchive({
			id: "a1",
			label: "Brisket",
			start: new Date("2026-01-15T08:00:00Z"),
			end: new Date("2026-01-15T20:00:00Z"),
			count: 720,
			channels: [
				makeChannel({
					label: "Pit",
					units: "F",
					minimum: makeMinMax(210),
					maximum: makeMinMax(260),
					value: 225,
				}),
			],
		});
		const b = makeArchive({
			id: "a2",
			label: "Ribs",
			start: new Date("2026-01-16T07:00:00Z"),
			end: new Date("2026-01-16T13:00:00Z"),
			count: 360,
			channels: [
				makeChannel({
					label: "Pit",
					units: "F",
					minimum: makeMinMax(220),
					maximum: makeMinMax(250),
					value: 235,
				}),
			],
		});

		const result = computeComparison("SN1", a, b);
		const text = formatComparison(result);

		expect(text).toContain("Comparing archives for SN1");
		expect(text).toContain("Brisket");
		expect(text).toContain("Ribs");
		expect(text).toContain("12h 0m");
		expect(text).toContain("6h 0m");
		expect(text).toContain("720");
		expect(text).toContain("360");
		expect(text).toContain("Pit");
		expect(text).toContain("210\u00B0F");
		expect(text).toContain("220\u00B0F");
	});

	it("shows '-' for missing duration", () => {
		const a = makeArchive({ id: "a1", label: "A", start: null, end: null });
		const b = makeArchive({ id: "a2", label: "B", start: null, end: null });

		const result = computeComparison("SN1", a, b);
		const text = formatComparison(result);

		// Duration column should contain dashes
		expect(text).toContain("Duration");
		const durationLine = text.split("\n").find((l) => l.includes("Duration"))!;
		expect(durationLine).toContain("-");
	});
});

// =============================================================================
// toJsonComparison
// =============================================================================

describe("toJsonComparison", () => {
	it("produces machine-readable output with seconds and ISO dates", () => {
		const a = makeArchive({
			id: "a1",
			label: "Brisket",
			start: new Date("2026-01-15T08:00:00Z"),
			end: new Date("2026-01-15T20:00:00Z"),
			count: 720,
			channels: [
				makeChannel({
					label: "Pit",
					units: "F",
					minimum: makeMinMax(210),
					maximum: makeMinMax(260),
					value: 225,
				}),
			],
		});
		const b = makeArchive({
			id: "a2",
			label: "Ribs",
			start: new Date("2026-01-16T07:00:00Z"),
			end: new Date("2026-01-16T13:00:00Z"),
			count: 360,
			channels: [
				makeChannel({
					label: "Pit",
					units: "F",
					minimum: makeMinMax(220),
					maximum: makeMinMax(250),
					value: 235,
				}),
			],
		});

		const result = computeComparison("SN1", a, b);
		const json = toJsonComparison(result);

		expect(json.serial).toBe("SN1");

		const archA = json.archiveA as Record<string, unknown>;
		expect(archA.id).toBe("a1");
		expect(archA.label).toBe("Brisket");
		expect(archA.durationSeconds).toBe(43200);
		expect(archA.start).toBe("2026-01-15T08:00:00.000Z");

		const archB = json.archiveB as Record<string, unknown>;
		expect(archB.id).toBe("a2");
		expect(archB.durationSeconds).toBe(21600);

		expect(json.durationDiffSeconds).toBe(-21600);
		expect(json.readingCountDiff).toBe(-360);

		const channels = json.channels as Array<Record<string, unknown>>;
		expect(channels).toHaveLength(1);
		expect(channels[0]!.label).toBe("Pit");
	});

	it("emits nulls for archives without start/end", () => {
		const a = makeArchive({ id: "a1" });
		const b = makeArchive({ id: "a2" });

		const result = computeComparison("SN1", a, b);
		const json = toJsonComparison(result);

		const archA = json.archiveA as Record<string, unknown>;
		expect(archA.start).toBeNull();
		expect(archA.end).toBeNull();
		expect(archA.durationSeconds).toBeNull();
		expect(json.durationDiffSeconds).toBeNull();
	});
});

// =============================================================================
// compare command (integration)
// =============================================================================

describe("compare command", () => {
	it("prints a human-readable comparison", async () => {
		mockGetCredentials.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		const archA = makeArchive({
			id: "a1",
			label: "Brisket",
			start: new Date("2026-01-15T08:00:00Z"),
			end: new Date("2026-01-15T20:00:00Z"),
			count: 720,
			channels: [makeChannel({ label: "Pit", value: 225 })],
		});
		const archB = makeArchive({
			id: "a2",
			label: "Ribs",
			start: new Date("2026-01-16T07:00:00Z"),
			end: new Date("2026-01-16T13:00:00Z"),
			count: 360,
			channels: [makeChannel({ label: "Pit", value: 235 })],
		});
		mockGetArchive.mockResolvedValueOnce(archA).mockResolvedValueOnce(archB);

		await compare({ serial: "SN1", archiveA: "a1", archiveB: "a2" }, { json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Comparing archives for SN1");
		expect(output).toContain("Brisket");
		expect(output).toContain("Ribs");
	});

	it("emits JSON when --json is set", async () => {
		mockGetCredentials.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		const archA = makeArchive({ id: "a1", label: "Cook 1", count: 100 });
		const archB = makeArchive({ id: "a2", label: "Cook 2", count: 200 });
		mockGetArchive.mockResolvedValueOnce(archA).mockResolvedValueOnce(archB);

		await compare({ serial: "SN1", archiveA: "a1", archiveB: "a2" }, { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const parsed = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(parsed.serial).toBe("SN1");
		expect(parsed.archiveA.id).toBe("a1");
		expect(parsed.archiveB.id).toBe("a2");
		expect(parsed.readingCountDiff).toBe(100);
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});

		await expect(
			compare({ serial: "SN1", archiveA: "a1", archiveB: "a2" }, { json: false }),
		).rejects.toThrow("exit");

		expect(errorSpy).toHaveBeenCalledWith("Not logged in. Run: thermoworks auth login");
	});

	it("propagates SDK errors for missing archives", async () => {
		mockGetCredentials.mockResolvedValue({ email: "pit@example.com", password: "secret" });
		mockGetArchive.mockRejectedValue(new Error("Archive 'missing' not found for device 'SN1'"));

		await expect(
			compare({ serial: "SN1", archiveA: "missing", archiveB: "a2" }, { json: false }),
		).rejects.toThrow("Archive 'missing' not found");
	});
});
