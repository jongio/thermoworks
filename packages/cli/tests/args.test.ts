import { describe, expect, it } from "vitest";
import { firstPositional } from "../src/args.js";

describe("firstPositional", () => {
	it("returns the first positional when it comes first", () => {
		expect(firstPositional(["ABC123", "--channel", "2"], ["--channel"])).toBe("ABC123");
	});

	it("skips a value-taking flag's value placed before the positional", () => {
		// Regression: `--target 203 ABC123` must not treat 203 as the serial.
		expect(firstPositional(["--target", "203", "ABC123"], ["--target"])).toBe("ABC123");
	});

	it("skips multiple leading value flags", () => {
		expect(
			firstPositional(["--channel", "2", "--unit", "f", "ABC123"], ["--channel", "--unit"]),
		).toBe("ABC123");
	});

	it("does not skip the token after a boolean flag", () => {
		// `--json` takes no value, so the following positional must be found.
		expect(firstPositional(["--json", "ABC123"], ["--channel"])).toBe("ABC123");
	});

	it("finds the positional between flags", () => {
		expect(firstPositional(["--json", "ABC123", "--channel", "2"], ["--channel"])).toBe("ABC123");
	});

	it("returns undefined when there is no positional", () => {
		expect(firstPositional(["--channel", "2"], ["--channel"])).toBeUndefined();
	});

	it("returns undefined for an empty arg list", () => {
		expect(firstPositional([], ["--channel"])).toBeUndefined();
	});

	it("treats unknown flags as boolean (does not consume the next token)", () => {
		// `--verbose` is not a declared value flag, so `meat` is the positional.
		expect(firstPositional(["--verbose", "brisket"], ["--target"])).toBe("brisket");
	});

	it("handles a trailing value flag with no value", () => {
		expect(firstPositional(["ABC123", "--channel"], ["--channel"])).toBe("ABC123");
	});

	it("defaults to no value flags", () => {
		expect(firstPositional(["ABC123", "--json"])).toBe("ABC123");
	});
});
