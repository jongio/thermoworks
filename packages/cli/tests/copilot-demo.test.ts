import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock fs operations and homedir for demo state path
const testDir = join(
	tmpdir(),
	`tw-copilot-demo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);

vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return { ...actual, homedir: () => testDir };
});

beforeEach(async () => {
	await mkdir(testDir, { recursive: true });
	await mkdir(join(testDir, ".thermoworks"), { recursive: true });
	await mkdir(join(testDir, ".copilot"), { recursive: true });
});

afterEach(async () => {
	vi.restoreAllMocks();
	await rm(testDir, { recursive: true, force: true });
});

describe("nextDemoState", () => {
	it("starts at index 0 when no state file exists", async () => {
		const { nextDemoState } = await import("../src/commands/copilot.js");
		const state = await nextDemoState();
		expect(state).toBe("none");
	});

	it("cycles through DEMO_CYCLE states", async () => {
		const { nextDemoState } = await import("../src/commands/copilot.js");

		// First call: idx=0 (none)
		const s1 = await nextDemoState();
		expect(s1).toBe("none");

		// Second call: idx=1 (none)
		const s2 = await nextDemoState();
		expect(s2).toBe("none");

		// Third call: idx=2 (high)
		const s3 = await nextDemoState();
		expect(s3).toBe("high");

		// Fourth call: idx=3 (high)
		const s4 = await nextDemoState();
		expect(s4).toBe("high");

		// Fifth call: idx=4 (low)
		const s5 = await nextDemoState();
		expect(s5).toBe("low");
	});

	it("handles corrupt state file gracefully", async () => {
		await writeFile(join(testDir, ".thermoworks", ".demo-state"), "not-a-number", "utf8");
		const { nextDemoState } = await import("../src/commands/copilot.js");
		const state = await nextDemoState();
		expect(state).toBe("none");
	});
});

describe("copilotStatusDemo", () => {
	it("outputs formatted temperature line for 'none' alarm state", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const { copilotStatusDemo } = await import("../src/commands/copilot.js");

		await copilotStatusDemo("none");

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = logSpy.mock.calls[0]?.[0] as string;
		expect(output).toContain("\u{1F525}");
		expect(output).toContain("Smoker");
		expect(output).toContain("225");
		expect(output).not.toContain("\x1b[91m"); // No red ANSI for "none"
		logSpy.mockRestore();
	});

	it("outputs red ANSI for 'high' alarm state", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const { copilotStatusDemo } = await import("../src/commands/copilot.js");

		await copilotStatusDemo("high");

		const output = logSpy.mock.calls[0]?.[0] as string;
		expect(output).toContain("\x1b[91m"); // Red ANSI
		expect(output).toContain("285"); // High temp for pit
		logSpy.mockRestore();
	});

	it("outputs blue ANSI for 'low' alarm state", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const { copilotStatusDemo } = await import("../src/commands/copilot.js");

		await copilotStatusDemo("low");

		const output = logSpy.mock.calls[0]?.[0] as string;
		expect(output).toContain("\x1b[94m"); // Blue ANSI
		expect(output).toContain("180"); // Low temp for pit
		logSpy.mockRestore();
	});
});

describe("copilotRemove", () => {
	const settingsPath = () => join(testDir, ".copilot", "settings.json");

	it("removes statusline config managed by thermoworks", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const settings = { statusLine: { type: "command", _managedBy: "thermoworks" } };
		await writeFile(settingsPath(), JSON.stringify(settings), "utf8");

		const { copilotRemove } = await import("../src/commands/copilot.js");
		await copilotRemove();

		expect(logSpy).toHaveBeenCalledWith("Statusline configuration removed.");
		const updated = JSON.parse(await readFile(settingsPath(), "utf8"));
		expect(updated.statusLine).toBeUndefined();
		logSpy.mockRestore();
	});

	it("removes statusline config managed by thermoworks-demo", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const settings = { statusLine: { type: "command", _managedBy: "thermoworks-demo" } };
		await writeFile(settingsPath(), JSON.stringify(settings), "utf8");

		const { copilotRemove } = await import("../src/commands/copilot.js");
		await copilotRemove();

		expect(logSpy).toHaveBeenCalledWith("Statusline configuration removed.");
		logSpy.mockRestore();
	});

	it("does not remove statusline managed by another tool", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		const settings = { statusLine: { type: "command", _managedBy: "other-tool" } };
		await writeFile(settingsPath(), JSON.stringify(settings), "utf8");

		const { copilotRemove } = await import("../src/commands/copilot.js");
		await copilotRemove();

		expect(logSpy).toHaveBeenCalledWith("Statusline is not managed by thermoworks. Not removing.");
		logSpy.mockRestore();
	});

	it("reports nothing to remove when no statusLine exists", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		await writeFile(settingsPath(), JSON.stringify({}), "utf8");

		const { copilotRemove } = await import("../src/commands/copilot.js");
		await copilotRemove();

		expect(logSpy).toHaveBeenCalledWith("No statusline configuration found.");
		logSpy.mockRestore();
	});

	it("reports nothing when settings file does not exist", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		// Ensure no settings file
		await rm(settingsPath(), { force: true });

		const { copilotRemove } = await import("../src/commands/copilot.js");
		await copilotRemove();

		expect(logSpy).toHaveBeenCalledWith("No settings file found. Nothing to remove.");
		logSpy.mockRestore();
	});
});
