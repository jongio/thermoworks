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
import { formatStability, parseStabilityArgs, stability } from "../src/commands/stability.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);
const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetArchive = vi.mocked(mockClient.getArchive);
const mockGetArchives = vi.mocked(mockClient.getArchives);

const base = new Date("2026-07-01T12:00:00.000Z");

function makeReading(value: number, minuteOffset: number, units = "F"): TemperatureReading {
	return { value, timestamp: new Date(base.getTime() + minuteOffset * 60_000), units };
}

function makeChannel(overrides: Partial<ArchiveChannel> = {}): ArchiveChannel {
	return {
		number: overrides.number ?? "1",
		label: overrides.label ?? "Pit",
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

describe("parseStabilityArgs", () => {
	it("parses serial, archive, channel, target, and band", () => {
		expect(
			parseStabilityArgs([
				"ABC123",
				"--archive",
				"a1",
				"--channel",
				"2",
				"--target",
				"250",
				"--band",
				"15",
			]),
		).toEqual({ serial: "ABC123", archive: "a1", channel: "2", targetF: 250, bandF: 15 });
	});

	it("rejects bad numeric options", () => {
		expect(parseStabilityArgs(["ABC123", "--target", "hot"])).toEqual({
			error: '--target must be a number, got "hot"',
		});
		expect(parseStabilityArgs(["ABC123", "--target", "250", "--band", "0"])).toEqual({
			error: '--band must be a positive number, got "0"',
		});
	});
});

describe("formatStability", () => {
	it("renders stability stats", () => {
		const out = formatStability(
			{
				targetF: 250,
				bandF: 15,
				lowLimitF: 235,
				highLimitF: 265,
				startedAt: base,
				endedAt: new Date(base.getTime() + 60 * 60_000),
				durationMinutes: 60,
				sampleCount: 7,
				inBandMinutes: 45,
				highMinutes: 10,
				lowMinutes: 5,
				inBandPercent: 75,
				averageTempF: 251.2,
				minTempF: 230,
				maxTempF: 270,
				longestExcursion: {
					direction: "high",
					startedAt: base,
					endedAt: new Date(base.getTime() + 10 * 60_000),
					durationMinutes: 10,
					peakTempF: 270,
				},
			},
			"Pit stability",
		);
		expect(out).toContain("Target:");
		expect(out).toContain("In band:");
		expect(out).toContain("Longest miss: high");
	});
});

describe("stability command", () => {
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let writeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("analyzes the latest archive by default", async () => {
		mockGetArchives.mockResolvedValue([
			makeArchive({
				channels: [
					makeChannel({
						recentReadings: [makeReading(250, 0), makeReading(270, 10), makeReading(250, 20)],
					}),
				],
			}),
		]);

		await stability(["ABC123", "--target", "250", "--band", "5"], { json: false });

		expect(mockGetArchives).toHaveBeenCalledWith("ABC123", { limit: 1 });
		const printed = writeSpy.mock.calls.map((call) => call[0]).join("");
		expect(printed).toContain("Pit stability for Brisket");
		expect(printed).toContain("High:");
	});

	it("fetches a specific archive and channel", async () => {
		mockGetArchive.mockResolvedValue(
			makeArchive({
				id: "arch-9",
				channels: [
					makeChannel({ number: "1", recentReadings: [makeReading(250, 0)] }),
					makeChannel({ number: "2", recentReadings: [makeReading(240, 0), makeReading(250, 10)] }),
				],
			}),
		);

		await stability(
			["ABC123", "--archive", "arch-9", "--channel", "2", "--target", "250", "--band", "5"],
			{ json: true },
		);

		expect(mockGetArchive).toHaveBeenCalledWith("ABC123", "arch-9");
		const output = JSON.parse(vi.mocked(console.log).mock.calls[0]?.[0] as string);
		expect(output.archiveId).toBe("arch-9");
		expect(output.channel).toBe("2");
		expect(output.lowMinutes).toBe(10);
	});

	it("converts Celsius readings to Fahrenheit", async () => {
		mockGetArchives.mockResolvedValue([
			makeArchive({
				channels: [
					makeChannel({
						units: "C",
						recentReadings: [makeReading(130, 0, "C"), makeReading(121.1, 10, "C")],
					}),
				],
			}),
		]);

		await stability(["ABC123", "--target", "250", "--band", "10"], { json: true });
		const output = JSON.parse(vi.mocked(console.log).mock.calls[0]?.[0] as string);
		expect(output.maxTempF).toBeCloseTo(266, 0);
		expect(output.highMinutes).toBe(10);
	});

	it("exits when required args or data are missing", async () => {
		await expect(stability(["ABC123"], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));

		mockGetArchives.mockResolvedValue([]);
		await expect(stability(["ABC123", "--target", "250"], { json: false })).rejects.toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("No archives found"));
	});
});
