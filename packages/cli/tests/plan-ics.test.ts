import { planCook } from "thermoworks-sdk";
import { describe, expect, it } from "vitest";

import {
	escapeIcsText,
	foldIcsLine,
	formatIcs,
	formatIcsTimestamp,
	parsePlanArgs,
} from "../src/commands/plan.js";

describe("escapeIcsText", () => {
	it("escapes backslashes, semicolons, commas, and newlines", () => {
		expect(escapeIcsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
	});

	it("normalizes CRLF to an escaped newline", () => {
		expect(escapeIcsText("line1\r\nline2")).toBe("line1\\nline2");
	});

	it("leaves plain text untouched", () => {
		expect(escapeIcsText("Brisket")).toBe("Brisket");
	});
});

describe("formatIcsTimestamp", () => {
	it("renders a UTC basic-format timestamp with a Z suffix", () => {
		const date = new Date(Date.UTC(2026, 0, 15, 18, 30, 5));
		expect(formatIcsTimestamp(date)).toBe("20260115T183005Z");
	});

	it("zero-pads single-digit components", () => {
		const date = new Date(Date.UTC(2026, 8, 3, 4, 6, 9));
		expect(formatIcsTimestamp(date)).toBe("20260903T040609Z");
	});
});

describe("foldIcsLine", () => {
	it("leaves short lines unchanged", () => {
		expect(foldIcsLine("SUMMARY:Cook Brisket")).toBe("SUMMARY:Cook Brisket");
	});

	it("folds long lines at 75 octets with a leading-space continuation", () => {
		const long = `DESCRIPTION:${"x".repeat(120)}`;
		const folded = foldIcsLine(long);
		const parts = folded.split("\r\n");
		expect(parts.length).toBeGreaterThan(1);
		expect(Buffer.from(parts[0] ?? "", "utf8").length).toBeLessThanOrEqual(75);
		for (const part of parts.slice(1)) {
			expect(part.startsWith(" ")).toBe(true);
		}
		// Unfolding restores the original content.
		const unfolded = parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("");
		expect(unfolded).toBe(long);
	});

	it("does not split multi-byte UTF-8 sequences across a fold", () => {
		const long = `DESCRIPTION:${"\u00e9".repeat(60)}`;
		const folded = foldIcsLine(long);
		for (const part of folded.split("\r\n")) {
			const content = part.startsWith(" ") ? part.slice(1) : part;
			// A valid UTF-8 round-trip means no replacement characters were introduced.
			expect(content).not.toContain("\ufffd");
		}
	});
});

describe("formatIcs", () => {
	const readyAt = new Date(Date.UTC(2026, 0, 15, 23, 0, 0));
	const now = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));

	function buildPlan() {
		return planCook([{ meat: "Brisket", weightLb: 10 }, { meat: "Pork Ribs" }], { readyAt });
	}

	it("produces a well-formed VCALENDAR wrapper with CRLF line endings", () => {
		const ics = formatIcs(buildPlan(), now);
		expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
		expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
		expect(ics).toContain("VERSION:2.0");
		expect(ics).toContain("PRODID:-//ThermoWorks CLI//Cook Plan//EN");
		// Every line ends with CRLF.
		expect(ics.split("\r\n").length).toBeGreaterThan(10);
		expect(ics).not.toMatch(/[^\r]\n/);
	});

	it("emits one VEVENT per item plus a serve event", () => {
		const ics = formatIcs(buildPlan(), now);
		const eventCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
		expect(eventCount).toBe(3);
		expect(ics).toContain("SUMMARY:Cook Brisket");
		expect(ics).toContain("SUMMARY:Serve: everything ready");
	});

	it("includes a reminder alarm for each cook event", () => {
		const ics = formatIcs(buildPlan(), now);
		const alarmCount = (ics.match(/BEGIN:VALARM/g) ?? []).length;
		expect(alarmCount).toBe(3);
		expect(ics).toContain("TRIGGER:-PT15M");
	});

	it("uses the shared ready time for the serve event start", () => {
		const ics = formatIcs(buildPlan(), now);
		expect(ics).toContain(`DTSTART:${formatIcsTimestamp(readyAt)}`);
	});

	it("gives each event a unique UID", () => {
		const ics = formatIcs(buildPlan(), now);
		const uids = [...ics.matchAll(/UID:(.+)/g)].map((m) => m[1]?.trim());
		expect(new Set(uids).size).toBe(uids.length);
	});
});

describe("parsePlanArgs --ics", () => {
	it("captures a file path argument", () => {
		const parsed = parsePlanArgs([
			"--ready",
			"6:00 PM",
			"--item",
			"brisket=10",
			"--ics",
			"cook.ics",
		]);
		expect(parsed).not.toBeNull();
		if (parsed && !("listMeats" in parsed)) {
			expect(parsed.ics).toBe("cook.ics");
		}
	});

	it("defaults to stdout when no path follows", () => {
		const parsed = parsePlanArgs(["--ready", "6:00 PM", "--item", "brisket=10", "--ics"]);
		if (parsed && !("listMeats" in parsed)) {
			expect(parsed.ics).toBe(true);
		}
	});

	it("does not treat a following flag as the ics path", () => {
		const parsed = parsePlanArgs(["--ready", "6:00 PM", "--ics", "--item", "brisket=10"]);
		if (parsed && !("listMeats" in parsed)) {
			expect(parsed.ics).toBe(true);
		}
	});

	it("leaves ics undefined when the flag is absent", () => {
		const parsed = parsePlanArgs(["--ready", "6:00 PM", "--item", "brisket=10"]);
		if (parsed && !("listMeats" in parsed)) {
			expect(parsed.ics).toBeUndefined();
		}
	});
});
