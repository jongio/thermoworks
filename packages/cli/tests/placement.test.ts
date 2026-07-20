import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	formatPlacementDetail,
	formatPlacementTable,
	placement,
} from "../src/commands/placement.js";

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

const brisket = {
	meat: "Brisket",
	meatProbe: "Center of the flat",
	pitProbe: "At grate level",
	avoid: ["fat seam", "bone"],
	notes: ["Use a second probe in the point."],
};

describe("formatPlacementTable", () => {
	it("renders a placement row for each cut", () => {
		const out = formatPlacementTable([brisket]);
		expect(out).toContain("Probe placement guide");
		expect(out).toContain("Brisket");
		expect(out).toContain("Center of the flat");
	});
});

describe("formatPlacementDetail", () => {
	it("renders a labeled block for one cut", () => {
		const out = formatPlacementDetail(brisket);
		expect(out).toContain("Meat probe:");
		expect(out).toContain("Pit probe:");
		expect(out).toContain("Avoid:");
		expect(out).toContain("Use a second probe");
	});
});

describe("placement command", () => {
	it("prints a table of every built-in cut", async () => {
		await placement([]);
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Probe placement guide");
		expect(written).toContain("Brisket");
		expect(written).toContain("Pork Butt");
	});

	it("prints details for a single resolved cut", async () => {
		await placement(["brisket"]);
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Brisket");
		expect(written).toContain("Meat probe:");
	});

	it("resolves multi-word aliases", async () => {
		await placement(["pulled", "pork"]);
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Pork Butt");
	});

	it("exits with an error for an unknown meat", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		await expect(placement(["unobtainium"])).rejects.toThrow("exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown meat"));
		exitSpy.mockRestore();
	});

	it("emits a JSON array for the full list", async () => {
		await placement([], { json: true });
		const written = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const parsed = JSON.parse(written);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].meat).toBe("Brisket");
		expect(parsed[0]).toHaveProperty("meatProbe");
	});

	it("emits a JSON object for a single cut", async () => {
		await placement(["brisket"], { json: true });
		const written = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const parsed = JSON.parse(written);
		expect(parsed.meat).toBe("Brisket");
		expect(parsed.meatProbe).toContain("flat");
	});
});
