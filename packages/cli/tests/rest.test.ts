import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRestPlan, parseRestArgs, rest } from "../src/commands/rest.js";

describe("parseRestArgs", () => {
	it("parses quoted or split meat names and weight", () => {
		expect(parseRestArgs(["pork", "butt", "--weight", "8"])).toEqual({
			meat: "pork butt",
			weightLb: 8,
		});
	});

	it("rejects a non-positive weight", () => {
		expect(parseRestArgs(["brisket", "--weight", "0"])).toEqual({
			error: expect.stringContaining("--weight"),
		});
	});

	it("rejects unknown options", () => {
		expect(parseRestArgs(["brisket", "--slow"])).toEqual({
			error: expect.stringContaining("Unknown option"),
		});
	});
});

describe("formatRestPlan", () => {
	it("formats rest window, serving range, holding method, and steps", () => {
		const out = formatRestPlan({
			meat: "Brisket",
			weightLb: 12,
			minMinutes: 75,
			maxMinutes: 300,
			servingTemperatureF: { minF: 150, maxF: 165 },
			holdMethod: "Keep it wrapped.",
			note: "Slice after the flat relaxes.",
			steps: ["Vent briefly.", "Hold wrapped."],
		});

		expect(out).toContain("Rest plan for Brisket (12 lb)");
		expect(out).toContain("75 to 300 minutes");
		expect(out).toContain("150-165°F internal");
		expect(out).toContain("1. Vent briefly.");
	});
});

describe("rest", () => {
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

	it("prints a rest plan", async () => {
		await rest(["brisket", "--weight", "12"], { json: false });
		const printed = writeSpy.mock.calls.map((c) => c[0]).join("");

		expect(printed).toContain("Rest plan for Brisket");
		expect(printed).toContain("Window:");
	});

	it("emits JSON when requested", async () => {
		await rest(["baby", "back"], { json: true });
		const logSpy = vi.mocked(console.log);
		const output = JSON.parse(logSpy.mock.calls[0]?.[0] as string);

		expect(output).toMatchObject({ meat: "Baby Back Ribs", minMinutes: 10 });
	});

	it("exits when meat is missing", async () => {
		await expect(rest([], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("exits when meat is unknown", async () => {
		await expect(rest(["moon", "roast"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown meat"));
	});
});
