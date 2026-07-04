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

import { downsample, graph, parseGraphArgs, renderChart } from "../src/commands/graph.js";
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

describe("downsample", () => {
	it("returns the input unchanged when it fits", () => {
		expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3]);
	});

	it("reduces to the requested width", () => {
		const result = downsample([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
		expect(result).toHaveLength(5);
	});

	it("averages each bucket", () => {
		const result = downsample([0, 10, 20, 30], 2);
		expect(result).toEqual([5, 25]);
	});
});

describe("renderChart", () => {
	it("reports when there are no readings", () => {
		expect(renderChart([])).toBe("(no readings to chart)\n");
	});

	it("ignores non-finite values and reports when none remain", () => {
		expect(renderChart([Number.NaN, Number.POSITIVE_INFINITY])).toBe("(no readings to chart)\n");
	});

	it("renders a single reading without dividing by zero", () => {
		const out = renderChart([200], { width: 10, height: 5 });
		expect(out).toContain("*");
		expect(out.split("\n").filter(Boolean).length).toBe(6); // 5 rows + axis
	});

	it("renders a flat line without dividing by zero", () => {
		const out = renderChart([100, 100, 100, 100], { width: 10, height: 5 });
		expect(out).toContain("*");
		expect(out).not.toContain("NaN");
	});

	it("places the max near the top row and the min near the bottom row", () => {
		const out = renderChart([0, 100], { width: 2, height: 5 });
		const rows = out.split("\n");
		const firstStarRow = rows.findIndex((r) => r.includes("*"));
		const lastStarRow = rows.map((r) => r.includes("*")).lastIndexOf(true);
		expect(firstStarRow).toBeGreaterThanOrEqual(0);
		expect(lastStarRow).toBeGreaterThan(firstStarRow);
	});

	it("respects the requested height", () => {
		const out = renderChart([1, 2, 3, 4, 5], { width: 20, height: 8 });
		// 8 plot rows plus one axis row
		expect(out.split("\n").filter(Boolean).length).toBe(9);
	});

	it("enforces a minimum height and width", () => {
		const out = renderChart([1, 2, 3], { width: 1, height: 1 });
		expect(out.split("\n").filter(Boolean).length).toBe(4); // MIN_HEIGHT 3 + axis
	});

	it("labels the axis with min and max values", () => {
		const out = renderChart([50, 250], { width: 10, height: 5 });
		expect(out).toContain("250");
		expect(out).toContain("50");
	});
});

describe("parseGraphArgs", () => {
	it("returns null without a serial", () => {
		expect(parseGraphArgs([])).toBeNull();
		expect(parseGraphArgs(["--archive", "a1"])).toBeNull();
	});

	it("parses the serial and options", () => {
		const result = parseGraphArgs([
			"M100",
			"--archive",
			"a1",
			"--channel",
			"2",
			"--width",
			"40",
			"--height",
			"6",
		]);
		expect(result).toEqual({ serial: "M100", archive: "a1", channel: "2", width: 40, height: 6 });
	});

	it("defaults width and height", () => {
		expect(parseGraphArgs(["M100"])).toEqual({
			serial: "M100",
			archive: undefined,
			channel: undefined,
			width: 60,
			height: 12,
		});
	});
});

describe("graph command", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	let stdoutSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		mockGetCredentials.mockResolvedValue({ email: "e", password: "p" });
	});

	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("charts recent history by default", async () => {
		mockGetHistory.mockResolvedValue(history("M100", [100, 150, 200]));
		await graph(["M100"], { json: false });
		expect(mockGetHistory).toHaveBeenCalledWith("M100");
		expect(mockGetArchive).not.toHaveBeenCalled();
		expect(stdoutSpy).toHaveBeenCalled();
		expect(mockClose).toHaveBeenCalled();
	});

	it("charts an archive channel with --archive", async () => {
		const archive: Archive = {
			id: "a1",
			start: null,
			end: null,
			count: 3,
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
					recentReadings: [100, 150, 200].map((value) => ({
						value,
						timestamp: new Date(),
						units: "F",
					})),
				}),
			],
		} as Archive;
		mockGetArchive.mockResolvedValue(archive);
		await graph(["M100", "--archive", "a1"], { json: false });
		expect(mockGetArchive).toHaveBeenCalledWith("M100", "a1");
		expect(stdoutSpy).toHaveBeenCalled();
	});

	it("reports when history has no readings", async () => {
		mockGetHistory.mockResolvedValue(history("M100", []));
		await graph(["M100"], { json: false });
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("No readings to chart"));
	});
});
