import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	formatThawPlan,
	formatThawProfileTable,
	parseThawArgs,
	thaw,
} from "../src/commands/thaw.js";

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

describe("parseThawArgs", () => {
	it("parses meat, weight, method, and ready time", () => {
		const parsed = parseThawArgs([
			"pork",
			"butt",
			"--weight",
			"8",
			"--method",
			"cold-water",
			"--ready",
			"2026-07-20T12:00:00Z",
		]);
		expect(parsed).toMatchObject({ meat: "pork butt", weightLb: 8, method: "cold-water" });
		expect("readyAt" in parsed && parsed.readyAt?.toISOString()).toBe("2026-07-20T12:00:00.000Z");
	});

	it("rejects bad weight and method values", () => {
		expect(parseThawArgs(["brisket", "--weight", "0"])).toEqual({
			error: '--weight must be a positive number, got "0"',
		});
		expect(parseThawArgs(["brisket", "--weight", "4", "--method", "microwave"])).toEqual({
			error: "Unknown thaw method: microwave",
		});
	});
});

describe("formatThawProfileTable", () => {
	it("renders thaw rates", () => {
		const out = formatThawProfileTable([
			{
				meat: "Brisket",
				fridgeHoursPerPound: 5,
				coldWaterMinutesPerPound: 30,
				minFridgeHours: 24,
				minColdWaterMinutes: 180,
				note: "Large cut.",
			},
		]);
		expect(out).toContain("Thaw timing guide");
		expect(out).toContain("5h/lb");
		expect(out).toContain("30m/lb");
	});
});

describe("formatThawPlan", () => {
	it("renders thaw timing and dates", () => {
		const out = formatThawPlan({
			meat: "Brisket",
			weightLb: 12,
			method: "fridge",
			thawHours: 60,
			bufferHours: 4,
			totalHours: 64,
			startAt: new Date("2026-07-17T20:00:00.000Z"),
			readyAt: new Date("2026-07-20T12:00:00.000Z"),
			note: "Keep wrapped.",
		});
		expect(out).toContain("Thaw plan for Brisket");
		expect(out).toContain("60h");
		expect(out).toContain("Keep wrapped");
	});
});

describe("thaw command", () => {
	it("prints the profile list", async () => {
		await thaw(["--list"]);
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Thaw timing guide");
		expect(written).toContain("Brisket");
	});

	it("prints a thaw plan", async () => {
		await thaw(["brisket", "--weight", "12"]);
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Thaw plan for Brisket");
		expect(written).toContain("64h");
	});

	it("emits JSON for a thaw plan", async () => {
		await thaw(["tri-tip", "--weight", "3", "--ready", "2026-07-20T12:00:00Z"], {
			json: true,
		});
		const parsed = JSON.parse(logSpy.mock.calls.map((c) => c[0]).join("\n"));
		expect(parsed.meat).toBe("Tri-Tip");
		expect(parsed.startAt).toBe("2026-07-19T17:00:00.000Z");
	});

	it("emits JSON for the profile list", async () => {
		await thaw(["--list"], { json: true });
		const parsed = JSON.parse(logSpy.mock.calls.map((c) => c[0]).join("\n"));
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].meat).toBe("Brisket");
	});

	it("exits with an error for unknown cuts", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		await expect(thaw(["unobtainium", "--weight", "1"])).rejects.toThrow("exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown meat"));
		exitSpy.mockRestore();
	});
});
