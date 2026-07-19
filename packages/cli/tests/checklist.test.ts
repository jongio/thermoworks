import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	buildCookChecklist,
	checklist,
	formatChecklist,
	formatChecklistMeatList,
	parseChecklistArgs,
} from "../src/commands/checklist.js";

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe("parseChecklistArgs", () => {
	it("parses a multi-word meat name with weight and ready time", () => {
		const parsed = parseChecklistArgs(["pork", "butt", "--weight", "8", "--ready", "6:00 PM"]);
		expect(parsed).toMatchObject({
			meat: "pork butt",
			weightLb: 8,
		});
		expect("readyAt" in parsed && parsed.readyAt).toBeInstanceOf(Date);
	});

	it("returns listMeats for the list flag", () => {
		expect(parseChecklistArgs(["--list-meats"])).toEqual({ listMeats: true });
	});

	it("rejects bad weights", () => {
		expect(parseChecklistArgs(["brisket", "--weight", "0"])).toEqual({
			error: expect.stringContaining("--weight"),
		});
	});
});

describe("buildCookChecklist", () => {
	it("builds timed steps when ready time and weight are available", () => {
		const checklist = buildCookChecklist(
			{
				name: "Brisket",
				hoursPerPound: 1.25,
				fixedHours: null,
				restMinutes: 60,
				pitTempF: 250,
				targetTempF: 203,
				doneness: "Probe-tender",
			},
			{ weightLb: 10, readyAt: new Date("2026-01-15T18:00:00") },
		);

		expect(checklist.cookMinutes).toBe(750);
		expect(
			checklist.readyAt && checklist.startAt
				? (checklist.readyAt.getTime() - checklist.startAt.getTime()) / 60_000
				: 0,
		).toBe(810);
		expect(checklist.steps.map((step) => step.id)).toContain("wrap");
	});
});

describe("formatChecklist", () => {
	it("renders a compact human checklist", () => {
		const checklist = buildCookChecklist({
			name: "Salmon",
			hoursPerPound: null,
			fixedHours: 1,
			restMinutes: 5,
			pitTempF: 225,
			targetTempF: 125,
			doneness: "125-130\u00B0F for moist, flaky fillets",
		});

		const out = formatChecklist(checklist);
		expect(out).toContain("Cook-day checklist - Salmon");
		expect(out).toContain("Pit: 225\u00B0F");
		expect(out).toContain("Tip: add --ready");
	});
});

describe("formatChecklistMeatList", () => {
	it("lists built-in meats", () => {
		const out = formatChecklistMeatList();
		expect(out).toContain("Built-in checklist meats");
		expect(out).toContain("Brisket");
	});
});

describe("checklist command", () => {
	it("prints the meat list", async () => {
		await checklist(["--list-meats"]);
		const written = stdoutWriteSpy.mock.calls.map((call) => call[0]).join("");
		expect(written).toContain("Brisket");
	});

	it("prints a checklist for an alias", async () => {
		await checklist(["pulled", "pork", "--weight", "8"]);
		const written = stdoutWriteSpy.mock.calls.map((call) => call[0]).join("");
		expect(written).toContain("Pork Butt");
		expect(written).toContain("Check the stall and wrap");
	});

	it("emits JSON", async () => {
		await checklist(["salmon"], { json: true });
		const parsed = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
		expect(parsed.meat.name).toBe("Salmon");
		expect(parsed.steps.length).toBeGreaterThan(3);
	});

	it("exits for an unknown meat", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});

		await expect(checklist(["unobtainium"])).rejects.toThrow("exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown meat"));
		exitSpy.mockRestore();
	});
});
