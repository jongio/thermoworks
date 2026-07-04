import type { Archive, ArchiveChannel, DeviceHistory } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetHistory = vi.fn();
const mockGetArchive = vi.fn();
const mockClose = vi.fn();

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	class MockThermoworksCloud {
		getHistory = mockGetHistory;
		getArchive = mockGetArchive;
		close = mockClose;
	}
	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

import type { ReplayFrame } from "thermoworks-sdk";
import { formatReplayFrame, parseReplayArgs, replay } from "../src/commands/replay.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

function history(deviceId: string, values: number[]): DeviceHistory {
	return {
		deviceId,
		readings: values.map((value, i) => ({
			value,
			timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
			units: "F",
		})),
	};
}

function archiveChannel(overrides: Partial<ArchiveChannel> = {}): ArchiveChannel {
	return {
		number: "1",
		label: "Pit",
		units: "F",
		value: null,
		status: null,
		enabled: true,
		color: null,
		type: null,
		alarmHigh: null,
		alarmLow: null,
		minimum: null,
		maximum: null,
		recentReadings: [],
		...overrides,
	};
}

describe("parseReplayArgs", () => {
	it("returns null without a serial", () => {
		expect(parseReplayArgs([])).toBeNull();
		expect(parseReplayArgs(["--loop"])).toBeNull();
	});

	it("parses options with defaults", () => {
		expect(parseReplayArgs(["M100"])).toEqual({
			serial: "M100",
			archive: undefined,
			channel: undefined,
			speed: 60,
			loop: false,
		});
	});

	it("parses all options", () => {
		expect(
			parseReplayArgs(["M100", "--archive", "a1", "--channel", "2", "--speed", "120", "--loop"]),
		).toEqual({
			serial: "M100",
			archive: "a1",
			channel: "2",
			speed: 120,
			loop: true,
		});
	});
});

describe("formatReplayFrame", () => {
	it("includes the value, units, and position", () => {
		const frame: ReplayFrame = {
			index: 2,
			value: 225,
			units: "F",
			timestamp: new Date("2026-01-01T12:00:00Z"),
			delayMs: 0,
			offsetMs: 0,
		};
		const out = formatReplayFrame(frame, 10);
		expect(out).toContain("3/10");
		expect(out).toContain("225");
		expect(out).toContain("\u00B0F");
	});
});

describe("replay command", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	const instantSleep = vi.fn(() => Promise.resolve());

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		mockGetCredentials.mockResolvedValue({ email: "e", password: "p" });
		instantSleep.mockClear();
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("streams recent history frames then completes", async () => {
		mockGetHistory.mockResolvedValue(history("M100", [100, 150, 200]));
		await replay(["M100"], { json: false }, { sleep: instantSleep });
		expect(mockGetHistory).toHaveBeenCalledWith("M100");
		// one header line + three frames + completion line
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Replay complete."));
		const frameLines = logSpy.mock.calls.filter((c) => String(c[0]).includes("\u00B0F"));
		expect(frameLines).toHaveLength(3);
		expect(mockClose).toHaveBeenCalled();
	});

	it("replays an archive channel", async () => {
		const archive = {
			id: "a1",
			start: null,
			end: null,
			count: 2,
			type: null,
			label: "Brisket",
			deviceLabel: null,
			notes: null,
			createdOn: null,
			public: null,
			publicLink: null,
			filename: null,
			channels: [
				archiveChannel({
					recentReadings: [100, 200].map((value, i) => ({
						value,
						timestamp: new Date(2026, 0, 1, 0, i),
						units: "F",
					})),
				}),
			],
		} as Archive;
		mockGetArchive.mockResolvedValue(archive);
		await replay(["M100", "--archive", "a1"], { json: false }, { sleep: instantSleep });
		expect(mockGetArchive).toHaveBeenCalledWith("M100", "a1");
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Replay complete."));
	});

	it("reports when there are no readings", async () => {
		mockGetHistory.mockResolvedValue(history("M100", []));
		await replay(["M100"], { json: false }, { sleep: instantSleep });
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("No readings to replay"));
	});

	it("waits for each frame gap using the injected sleep", async () => {
		mockGetHistory.mockResolvedValue(history("M100", [1, 2, 3]));
		await replay(["M100", "--speed", "60"], { json: false }, { sleep: instantSleep });
		// three frames, so sleep called three times (first with 0)
		expect(instantSleep).toHaveBeenCalledTimes(3);
		expect(instantSleep).toHaveBeenNthCalledWith(1, 0);
	});
});
