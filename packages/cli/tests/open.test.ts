import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OPEN_TARGETS, open, openCommand, resolveOpenTarget } from "../src/commands/open.js";

// =============================================================================
// resolveOpenTarget
// =============================================================================

describe("resolveOpenTarget", () => {
	it("defaults to the cloud app when no target is given", () => {
		expect(resolveOpenTarget()).toEqual(OPEN_TARGETS.cloud);
	});

	it("resolves the web dashboard target", () => {
		expect(resolveOpenTarget("web")).toEqual(OPEN_TARGETS.web);
	});

	it("resolves the cloud target explicitly", () => {
		expect(resolveOpenTarget("cloud")).toEqual(OPEN_TARGETS.cloud);
	});

	it("is case-insensitive", () => {
		expect(resolveOpenTarget("WEB")).toEqual(OPEN_TARGETS.web);
	});

	it("returns null for an unknown target", () => {
		expect(resolveOpenTarget("nope")).toBeNull();
	});
});

// =============================================================================
// openCommand
// =============================================================================

describe("openCommand", () => {
	const url = "https://cloud.thermoworks.com";

	it("uses cmd start on Windows", () => {
		expect(openCommand(url, "win32")).toEqual({
			command: "cmd",
			args: ["/c", "start", "", url],
		});
	});

	it("uses open on macOS", () => {
		expect(openCommand(url, "darwin")).toEqual({ command: "open", args: [url] });
	});

	it("uses xdg-open on Linux", () => {
		expect(openCommand(url, "linux")).toEqual({ command: "xdg-open", args: [url] });
	});
});

// =============================================================================
// open command
// =============================================================================

describe("open", () => {
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

	it("prints and launches the cloud app by default", () => {
		const launch = vi.fn();
		open(undefined, { json: false }, launch);

		expect(logSpy).toHaveBeenCalledWith("Opening ThermoWorks Cloud: https://cloud.thermoworks.com");
		expect(launch).toHaveBeenCalledOnce();
		const [, launchArgs] = launch.mock.calls[0] as [string, string[]];
		expect(launchArgs).toContain("https://cloud.thermoworks.com");
	});

	it("launches the web dashboard for the web target", () => {
		const launch = vi.fn();
		open("web", { json: false }, launch);

		const [, launchArgs] = launch.mock.calls[0] as [string, string[]];
		expect(launchArgs).toContain("https://jongio.github.io/thermoworks/");
	});

	it("emits JSON when --json is set", () => {
		const launch = vi.fn();
		open("web", { json: true }, launch);

		const output = logSpy.mock.calls[0]?.[0] as string;
		expect(JSON.parse(output)).toEqual({
			target: "web",
			name: "ThermoWorks web dashboard",
			url: "https://jongio.github.io/thermoworks/",
		});
		expect(launch).toHaveBeenCalledOnce();
	});

	it("exits with an error and does not launch for an unknown target", () => {
		const launch = vi.fn();
		open("bogus", { json: false }, launch);

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errorSpy).toHaveBeenCalledWith("Unknown target: bogus. Known targets: cloud, web");
		expect(launch).not.toHaveBeenCalled();
	});
});
