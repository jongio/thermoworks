import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { alarmSuggest, buildAlarmSuggestion } from "../src/commands/alarm-suggest.js";

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
	name: "Brisket",
	hoursPerPound: 1.25,
	fixedHours: null,
	restMinutes: 60,
	pitTempF: 250,
	targetTempF: 203,
	doneness: "Probe-tender",
};

const ribs = {
	name: "Pork Ribs",
	hoursPerPound: null,
	fixedHours: 5.5,
	restMinutes: 15,
	pitTempF: 250,
	targetTempF: null,
	doneness: "Bend test",
};

describe("buildAlarmSuggestion", () => {
	it("centers the pit band on the reference pit temperature", () => {
		const s = buildAlarmSuggestion(brisket, { pitBand: 25 });
		expect(s.pit.target).toBe(250);
		expect(s.pit.low).toBe(225);
		expect(s.pit.high).toBe(275);
		expect(s.pit.band).toBe(25);
	});

	it("sets the meat probe high alarm to the pull temperature", () => {
		const s = buildAlarmSuggestion(brisket, { pitBand: 25 });
		expect(s.meatProbe.high).toBe(203);
	});

	it("leaves the meat probe alarm empty for by-feel cuts", () => {
		const s = buildAlarmSuggestion(ribs, { pitBand: 25 });
		expect(s.meatProbe.high).toBeNull();
		// Only the pit command should be emitted when there is no pull temp.
		expect(s.commands).toHaveLength(1);
		expect(s.commands[0]).toContain("--channel <PIT_CH>");
	});

	it("honors a custom pit band", () => {
		const s = buildAlarmSuggestion(brisket, { pitBand: 40 });
		expect(s.pit.low).toBe(210);
		expect(s.pit.high).toBe(290);
	});

	it("uses placeholders when serial and channels are omitted", () => {
		const s = buildAlarmSuggestion(brisket, { pitBand: 25 });
		expect(s.commands[0]).toContain("<SERIAL>");
		expect(s.commands[0]).toContain("<MEAT_CH>");
		expect(s.commands[1]).toContain("<PIT_CH>");
	});

	it("fills in serial and channels when provided", () => {
		const s = buildAlarmSuggestion(brisket, {
			pitBand: 25,
			serial: "ABC123",
			meatChannel: 1,
			pitChannel: 2,
		});
		expect(s.commands[0]).toBe("thermoworks alarm set ABC123 --channel 1 --high 203");
		expect(s.commands[1]).toBe("thermoworks alarm set ABC123 --channel 2 --high 275 --low 225");
	});
});

describe("alarmSuggest command", () => {
	it("prints suggestions for a resolved cut", async () => {
		await alarmSuggest(["brisket"], { json: false });
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Alarm suggestions for Brisket");
		expect(written).toContain("203\u00B0F");
		expect(written).toContain("Pit band:");
		expect(written).toContain("thermoworks alarm set");
	});

	it("resolves aliases", async () => {
		await alarmSuggest(["pulled pork"], { json: false });
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("Pork Butt");
	});

	it("notes cook-by-feel cuts with no numeric target", async () => {
		await alarmSuggest(["ribs"], { json: false });
		const written = stdoutWriteSpy.mock.calls[0]?.[0] as string;
		expect(written).toContain("judge this cut by feel");
	});

	it("emits a JSON object with --json", async () => {
		await alarmSuggest(["brisket"], { json: true });
		const written = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const parsed = JSON.parse(written);
		expect(parsed.meat).toBe("Brisket");
		expect(parsed.pit.low).toBe(225);
		expect(parsed.pit.high).toBe(275);
		expect(parsed.meatProbe.high).toBe(203);
	});

	it("fills commands from --serial and channel flags", async () => {
		await alarmSuggest(
			["brisket", "--serial", "ABC123", "--meat-channel", "1", "--pit-channel", "2"],
			{ json: true },
		);
		const written = logSpy.mock.calls.map((c) => c[0]).join("\n");
		const parsed = JSON.parse(written);
		expect(parsed.commands[0]).toContain("ABC123");
		expect(parsed.commands[0]).toContain("--channel 1");
		expect(parsed.commands[1]).toContain("--channel 2");
	});

	it("exits with an error for an unknown meat", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		await expect(alarmSuggest(["unobtainium"], { json: false })).rejects.toThrow("exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown meat"));
		exitSpy.mockRestore();
	});

	it("exits with an error when no meat is given", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		await expect(alarmSuggest([], { json: false })).rejects.toThrow("exit");
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
		exitSpy.mockRestore();
	});

	it("rejects an invalid pit band", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("exit");
		});
		await expect(alarmSuggest(["brisket", "--pit-band", "-5"], { json: false })).rejects.toThrow(
			"exit",
		);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--pit-band"));
		exitSpy.mockRestore();
	});
});
