import type { Archive, ArchiveChannel, TemperatureReading } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetArchive = vi.fn();
	const mockGetArchives = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getArchive = mockGetArchive;
		getArchives = mockGetArchives;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

import { ThermoworksCloud } from "thermoworks-sdk";
import { formatClock, formatTimeline, parseTimelineArgs } from "../src/commands/timeline.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);
const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetArchive = vi.mocked(mockClient.getArchive);
const mockGetArchives = vi.mocked(mockClient.getArchives);

const base = new Date("2026-07-01T12:00:00Z");
function makeReading(value: number, minuteOffset: number, units = "F"): TemperatureReading {
	return { value, timestamp: new Date(base.getTime() + minuteOffset * 60 * 1000), units };
}

function makeChannel(overrides: Partial<ArchiveChannel> = {}): ArchiveChannel {
	return {
		number: overrides.number ?? "1",
		label: overrides.label ?? "Probe 1",
		units: overrides.units ?? "F",
		value: null,
		status: null,
		enabled: null,
		color: null,
		type: null,
		alarmHigh: null,
		alarmLow: null,
		minimum: null,
		maximum: null,
		recentReadings: overrides.recentReadings ?? [],
	};
}

function makeArchive(overrides: Partial<Archive> = {}): Archive {
	return {
		id: overrides.id ?? "arch-1",
		start: null,
		end: null,
		count: null,
		type: null,
		label: overrides.label ?? "Brisket",
		deviceLabel: null,
		notes: null,
		createdOn: null,
		public: null,
		publicLink: null,
		filename: null,
		channels: overrides.channels ?? null,
	} as Archive;
}

// =============================================================================
// parseTimelineArgs
// =============================================================================

describe("parseTimelineArgs", () => {
	it("parses serial, archive, channel, and target", () => {
		expect(
			parseTimelineArgs(["ABC123", "--archive", "a1", "--channel", "2", "--target", "203"]),
		).toEqual({ serial: "ABC123", archive: "a1", channel: "2", targetF: 203 });
	});

	it("rejects a non-numeric target", () => {
		expect(parseTimelineArgs(["ABC123", "--target", "hot"])).toEqual({
			error: expect.stringContaining("--target"),
		});
	});

	it("rejects an unknown option", () => {
		expect(parseTimelineArgs(["ABC123", "--bogus"])).toEqual({
			error: expect.stringContaining("Unknown option"),
		});
	});

	it("rejects a missing archive value", () => {
		expect(parseTimelineArgs(["ABC123", "--archive"])).toEqual({
			error: expect.stringContaining("--archive"),
		});
	});
});

// =============================================================================
// formatClock
// =============================================================================

describe("formatClock", () => {
	it("formats sub-hour offsets", () => {
		expect(formatClock(5)).toBe("0:05");
		expect(formatClock(45)).toBe("0:45");
	});

	it("formats multi-hour offsets", () => {
		expect(formatClock(125)).toBe("2:05");
	});
});

// =============================================================================
// formatTimeline
// =============================================================================

describe("formatTimeline", () => {
	it("notes when there is nothing to chart", () => {
		const out = formatTimeline(
			{
				events: [],
				startedAt: null,
				endedAt: null,
				durationMinutes: 0,
				minTempF: null,
				maxTempF: null,
				targetReached: false,
			},
			"Timeline",
		);
		expect(out).toContain("No readings to chart");
	});

	it("renders milestone lines with clock offsets", () => {
		const out = formatTimeline(
			{
				events: [
					{
						kind: "start",
						timestamp: base,
						minuteOffset: 0,
						tempF: 70,
						detail: "Cook started at 70\u00B0F",
					},
					{
						kind: "end",
						timestamp: new Date(base.getTime() + 120 * 60000),
						minuteOffset: 120,
						tempF: 203,
						detail: "Cook ended at 203\u00B0F",
					},
				],
				startedAt: base,
				endedAt: new Date(base.getTime() + 120 * 60000),
				durationMinutes: 120,
				minTempF: 70,
				maxTempF: 203,
				targetReached: true,
			},
			"Timeline for Brisket",
		);
		expect(out).toContain("Timeline for Brisket");
		expect(out).toContain("0:00");
		expect(out).toContain("2:00");
		expect(out).toContain("start");
		expect(out).toContain("end");
		expect(out).toContain("Min 70\u00B0F, max 203\u00B0F over 120m");
	});
});

// =============================================================================
// timeline handler
// =============================================================================

describe("timeline", () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let writeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("charts the latest archive by default", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([
			makeArchive({
				channels: [
					makeChannel({
						recentReadings: [makeReading(70, 0), makeReading(160, 60), makeReading(203, 120)],
					}),
				],
			}),
		]);

		const { timeline } = await import("../src/commands/timeline.js");
		await timeline(["ABC123"], { json: false });

		expect(mockGetArchives).toHaveBeenCalledWith("ABC123", { limit: 1 });
		const printed = writeSpy.mock.calls.map((c) => c[0]).join("");
		expect(printed).toContain("Timeline for Brisket");
		expect(printed).toContain("start");
		expect(printed).toContain("end");
	});

	it("fetches a specific archive when --archive is given", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchive.mockResolvedValue(
			makeArchive({
				id: "arch-9",
				channels: [makeChannel({ recentReadings: [makeReading(70, 0), makeReading(203, 90)] })],
			}),
		);

		const { timeline } = await import("../src/commands/timeline.js");
		await timeline(["ABC123", "--archive", "arch-9"], { json: false });

		expect(mockGetArchive).toHaveBeenCalledWith("ABC123", "arch-9");
	});

	it("converts Celsius readings to Fahrenheit in JSON output", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([
			makeArchive({
				channels: [
					makeChannel({
						units: "C",
						recentReadings: [makeReading(20, 0, "C"), makeReading(95, 120, "C")],
					}),
				],
			}),
		]);

		const { timeline } = await import("../src/commands/timeline.js");
		await timeline(["ABC123"], { json: true });

		const logSpy = vi.mocked(console.log);
		const output = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
		// 20C = 68F, 95C = 203F.
		expect(output.minTempF).toBeCloseTo(68, 0);
		expect(output.maxTempF).toBeCloseTo(203, 0);
		expect(output.archiveId).toBe("arch-1");
	});

	it("exits when no serial is provided", async () => {
		const { timeline } = await import("../src/commands/timeline.js");
		await expect(timeline([], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const { timeline } = await import("../src/commands/timeline.js");
		await expect(timeline(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});

	it("exits when the archive has no channel readings", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([makeArchive({ channels: [] })]);
		const { timeline } = await import("../src/commands/timeline.js");
		await expect(timeline(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("no channel readings"));
	});

	it("exits when no archives exist", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetArchives.mockResolvedValue([]);
		const { timeline } = await import("../src/commands/timeline.js");
		await expect(timeline(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No archives found"));
	});
});
