import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	mkdir: vi.fn(),
}));

import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { JournalEntry } from "../src/journal.js";

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

function sampleEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
	return {
		id: "abc123",
		createdAt: "2026-01-01T12:00:00.000Z",
		title: "Sunday brisket",
		...overrides,
	};
}

beforeEach(() => {
	mockMkdir.mockResolvedValue(undefined as never);
	mockWriteFile.mockResolvedValue(undefined as never);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe("loadJournal", () => {
	it("returns empty list when file does not exist", async () => {
		mockReadFile.mockRejectedValue(new Error("ENOENT"));
		const { loadJournal } = await import("../src/journal.js");
		expect(await loadJournal()).toEqual([]);
	});

	it("returns empty list and warns when file is corrupt", async () => {
		mockReadFile.mockResolvedValue("{not json" as never);
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { loadJournal } = await import("../src/journal.js");
		expect(await loadJournal()).toEqual([]);
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("corrupted"));
	});

	it("returns empty list and warns when root is not an array", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ nope: true }) as never);
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { loadJournal } = await import("../src/journal.js");
		expect(await loadJournal()).toEqual([]);
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("invalid format"));
	});

	it("filters out entries that are missing required fields", async () => {
		const data = [sampleEntry(), { id: "x" }, { title: "no id" }, "string"];
		mockReadFile.mockResolvedValue(JSON.stringify(data) as never);
		const { loadJournal } = await import("../src/journal.js");
		const entries = await loadJournal();
		expect(entries).toHaveLength(1);
		expect(entries[0]?.id).toBe("abc123");
	});
});

describe("saveJournal", () => {
	it("creates the directory with mode 0o700 and writes with mode 0o600", async () => {
		const { saveJournal } = await import("../src/journal.js");
		await saveJournal([sampleEntry()]);
		expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining(".thermoworks"), {
			recursive: true,
			mode: 0o700,
		});
		expect(mockWriteFile).toHaveBeenCalledWith(
			expect.stringContaining("journal.json"),
			expect.any(String),
			{ encoding: "utf8", mode: 0o600 },
		);
	});

	it("writes pretty-printed JSON with a trailing newline", async () => {
		const { saveJournal } = await import("../src/journal.js");
		const entries = [sampleEntry()];
		await saveJournal(entries);
		const written = mockWriteFile.mock.calls[0]?.[1] as string;
		expect(written).toBe(`${JSON.stringify(entries, null, 2)}\n`);
	});
});

describe("addEntry", () => {
	it("assigns a stable id and created timestamp and persists", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify([]) as never);
		const { addEntry } = await import("../src/journal.js");
		const entry = await addEntry({ title: "Ribs", meat: "pork ribs", rating: 5 });
		expect(entry.id).toMatch(/^[a-z0-9]{6}$/);
		expect(new Date(entry.createdAt).toString()).not.toBe("Invalid Date");
		expect(entry.title).toBe("Ribs");
		expect(entry.rating).toBe(5);
		expect(mockWriteFile).toHaveBeenCalledTimes(1);
	});

	it("appends to existing entries without collision", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify([sampleEntry()]) as never);
		const { addEntry } = await import("../src/journal.js");
		const entry = await addEntry({ title: "Second" });
		expect(entry.id).not.toBe("abc123");
		const written = mockWriteFile.mock.calls[0]?.[1] as string;
		const parsed = JSON.parse(written) as JournalEntry[];
		expect(parsed).toHaveLength(2);
	});
});

describe("getEntry", () => {
	it("returns the entry when it exists", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify([sampleEntry()]) as never);
		const { getEntry } = await import("../src/journal.js");
		expect((await getEntry("abc123"))?.title).toBe("Sunday brisket");
	});

	it("returns undefined when the id is unknown", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify([sampleEntry()]) as never);
		const { getEntry } = await import("../src/journal.js");
		expect(await getEntry("missing")).toBeUndefined();
	});
});

describe("removeEntry", () => {
	it("removes an existing entry and returns true", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify([sampleEntry()]) as never);
		const { removeEntry } = await import("../src/journal.js");
		expect(await removeEntry("abc123")).toBe(true);
		const written = mockWriteFile.mock.calls[0]?.[1] as string;
		expect(JSON.parse(written)).toEqual([]);
	});

	it("returns false and does not write when the id is unknown", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify([sampleEntry()]) as never);
		const { removeEntry } = await import("../src/journal.js");
		expect(await removeEntry("missing")).toBe(false);
		expect(mockWriteFile).not.toHaveBeenCalled();
	});
});

describe("parseAddArgs", () => {
	it("requires a title", async () => {
		const { parseAddArgs } = await import("../src/commands/journal.js");
		expect(parseAddArgs([])).toEqual({ error: "--title is required" });
	});

	it("parses all supported flags", async () => {
		const { parseAddArgs } = await import("../src/commands/journal.js");
		const result = parseAddArgs([
			"--title",
			"Sunday brisket",
			"--meat",
			"brisket",
			"--weight",
			"12.5",
			"--rating",
			"4",
			"--notes",
			"Wrapped at 165",
			"--device",
			"M100",
			"--archive",
			"a1",
		]);
		expect(result).toEqual({
			title: "Sunday brisket",
			meat: "brisket",
			weightLb: 12.5,
			rating: 4,
			notes: "Wrapped at 165",
			device: "M100",
			archive: "a1",
		});
	});

	it("rejects a rating outside 1 to 5", async () => {
		const { parseAddArgs } = await import("../src/commands/journal.js");
		expect(parseAddArgs(["--title", "x", "--rating", "9"])).toHaveProperty("error");
		expect(parseAddArgs(["--title", "x", "--rating", "0"])).toHaveProperty("error");
	});

	it("rejects a non-positive weight", async () => {
		const { parseAddArgs } = await import("../src/commands/journal.js");
		expect(parseAddArgs(["--title", "x", "--weight", "-3"])).toHaveProperty("error");
		expect(parseAddArgs(["--title", "x", "--weight", "abc"])).toHaveProperty("error");
	});

	it("rejects unknown options", async () => {
		const { parseAddArgs } = await import("../src/commands/journal.js");
		expect(parseAddArgs(["--title", "x", "--bogus"])).toEqual({ error: "Unknown option: --bogus" });
	});
});

describe("formatList", () => {
	it("shows a hint when empty", async () => {
		const { formatList } = await import("../src/commands/journal.js");
		expect(formatList([])).toContain("No journal entries yet");
	});

	it("lists newest first", async () => {
		const { formatList } = await import("../src/commands/journal.js");
		const out = formatList([
			sampleEntry({ id: "old", createdAt: "2026-01-01T00:00:00.000Z", title: "Old" }),
			sampleEntry({ id: "new", createdAt: "2026-02-01T00:00:00.000Z", title: "New" }),
		]);
		expect(out.indexOf("New")).toBeLessThan(out.indexOf("Old"));
	});
});

describe("formatEntry", () => {
	it("includes optional fields when present", async () => {
		const { formatEntry } = await import("../src/commands/journal.js");
		const out = formatEntry(
			sampleEntry({ meat: "brisket", weightLb: 12, rating: 4, notes: "good", device: "M1" }),
		);
		expect(out).toContain("brisket");
		expect(out).toContain("12 lb");
		expect(out).toContain("4/5");
		expect(out).toContain("good");
		expect(out).toContain("M1");
	});

	it("omits optional fields when absent", async () => {
		const { formatEntry } = await import("../src/commands/journal.js");
		const out = formatEntry(sampleEntry());
		expect(out).not.toContain("Meat:");
		expect(out).not.toContain("Rating:");
	});
});

describe("parseAddArgs cost flags", () => {
	it("parses --cost-meat and --cost-fuel", async () => {
		const { parseAddArgs } = await import("../src/commands/journal.js");
		const result = parseAddArgs(["--title", "Brisket", "--cost-meat", "42.50", "--cost-fuel", "8"]);
		expect(result).toEqual({ title: "Brisket", costMeat: 42.5, costFuel: 8 });
	});

	it("allows a zero cost", async () => {
		const { parseAddArgs } = await import("../src/commands/journal.js");
		expect(parseAddArgs(["--title", "x", "--cost-fuel", "0"])).toEqual({
			title: "x",
			costFuel: 0,
		});
	});

	it("rejects a negative cost", async () => {
		const { parseAddArgs } = await import("../src/commands/journal.js");
		expect(parseAddArgs(["--title", "x", "--cost-meat", "-5"])).toHaveProperty("error");
		expect(parseAddArgs(["--title", "x", "--cost-fuel", "nope"])).toHaveProperty("error");
	});
});

describe("formatEntry cost lines", () => {
	it("shows meat, fuel, total, and per-lb when priced with a weight", async () => {
		const { formatEntry } = await import("../src/commands/journal.js");
		const out = formatEntry(sampleEntry({ weightLb: 10, costMeat: 40, costFuel: 10 }));
		expect(out).toContain("Meat $:  40.00");
		expect(out).toContain("Fuel $:  10.00");
		expect(out).toContain("Total $: 50.00");
		expect(out).toContain("5.00/lb");
	});

	it("omits per-lb when there is no weight", async () => {
		const { formatEntry } = await import("../src/commands/journal.js");
		const out = formatEntry(sampleEntry({ costMeat: 40 }));
		expect(out).toContain("Total $: 40.00");
		expect(out).not.toContain("/lb");
	});

	it("omits cost lines entirely when there is no cost", async () => {
		const { formatEntry } = await import("../src/commands/journal.js");
		const out = formatEntry(sampleEntry({ weightLb: 10 }));
		expect(out).not.toContain("Total $:");
		expect(out).not.toContain("Meat $:");
	});
});

describe("entryTotalCost", () => {
	it("sums meat and fuel", async () => {
		const { entryTotalCost } = await import("../src/commands/journal.js");
		expect(entryTotalCost(sampleEntry({ costMeat: 30, costFuel: 6 }))).toBe(36);
	});

	it("treats a missing side as zero", async () => {
		const { entryTotalCost } = await import("../src/commands/journal.js");
		expect(entryTotalCost(sampleEntry({ costFuel: 6 }))).toBe(6);
	});

	it("returns null when there is no cost", async () => {
		const { entryTotalCost } = await import("../src/commands/journal.js");
		expect(entryTotalCost(sampleEntry())).toBeNull();
	});
});

describe("summarizeCosts", () => {
	it("aggregates totals and cost per lb over costed, weighted cooks", async () => {
		const { summarizeCosts } = await import("../src/commands/journal.js");
		const summary = summarizeCosts([
			sampleEntry({ id: "a", weightLb: 10, costMeat: 40, costFuel: 10 }),
			sampleEntry({ id: "b", weightLb: 5, costMeat: 20 }),
			sampleEntry({ id: "c", rating: 5 }),
		]);
		expect(summary.cooks).toBe(2);
		expect(summary.totalMeat).toBe(60);
		expect(summary.totalFuel).toBe(10);
		expect(summary.total).toBe(70);
		expect(summary.weightedLb).toBe(15);
		// (50 + 20) / 15 = 4.666...
		expect(summary.costPerLb).toBeCloseTo(70 / 15);
	});

	it("leaves cost per lb null when no costed cook has a weight", async () => {
		const { summarizeCosts } = await import("../src/commands/journal.js");
		const summary = summarizeCosts([sampleEntry({ costMeat: 25 })]);
		expect(summary.cooks).toBe(1);
		expect(summary.total).toBe(25);
		expect(summary.costPerLb).toBeNull();
	});

	it("returns zeros when there are no costs", async () => {
		const { summarizeCosts } = await import("../src/commands/journal.js");
		const summary = summarizeCosts([sampleEntry(), sampleEntry({ id: "z", rating: 3 })]);
		expect(summary.cooks).toBe(0);
		expect(summary.total).toBe(0);
		expect(summary.costPerLb).toBeNull();
	});
});

describe("formatCostSummary", () => {
	it("shows a hint when nothing is logged", async () => {
		const { formatCostSummary, summarizeCosts } = await import("../src/commands/journal.js");
		const out = formatCostSummary(summarizeCosts([]));
		expect(out).toContain("No cook costs logged yet");
	});

	it("shows totals and per-lb when costs exist", async () => {
		const { formatCostSummary, summarizeCosts } = await import("../src/commands/journal.js");
		const out = formatCostSummary(
			summarizeCosts([sampleEntry({ weightLb: 10, costMeat: 40, costFuel: 10 })]),
		);
		expect(out).toContain("across 1 cook");
		expect(out).toContain("Total:  50.00");
		expect(out).toContain("Per lb: 5.00");
	});
});
