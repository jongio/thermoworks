import type { ActionResult, Device } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockStartSession = vi.fn();
	const mockEndSession = vi.fn();
	const mockClearSession = vi.fn();
	const mockGetDevices = vi.fn();
	const mockGetDevice = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		startSession = mockStartSession;
		endSession = mockEndSession;
		clearSession = mockClearSession;
		getDevices = mockGetDevices;
		getDevice = mockGetDevice;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

vi.mock("../src/prompt.js", () => ({
	prompt: vi.fn(),
}));

import { ThermoworksCloud } from "thermoworks-sdk";
import { getCredentials } from "../src/credentials.js";
import { prompt } from "../src/prompt.js";

const mockGetCredentials = vi.mocked(getCredentials);
const mockPrompt = vi.mocked(prompt);

const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockStartSession = vi.mocked(mockClient.startSession);
const mockEndSession = vi.mocked(mockClient.endSession);
const mockClearSession = vi.mocked(mockClient.clearSession);
const mockGetDevices = vi.mocked(mockClient.getDevices);
const mockGetDevice = vi.mocked(mockClient.getDevice);

// --- Helpers ---

function ok(data: unknown = null): ActionResult {
	return { success: true, data, error: null };
}

function fail(error: string): ActionResult {
	return { success: false, data: null, error };
}

function makeDevice(overrides: Partial<Device> & { serial: string }): Device {
	return {
		serial: overrides.serial,
		label: overrides.label ?? null,
		sessionStart: overrides.sessionStart ?? null,
		sessionLabel: overrides.sessionLabel ?? null,
	} as Device;
}

// --- Test setup ---

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

// =============================================================================
// session start
// =============================================================================

describe("session start", () => {
	it("starts a session and prints success message", async () => {
		mockStartSession.mockResolvedValue(ok());

		const { sessionStart } = await import("../src/commands/session.js");
		await sessionStart("ABC123", undefined, { json: false });

		expect(mockStartSession).toHaveBeenCalledWith("ABC123", undefined);
		expect(logSpy).toHaveBeenCalledWith("Session started for ABC123.");
	});

	it("includes label in success message when provided", async () => {
		mockStartSession.mockResolvedValue(ok());

		const { sessionStart } = await import("../src/commands/session.js");
		await sessionStart("ABC123", "Brisket Cook", { json: false });

		expect(mockStartSession).toHaveBeenCalledWith("ABC123", "Brisket Cook");
		expect(logSpy).toHaveBeenCalledWith('Session started for ABC123 ("Brisket Cook").');
	});

	it("outputs JSON when --json is set", async () => {
		const result = ok({ sessionId: "s1" });
		mockStartSession.mockResolvedValue(result);

		const { sessionStart } = await import("../src/commands/session.js");
		await sessionStart("ABC123", undefined, { json: true });

		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual(result);
	});

	it("prints error and exits on failure", async () => {
		mockStartSession.mockResolvedValue(fail("device offline"));
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { sessionStart } = await import("../src/commands/session.js");
		await expect(sessionStart("ABC123", undefined, { json: false })).rejects.toThrow(
			"process.exit",
		);

		expect(errorSpy).toHaveBeenCalledWith("Failed to start session: device offline");
		exitSpy.mockRestore();
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { sessionStart } = await import("../src/commands/session.js");
		await expect(sessionStart("ABC123", undefined, { json: false })).rejects.toThrow(
			"process.exit",
		);

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});
});

// =============================================================================
// session end
// =============================================================================

describe("session end", () => {
	it("ends a session and prints success message", async () => {
		mockEndSession.mockResolvedValue(ok());

		const { sessionEnd } = await import("../src/commands/session.js");
		await sessionEnd("ABC123", { json: false });

		expect(mockEndSession).toHaveBeenCalledWith("ABC123");
		expect(logSpy).toHaveBeenCalledWith("Session ended for ABC123.");
	});

	it("outputs JSON when --json is set", async () => {
		const result = ok();
		mockEndSession.mockResolvedValue(result);

		const { sessionEnd } = await import("../src/commands/session.js");
		await sessionEnd("ABC123", { json: true });

		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual(result);
	});

	it("prints error and exits on failure", async () => {
		mockEndSession.mockResolvedValue(fail("no active session"));
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { sessionEnd } = await import("../src/commands/session.js");
		await expect(sessionEnd("ABC123", { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith("Failed to end session: no active session");
		exitSpy.mockRestore();
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { sessionEnd } = await import("../src/commands/session.js");
		await expect(sessionEnd("ABC123", { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});
});

// =============================================================================
// session clear
// =============================================================================

describe("session clear", () => {
	it("prompts for confirmation and clears on 'y'", async () => {
		mockPrompt.mockResolvedValue("y");
		mockClearSession.mockResolvedValue(ok());

		const { sessionClear } = await import("../src/commands/session.js");
		await sessionClear("ABC123", { json: false, yes: false });

		expect(mockPrompt).toHaveBeenCalledWith(expect.stringContaining("Clear all session data"));
		expect(mockClearSession).toHaveBeenCalledWith("ABC123");
		expect(logSpy).toHaveBeenCalledWith("Session data cleared for ABC123.");
	});

	it("cancels when user declines confirmation", async () => {
		mockPrompt.mockResolvedValue("n");

		const { sessionClear } = await import("../src/commands/session.js");
		await sessionClear("ABC123", { json: false, yes: false });

		expect(mockClearSession).not.toHaveBeenCalled();
		expect(logSpy).toHaveBeenCalledWith("Cancelled.");
	});

	it("skips confirmation with --yes flag", async () => {
		mockClearSession.mockResolvedValue(ok());

		const { sessionClear } = await import("../src/commands/session.js");
		await sessionClear("ABC123", { json: false, yes: true });

		expect(mockPrompt).not.toHaveBeenCalled();
		expect(mockClearSession).toHaveBeenCalledWith("ABC123");
		expect(logSpy).toHaveBeenCalledWith("Session data cleared for ABC123.");
	});

	it("skips confirmation with --json flag", async () => {
		const result = ok();
		mockClearSession.mockResolvedValue(result);

		const { sessionClear } = await import("../src/commands/session.js");
		await sessionClear("ABC123", { json: true, yes: false });

		expect(mockPrompt).not.toHaveBeenCalled();
		expect(mockClearSession).toHaveBeenCalledWith("ABC123");
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual(result);
	});

	it("prints error and exits on failure", async () => {
		mockClearSession.mockResolvedValue(fail("permission denied"));
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { sessionClear } = await import("../src/commands/session.js");
		await expect(sessionClear("ABC123", { json: false, yes: true })).rejects.toThrow(
			"process.exit",
		);

		expect(errorSpy).toHaveBeenCalledWith("Failed to clear session: permission denied");
		exitSpy.mockRestore();
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { sessionClear } = await import("../src/commands/session.js");
		await expect(sessionClear("ABC123", { json: false, yes: true })).rejects.toThrow(
			"process.exit",
		);

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});
});

// =============================================================================
// session router
// =============================================================================

describe("session (router)", () => {
	it("routes 'start' with --label to sessionStart", async () => {
		mockStartSession.mockResolvedValue(ok());

		const { session } = await import("../src/commands/session.js");
		await session(["start", "SER123", "--label", "My Cook"], { json: false });

		expect(mockStartSession).toHaveBeenCalledWith("SER123", "My Cook");
		expect(logSpy).toHaveBeenCalledWith('Session started for SER123 ("My Cook").');
	});

	it("routes 'end' to sessionEnd", async () => {
		mockEndSession.mockResolvedValue(ok());

		const { session } = await import("../src/commands/session.js");
		await session(["end", "SER123"], { json: false });

		expect(mockEndSession).toHaveBeenCalledWith("SER123");
	});

	it("routes 'clear' with --yes to sessionClear without prompt", async () => {
		mockClearSession.mockResolvedValue(ok());

		const { session } = await import("../src/commands/session.js");
		await session(["clear", "SER123", "--yes"], { json: false });

		expect(mockPrompt).not.toHaveBeenCalled();
		expect(mockClearSession).toHaveBeenCalledWith("SER123");
	});

	it("supports -l short flag for --label", async () => {
		mockStartSession.mockResolvedValue(ok());

		const { session } = await import("../src/commands/session.js");
		await session(["start", "SER123", "-l", "Short Label"], { json: false });

		expect(mockStartSession).toHaveBeenCalledWith("SER123", "Short Label");
	});

	it("supports -y short flag for --yes", async () => {
		mockClearSession.mockResolvedValue(ok());

		const { session } = await import("../src/commands/session.js");
		await session(["clear", "SER123", "-y"], { json: false });

		expect(mockPrompt).not.toHaveBeenCalled();
		expect(mockClearSession).toHaveBeenCalledWith("SER123");
	});

	it("exits with usage when no subcommand provided", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { session } = await import("../src/commands/session.js");
		await expect(session([], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
		exitSpy.mockRestore();
	});

	it("exits with usage when no serial provided", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { session } = await import("../src/commands/session.js");
		await expect(session(["start"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
		exitSpy.mockRestore();
	});

	it("exits with error for unknown subcommand", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { session } = await import("../src/commands/session.js");
		await expect(session(["unknown", "SER123"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith("Unknown session command: unknown");
		exitSpy.mockRestore();
	});

	it("routes 'status' to sessionStatus without requiring a serial", async () => {
		mockGetDevices.mockResolvedValue([]);

		const { session } = await import("../src/commands/session.js");
		await session(["status"], { json: false });

		expect(mockGetDevices).toHaveBeenCalledTimes(1);
		expect(logSpy).toHaveBeenCalledWith("No active sessions.");
	});
});

// =============================================================================
// session status
// =============================================================================

describe("sessionStatus", () => {
	it("lists devices that have an active session", async () => {
		const start = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "DEV1", label: "Smoker", sessionStart: start, sessionLabel: "Brisket" }),
			makeDevice({ serial: "DEV2", label: "Idle", sessionStart: null }),
		]);

		const { sessionStatus } = await import("../src/commands/session.js");
		await sessionStatus(undefined, { json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Smoker (DEV1)");
		expect(output).toContain('"Brisket"');
		expect(output).toContain("started");
		// Device with no session is omitted.
		expect(output).not.toContain("Idle");
	});

	it("scopes to a single device when a serial is given", async () => {
		const start = new Date(Date.now() - 30 * 60 * 1000);
		mockGetDevice.mockResolvedValue(
			makeDevice({ serial: "DEV1", label: "Smoker", sessionStart: start, sessionLabel: null }),
		);

		const { sessionStatus } = await import("../src/commands/session.js");
		await sessionStatus("DEV1", { json: false });

		expect(mockGetDevice).toHaveBeenCalledWith("DEV1");
		expect(mockGetDevices).not.toHaveBeenCalled();
		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Smoker (DEV1)");
	});

	it("outputs JSON with elapsed seconds when --json is set", async () => {
		const start = new Date(Date.now() - 60 * 1000); // ~60s ago
		mockGetDevices.mockResolvedValue([
			makeDevice({ serial: "DEV1", label: "Smoker", sessionStart: start, sessionLabel: "Brisket" }),
		]);

		const { sessionStatus } = await import("../src/commands/session.js");
		await sessionStatus(undefined, { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toHaveLength(1);
		expect(output[0].serial).toBe("DEV1");
		expect(output[0].deviceLabel).toBe("Smoker");
		expect(output[0].sessionLabel).toBe("Brisket");
		expect(output[0].sessionStart).toBe(start.toISOString());
		expect(output[0].elapsedSeconds).toBeGreaterThanOrEqual(59);
	});

	it("prints 'No active sessions.' when nothing is running", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", sessionStart: null })]);

		const { sessionStatus } = await import("../src/commands/session.js");
		await sessionStatus(undefined, { json: false });

		expect(logSpy).toHaveBeenCalledWith("No active sessions.");
	});

	it("prints a device-scoped message when the given device has no session", async () => {
		mockGetDevice.mockResolvedValue(makeDevice({ serial: "DEV1", sessionStart: null }));

		const { sessionStatus } = await import("../src/commands/session.js");
		await sessionStatus("DEV1", { json: false });

		expect(logSpy).toHaveBeenCalledWith("No active session on DEV1.");
	});

	it("outputs an empty JSON array when nothing is running", async () => {
		mockGetDevices.mockResolvedValue([makeDevice({ serial: "DEV1", sessionStart: null })]);

		const { sessionStatus } = await import("../src/commands/session.js");
		await sessionStatus(undefined, { json: true });

		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual([]);
	});

	it("exits when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { sessionStatus } = await import("../src/commands/session.js");
		await expect(sessionStatus(undefined, { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});
});
