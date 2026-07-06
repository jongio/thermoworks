import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { doneness, formatDonenessDetail, formatDonenessTable } from "../src/commands/doneness.js";

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

describe("formatDonenessTable", () => {
	it("renders a header and a pull temperature per cut", () => {
		const out = formatDonenessTable([
			{
				name: "Brisket",
				hoursPerPound: 1.25,
				fixedHours: null,
				restMinutes: 60,
				pitTempF: 250,
				targetTempF: 203,
				doneness: "Probe-tender",
			},
		]);
		expect(out).toContain("Pull at");
		expect(out).toContain("Brisket");
		expect(out).toContain("203\u00B0F");
		expect(out).toContain("Probe-tender");
	});

	it("shows 'By feel' for cuts with no target temperature", () => {
		const out = formatDonenessTable([
			{
				name: "Pork Ribs",
				hoursPerPound: null,
				fixedHours: 5.5,
				restMinutes: 15,
				pitTempF: 250,
				targetTempF: null,
				doneness: "Bend test",
			},
		]);
		expect(out).toContain("By feel");
	});
});

describe("formatDonenessDetail", () => {
	it("renders a labeled block for one cut", () => {
		const out = formatDonenessDetail({
			name: "Whole Chicken",
			hoursPerPound: null,
			fixedHours: 3.5,
			restMinutes: 15,
			pitTempF: 275,
			targetTempF: 165,
			doneness: "165\u00B0F in the breast",
		});
		expect(out).toContain("Whole Chicken");
		expect(out).toContain("Pull at:");
		expect(out).toContain("165\u00B0F");
		expect(out).toContain("Cook time: 3.5 h");
	});
});

describe("doneness command", () => {
	it("prints a table of every built-in cut", async () => {
		await doneness(undefined);
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Doneness guide");
		expect(written).toContain("Brisket");
		expect(written).toContain("Pork Butt");
	});

	it("prints details for a single resolved cut", async () => {
		await doneness("brisket");
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Brisket");
		expect(written).toContain("Pull at:");
	});

	it("resolves aliases", async () => {
		await doneness("pulled pork");
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Pork Butt");
	});

	it("exits with an error for an unknown meat", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		await expect(doneness("unobtainium")).rejects.toThrow("exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown meat"));
		exitSpy.mockRestore();
	});

	it("emits a JSON array for the full list", async () => {
		await doneness(undefined, { json: true });
		const written = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const parsed = JSON.parse(written);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].name).toBe("Brisket");
		expect(parsed[0]).toHaveProperty("targetTempF");
	});

	it("emits a JSON object for a single cut", async () => {
		await doneness("brisket", { json: true });
		const written = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const parsed = JSON.parse(written);
		expect(parsed.name).toBe("Brisket");
		expect(parsed.targetTempF).toBe(203);
	});
});
