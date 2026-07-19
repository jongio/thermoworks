import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	formatPortionList,
	formatPortions,
	parsePortionsArgs,
	portions,
} from "../src/commands/portions.js";

describe("parsePortionsArgs", () => {
	it("parses a meat and guest count", () => {
		const parsed = parsePortionsArgs(["brisket", "--guests", "12"]);
		expect(parsed).toEqual({ meat: "brisket", guests: 12 });
	});

	it("parses an appetite", () => {
		const parsed = parsePortionsArgs(["brisket", "--guests", "8", "--appetite", "hearty"]);
		expect(parsed).toMatchObject({ meat: "brisket", guests: 8, appetite: "hearty" });
	});

	it("parses a per-person serving", () => {
		const parsed = parsePortionsArgs(["brisket", "--guests", "8", "--per-person", "5"]);
		expect(parsed).toMatchObject({ meat: "brisket", guests: 8, perPersonOz: 5 });
	});

	it("parses the list flag", () => {
		const parsed = parsePortionsArgs(["--list"]);
		expect(parsed).toEqual({ list: true });
	});

	it("rejects a missing guest value", () => {
		const parsed = parsePortionsArgs(["brisket", "--guests"]);
		expect(parsed).toEqual({ error: "--guests requires a count" });
	});

	it("rejects a non-numeric guest count", () => {
		const parsed = parsePortionsArgs(["brisket", "--guests", "lots"]);
		expect("error" in parsed).toBe(true);
	});

	it("rejects a zero guest count", () => {
		const parsed = parsePortionsArgs(["brisket", "--guests", "0"]);
		expect("error" in parsed).toBe(true);
	});

	it("rejects an unknown appetite", () => {
		const parsed = parsePortionsArgs(["brisket", "--guests", "8", "--appetite", "ravenous"]);
		expect("error" in parsed).toBe(true);
	});

	it("rejects a non-positive per-person value", () => {
		const parsed = parsePortionsArgs(["brisket", "--guests", "8", "--per-person", "0"]);
		expect("error" in parsed).toBe(true);
	});

	it("rejects appetite and per-person together", () => {
		const parsed = parsePortionsArgs([
			"brisket",
			"--guests",
			"8",
			"--appetite",
			"light",
			"--per-person",
			"5",
		]);
		expect(parsed).toEqual({
			error: "--appetite and --per-person cannot be used together",
		});
	});

	it("rejects an unknown option", () => {
		const parsed = parsePortionsArgs(["brisket", "--extra"]);
		expect(parsed).toEqual({ error: "Unknown option: --extra" });
	});

	it("rejects a second positional argument", () => {
		const parsed = parsePortionsArgs(["brisket", "pork"]);
		expect(parsed).toEqual({ error: "Unexpected argument: pork" });
	});
});

describe("formatPortions", () => {
	it("shows the raw weight to buy", () => {
		const text = formatPortions({
			meat: "Brisket",
			guests: 12,
			servingOz: 6,
			appetite: "standard",
			yieldPercent: 50,
			cookedLb: 4.5,
			rawLb: 9,
		});
		expect(text).toContain("Brisket for 12 guests");
		expect(text).toContain("9 lb raw");
		expect(text).toContain("50%");
		expect(text).toContain("standard");
	});

	it("omits the preset name for a custom serving", () => {
		const text = formatPortions({
			meat: "Brisket",
			guests: 10,
			servingOz: 5,
			appetite: null,
			yieldPercent: 50,
			cookedLb: 3.13,
			rawLb: 6.25,
		});
		expect(text).toContain("5 oz per person");
		expect(text).not.toContain("(standard)");
	});
});

describe("formatPortionList", () => {
	it("lists the cuts and appetite presets", () => {
		const text = formatPortionList();
		expect(text).toContain("Brisket");
		expect(text).toContain("Appetite presets");
		expect(text).toContain("standard");
	});
});

describe("portions handler", () => {
	let stdout: string;
	let stderr: string;
	let writeSpy: ReturnType<typeof vi.spyOn>;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		stdout = "";
		stderr = "";
		writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
			stdout += String(chunk);
			return true;
		});
		logSpy = vi.spyOn(console, "log").mockImplementation((msg) => {
			stdout += `${String(msg)}\n`;
		});
		errSpy = vi.spyOn(console, "error").mockImplementation((msg) => {
			stderr += `${String(msg)}\n`;
		});
		exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
			throw new Error(`exit:${code}`);
		});
	});

	afterEach(() => {
		writeSpy.mockRestore();
		logSpy.mockRestore();
		errSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it("prints a plan for a meat and guest count", async () => {
		await portions(["brisket", "--guests", "12"], { json: false });
		expect(stdout).toContain("Brisket for 12 guests");
		expect(stdout).toContain("9 lb raw");
	});

	it("emits JSON when requested", async () => {
		await portions(["brisket", "--guests", "12"], { json: true });
		const parsed = JSON.parse(stdout);
		expect(parsed.meat).toBe("Brisket");
		expect(parsed.rawLb).toBe(9);
	});

	it("lists yields with --list", async () => {
		await portions(["--list"], { json: false });
		expect(stdout).toContain("Brisket");
		expect(stdout).toContain("Appetite presets");
	});

	it("emits list JSON with --list --json", async () => {
		await portions(["--list"], { json: true });
		const parsed = JSON.parse(stdout);
		expect(Array.isArray(parsed.yields)).toBe(true);
		expect(Array.isArray(parsed.appetites)).toBe(true);
	});

	it("exits non-zero on an unknown cut", async () => {
		await expect(portions(["unicorn", "--guests", "4"], { json: false })).rejects.toThrow("exit:1");
		expect(stderr).toContain("Unknown meat");
	});

	it("exits non-zero when guests is missing", async () => {
		await expect(portions(["brisket"], { json: false })).rejects.toThrow("exit:1");
		expect(stderr).toContain("--guests is required");
	});

	it("exits non-zero when the meat is missing", async () => {
		await expect(portions(["--guests", "4"], { json: false })).rejects.toThrow("exit:1");
		expect(stderr).toContain("meat is required");
	});
});
