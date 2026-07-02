import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	bashCompletion,
	COMMANDS,
	completion,
	fishCompletion,
	isSupportedShell,
	powershellCompletion,
	SUPPORTED_SHELLS,
	zshCompletion,
} from "../src/commands/completion.js";

// =============================================================================
// Generators
// =============================================================================

const ALL_TOP_LEVEL = COMMANDS.map((c) => c.name);

describe("bashCompletion", () => {
	const script = bashCompletion();

	it("defines the bash completion function and registers it", () => {
		expect(script).toContain("_thermoworks()");
		expect(script).toContain("complete -F _thermoworks thermoworks");
		expect(script).toContain("compgen");
	});

	it("includes every top-level command", () => {
		for (const name of ALL_TOP_LEVEL) {
			expect(script).toContain(name);
		}
	});

	it("includes subcommands for grouped commands", () => {
		expect(script).toContain("login logout status");
		expect(script).toContain("set enable disable");
		expect(script).toContain("start end clear");
	});
});

describe("zshCompletion", () => {
	const script = zshCompletion();

	it("starts with the #compdef directive", () => {
		expect(script.startsWith("#compdef thermoworks")).toBe(true);
		expect(script).toContain("_describe 'command' commands");
	});

	it("includes every top-level command", () => {
		for (const name of ALL_TOP_LEVEL) {
			expect(script).toContain(`'${name}:`);
		}
	});

	it("adds subcommands via compadd", () => {
		expect(script).toContain("compadd 'login' 'logout' 'status'");
	});
});

describe("fishCompletion", () => {
	const script = fishCompletion();

	it("uses fish complete syntax", () => {
		expect(script).toContain("complete -c thermoworks");
		expect(script).toContain("__thermoworks_no_subcommand");
		expect(script).toContain("__fish_seen_subcommand_from");
	});

	it("includes every top-level command", () => {
		for (const name of ALL_TOP_LEVEL) {
			expect(script).toContain(`-a '${name}'`);
		}
	});
});

describe("powershellCompletion", () => {
	const script = powershellCompletion();

	it("registers a native argument completer", () => {
		expect(script).toContain("Register-ArgumentCompleter");
		expect(script).toContain("-CommandName thermoworks");
		expect(script).toContain("CompletionResult");
	});

	it("includes every top-level command", () => {
		for (const name of ALL_TOP_LEVEL) {
			expect(script).toContain(`'${name}'`);
		}
	});
});

// =============================================================================
// isSupportedShell
// =============================================================================

describe("isSupportedShell", () => {
	it("accepts supported shells", () => {
		for (const shell of SUPPORTED_SHELLS) {
			expect(isSupportedShell(shell)).toBe(true);
		}
	});

	it("rejects unknown shells", () => {
		expect(isSupportedShell("tcsh")).toBe(false);
		expect(isSupportedShell("")).toBe(false);
	});
});

// =============================================================================
// completion() router
// =============================================================================

describe("completion", () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("prints the bash script for 'bash'", async () => {
		await completion("bash", { json: false });
		expect(logSpy).toHaveBeenCalledTimes(1);
		expect(logSpy.mock.calls[0]?.[0]).toContain("_thermoworks()");
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("prints a script for every supported shell", async () => {
		for (const shell of SUPPORTED_SHELLS) {
			logSpy.mockClear();
			await completion(shell, { json: false });
			expect(logSpy).toHaveBeenCalledTimes(1);
		}
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("errors and exits when the shell is missing", async () => {
		await completion(undefined, { json: false });
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage: thermoworks completion"));
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it("errors and exits for an unsupported shell", async () => {
		await completion("tcsh", { json: false });
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unsupported shell: tcsh"));
		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});
