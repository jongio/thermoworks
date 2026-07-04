import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	formatMeatList,
	formatPlan,
	parseItemSpec,
	parsePlanArgs,
	parseReadyTime,
	plan,
} from "../src/commands/plan.js";

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

describe("parseReadyTime", () => {
	const now = new Date("2026-01-15T08:00:00");

	it("parses 12-hour time with meridiem", () => {
		const d = parseReadyTime("6:00 PM", now);
		expect(d?.getHours()).toBe(18);
		expect(d?.getMinutes()).toBe(0);
	});

	it("parses compact pm form", () => {
		expect(parseReadyTime("6pm", now)?.getHours()).toBe(18);
	});

	it("parses 24-hour time", () => {
		const d = parseReadyTime("18:30", now);
		expect(d?.getHours()).toBe(18);
		expect(d?.getMinutes()).toBe(30);
	});

	it("handles 12 AM as midnight and 12 PM as noon", () => {
		expect(parseReadyTime("12am", now)?.getHours()).toBe(0);
		expect(parseReadyTime("12pm", now)?.getHours()).toBe(12);
	});

	it("rolls to the next day when the time already passed", () => {
		const d = parseReadyTime("6:00 AM", now); // 6 AM already passed at 8 AM
		expect(d?.getDate()).toBe(16);
	});

	it("parses a full ISO date-time", () => {
		const d = parseReadyTime("2026-02-01T17:00:00");
		expect(d?.getFullYear()).toBe(2026);
	});

	it("returns null for garbage", () => {
		expect(parseReadyTime("later")).toBeNull();
		expect(parseReadyTime("25:99", now)).toBeNull();
	});
});

describe("parseItemSpec", () => {
	it("parses a bare meat name", () => {
		expect(parseItemSpec("ribs")).toEqual({ meat: "ribs" });
	});

	it("parses NAME=WEIGHT as pounds", () => {
		expect(parseItemSpec("brisket=12")).toEqual({ meat: "brisket", weightLb: 12 });
	});

	it("parses NAME=Nh as explicit hours", () => {
		expect(parseItemSpec("wings=1.5h")).toEqual({ label: "wings", hours: 1.5 });
	});

	it("returns null for empty or malformed specs", () => {
		expect(parseItemSpec("")).toBeNull();
		expect(parseItemSpec("brisket=")).toBeNull();
		expect(parseItemSpec("brisket=abc")).toBeNull();
		expect(parseItemSpec("brisket=-3")).toBeNull();
	});
});

describe("parsePlanArgs", () => {
	it("returns listMeats when --list-meats is present", () => {
		expect(parsePlanArgs(["--list-meats"])).toEqual({ listMeats: true });
	});

	it("returns null (usage) when --ready is missing", () => {
		expect(parsePlanArgs(["--item", "ribs"])).toBeNull();
	});

	it("parses ready time and items", () => {
		const result = parsePlanArgs(["--ready", "6:00 PM", "--item", "brisket=12", "--item", "ribs"]);
		expect(result && "items" in result).toBe(true);
		if (result && "items" in result) {
			expect(result.items).toHaveLength(2);
		}
	});

	it("exits when no items are given", () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		expect(() => parsePlanArgs(["--ready", "6:00 PM"])).toThrow("exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("at least one --item"));
		exitSpy.mockRestore();
	});

	it("exits on an unparseable ready time", () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		expect(() => parsePlanArgs(["--ready", "whenever", "--item", "ribs"])).toThrow("exit");
		exitSpy.mockRestore();
	});

	it("exits on an unknown option", () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		expect(() => parsePlanArgs(["--nope"])).toThrow("exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown option"));
		exitSpy.mockRestore();
	});
});

describe("formatPlan", () => {
	it("renders a timeline with a header and rows", () => {
		const ready = new Date("2026-01-15T18:00:00");
		const out = formatPlan({
			readyAt: ready,
			items: [
				{
					label: "Brisket",
					meat: "Brisket",
					cookMinutes: 900,
					restMinutes: 60,
					startAt: new Date("2026-01-15T02:00:00"),
					removeAt: new Date("2026-01-15T17:00:00"),
					readyAt: ready,
				},
			],
		});
		expect(out).toContain("Cook plan");
		expect(out).toContain("Brisket");
		expect(out).toContain("Start");
		expect(out).toContain("15h");
	});
});

describe("formatMeatList", () => {
	it("lists the built-in profiles", () => {
		const out = formatMeatList();
		expect(out).toContain("Brisket");
		expect(out).toContain("h/lb");
		expect(out).toContain("Pit");
	});
});

describe("plan command", () => {
	it("prints usage when called with no ready time", async () => {
		await plan([]);
		expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Usage: thermoworks plan"));
	});

	it("prints the meat list for --list-meats", async () => {
		await plan(["--list-meats"]);
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Brisket");
	});

	it("emits JSON meat profiles for --list-meats --json", async () => {
		await plan(["--list-meats"], { json: true });
		const written = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const parsed = JSON.parse(written);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0].name).toBe("Brisket");
	});

	it("prints a timeline for a valid plan", async () => {
		await plan(["--ready", "6:00 PM", "--item", "brisket=12", "--item", "ribs"]);
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Cook plan");
		expect(written).toContain("Brisket");
		expect(written).toContain("Pork Ribs");
	});

	it("emits JSON for a valid plan with --json", async () => {
		await plan(["--ready", "6:00 PM", "--item", "brisket=10"], { json: true });
		const written = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const parsed = JSON.parse(written);
		expect(parsed.items).toHaveLength(1);
		expect(parsed.items[0].meat).toBe("Brisket");
	});

	it("exits with an error for an unknown meat", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		await expect(plan(["--ready", "6:00 PM", "--item", "unobtainium"])).rejects.toThrow("exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown meat"));
		exitSpy.mockRestore();
	});
});
