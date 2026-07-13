import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	formatRecipeList,
	formatSeasoning,
	parseSeasonArgs,
	season,
} from "../src/commands/season.js";

// =============================================================================
// parseSeasonArgs
// =============================================================================

describe("parseSeasonArgs", () => {
	it("parses weight and recipe", () => {
		expect(parseSeasonArgs(["--weight", "12", "--recipe", "coffee"])).toEqual({
			weightLb: 12,
			recipe: "coffee",
			mode: "rub",
		});
	});

	it("accepts a positional weight", () => {
		expect(parseSeasonArgs(["8"])).toEqual({ weightLb: 8, mode: "rub" });
	});

	it("selects wet brine mode", () => {
		expect(parseSeasonArgs(["--weight", "6", "--brine"])).toEqual({
			weightLb: 6,
			mode: "wet-brine",
		});
	});

	it("selects dry brine mode", () => {
		expect(parseSeasonArgs(["--weight", "6", "--dry-brine"])).toEqual({
			weightLb: 6,
			mode: "dry-brine",
		});
	});

	it("rejects brine and dry-brine together", () => {
		expect(parseSeasonArgs(["--weight", "6", "--brine", "--dry-brine"])).toEqual({
			error: expect.stringContaining("cannot be used together"),
		});
	});

	it("rejects a non-positive weight", () => {
		expect(parseSeasonArgs(["--weight", "0"])).toEqual({
			error: expect.stringContaining("--weight"),
		});
	});

	it("rejects an unknown option", () => {
		expect(parseSeasonArgs(["--weight", "6", "--bogus"])).toEqual({
			error: expect.stringContaining("Unknown option"),
		});
	});

	it("parses the list flag", () => {
		expect(parseSeasonArgs(["--list"])).toEqual({ mode: "rub", list: true });
	});
});

// =============================================================================
// formatSeasoning
// =============================================================================

describe("formatSeasoning", () => {
	it("formats a rub with a per-ingredient breakdown", () => {
		const out = formatSeasoning({
			mode: "rub",
			recipe: "classic",
			label: "Classic BBQ",
			weightLb: 6,
			totalTablespoons: 6,
			ingredients: [
				{ name: "paprika", tablespoons: 1.5 },
				{ name: "kosher salt", tablespoons: 0.75 },
			],
		});
		expect(out).toContain("Classic BBQ rub for 6 lb");
		expect(out).toContain("paprika");
		expect(out).toContain("1.5 tbsp");
		// Sub-tablespoon amounts render in teaspoons.
		expect(out).toContain("tsp");
	});

	it("formats a wet brine", () => {
		const out = formatSeasoning({
			mode: "wet-brine",
			weightLb: 8,
			waterQuarts: 8,
			salinityPercent: 5,
			saltGrams: 378,
			saltCups: 2.8,
			sugarGrams: 189,
			minHours: 8,
			maxHours: 12,
		});
		expect(out).toContain("Wet brine for 8 lb");
		expect(out).toContain("Water:  8 qt");
		expect(out).toContain("8 to 12 hours");
	});

	it("formats a dry brine", () => {
		const out = formatSeasoning({
			mode: "dry-brine",
			weightLb: 10,
			saltPercent: 1,
			saltGrams: 45,
			saltTeaspoons: 16,
			minHours: 8,
			maxHours: 48,
		});
		expect(out).toContain("Dry brine for 10 lb");
		expect(out).toContain("45 g");
		expect(out).toContain("8 to 48 hours");
	});
});

describe("formatRecipeList", () => {
	it("lists every built-in recipe", () => {
		const out = formatRecipeList();
		expect(out).toContain("classic");
		expect(out).toContain("texas");
		expect(out).toContain("coffee");
	});
});

// =============================================================================
// season handler
// =============================================================================

describe("season", () => {
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

	it("prints a scaled rub for a weight", async () => {
		await season(["--weight", "6"], { json: false });
		const printed = writeSpy.mock.calls.map((c) => c[0]).join("");
		expect(printed).toContain("rub for 6 lb");
	});

	it("prints a wet brine plan", async () => {
		await season(["--weight", "8", "--brine"], { json: false });
		const printed = writeSpy.mock.calls.map((c) => c[0]).join("");
		expect(printed).toContain("Wet brine for 8 lb");
	});

	it("emits JSON when requested", async () => {
		await season(["--weight", "5", "--dry-brine"], { json: true });
		const logSpy = vi.mocked(console.log);
		const output = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
		expect(output).toMatchObject({ mode: "dry-brine", weightLb: 5 });
	});

	it("lists recipes with --list", async () => {
		await season(["--list"], { json: false });
		const printed = writeSpy.mock.calls.map((c) => c[0]).join("");
		expect(printed).toContain("Built-in rub recipes");
	});

	it("exits when weight is missing", async () => {
		await expect(season([], { json: false })).rejects.toThrow("process.exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--weight is required"));
	});

	it("exits on an unknown recipe", async () => {
		await expect(season(["--weight", "6", "--recipe", "ghost"], { json: false })).rejects.toThrow(
			"process.exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown recipe"));
	});
});
