import { afterEach, describe, expect, it, vi } from "vitest";

import {
	createRedactor,
	maybeRedact,
	outputJson,
	parseGlobalFlags,
	setRedaction,
} from "../src/output.js";

afterEach(() => {
	setRedaction(false);
	vi.restoreAllMocks();
});

describe("parseGlobalFlags", () => {
	it("parses --redact and strips it from remaining args", () => {
		const { options, remaining } = parseGlobalFlags(["devices", "--redact", "--json"]);
		expect(options.redact).toBe(true);
		expect(options.json).toBe(true);
		expect(remaining).toEqual(["devices"]);
	});

	it("defaults redact to false", () => {
		const { options } = parseGlobalFlags(["devices"]);
		expect(options.redact).toBe(false);
	});
});

describe("createRedactor", () => {
	it("masks device serials under known keys", () => {
		const out = createRedactor().redact({ serial: "TW-ABC123", label: "Pit" });
		expect(out.serial).toBe("SERIAL_1");
		expect(out.label).toBe("Pit");
	});

	it("masks account and user ids", () => {
		const out = createRedactor().redact({ accountId: "acct-987", userId: "user-654" });
		expect(out.accountId).toBe("ACCOUNT_1");
		expect(out.userId).toBe("USER_1");
	});

	it("masks email addresses wherever they appear", () => {
		const out = createRedactor().redact({
			email: "cook@pit.example",
			note: "ping cook@pit.example",
		});
		expect(out.email).toBe("redacted_1@example.com");
		expect(out.note).toBe("ping redacted_1@example.com");
	});

	it("drops tokens and public links entirely", () => {
		const out = createRedactor().redact({ shareToken: "s3cr3t", publicLink: "https://x/y?t=abc" });
		expect(out.shareToken).toBe("REDACTED");
		expect(out.publicLink).toBe("REDACTED");
	});

	it("keeps a stable placeholder for the same serial", () => {
		const out = createRedactor().redact([
			{ serial: "TW-ABC123" },
			{ serial: "TW-ABC123" },
			{ serial: "TW-ZZZ999" },
		]);
		expect(out[0]?.serial).toBe("SERIAL_1");
		expect(out[1]?.serial).toBe("SERIAL_1");
		expect(out[2]?.serial).toBe("SERIAL_2");
	});

	it("masks a serial substring inside other strings such as file paths", () => {
		const out = createRedactor().redact({
			serial: "TW-ABC123",
			file: "backup/TW-ABC123-01.json",
		});
		expect(out.serial).toBe("SERIAL_1");
		expect(out.file).toBe("backup/SERIAL_1-01.json");
	});

	it("preserves numbers, booleans, and timestamps", () => {
		const ts = "2026-07-05T10:00:00.000Z";
		const out = createRedactor().redact({ value: 203.5, enabled: true, timestamp: ts });
		expect(out.value).toBe(203.5);
		expect(out.enabled).toBe(true);
		expect(out.timestamp).toBe(ts);
	});

	it("does not mask short values that are not real serials", () => {
		const out = createRedactor().redact({ serial: "F", units: "F" });
		expect(out.units).toBe("F");
	});
});

describe("outputJson with redaction", () => {
	it("masks identifiers when redaction is on", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		setRedaction(true);
		outputJson({ serial: "TW-ABC123", email: "a@b.co" });
		const printed = spy.mock.calls[0]?.[0] as string;
		expect(printed).toContain("SERIAL_1");
		expect(printed).not.toContain("TW-ABC123");
		expect(printed).not.toContain("a@b.co");
	});

	it("leaves data untouched when redaction is off", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		setRedaction(false);
		outputJson({ serial: "TW-ABC123" });
		expect(spy.mock.calls[0]?.[0] as string).toContain("TW-ABC123");
	});
});

describe("maybeRedact", () => {
	it("is a no-op until redaction is enabled", () => {
		setRedaction(false);
		expect(maybeRedact({ serial: "TW-ABC123" })).toEqual({ serial: "TW-ABC123" });
		setRedaction(true);
		expect(maybeRedact({ serial: "TW-ABC123" })).toEqual({ serial: "SERIAL_1" });
	});
});
