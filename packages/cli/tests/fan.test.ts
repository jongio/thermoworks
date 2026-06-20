import type { ActionResult, FanSettings } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetFanState = vi.fn();
	const mockSetFanTarget = vi.fn();
	const mockSetFanEnabled = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getFanState = mockGetFanState;
		setFanTarget = mockSetFanTarget;
		setFanEnabled = mockSetFanEnabled;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

import { ThermoworksCloud } from "thermoworks-sdk";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetFanState = vi.mocked(mockClient.getFanState);
const mockSetFanTarget = vi.mocked(mockClient.setFanTarget);
const mockSetFanEnabled = vi.mocked(mockClient.setFanEnabled);

// --- Helpers ---

const FAN_STATE: FanSettings = {
	connected: true,
	connection: true,
	setTemp: 225,
	fanChannel: "1",
	state: 1,
};

const SUCCESS_RESULT: ActionResult = { success: true, data: null, error: null };

// --- Test suites ---

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(process, "exit").mockImplementation(() => {
		throw new Error("process.exit");
	});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

// =============================================================================
// fan status
// =============================================================================

describe("fan status", () => {
	it("shows fan state for a device", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetFanState.mockResolvedValue(FAN_STATE);

		const { fan } = await import("../src/commands/fan.js");
		await fan(["SIG001"], { json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Fan controller for SIG001:");
		expect(output).toContain("Connected:   yes");
		expect(output).toContain("Connection:  enabled");
		expect(output).toContain("Target temp: 225");
		expect(output).toContain("Channel:     1");
		expect(output).toContain("State:       1");
	});

	it("prints no-fan message when getFanState returns null", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetFanState.mockResolvedValue(null);

		const { fan } = await import("../src/commands/fan.js");
		await fan(["NODE01"], { json: false });

		expect(logSpy).toHaveBeenCalledWith("No fan controller found for device NODE01.");
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);

		const { fan } = await import("../src/commands/fan.js");
		await expect(fan(["SIG001"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});

	it("exits with error when no serial provided", async () => {
		const { fan } = await import("../src/commands/fan.js");
		await expect(fan([], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});
});

// =============================================================================
// fan status --json
// =============================================================================

describe("fan status --json", () => {
	it("outputs fan state as JSON", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetFanState.mockResolvedValue(FAN_STATE);

		const { fan } = await import("../src/commands/fan.js");
		await fan(["SIG001"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual(FAN_STATE);
	});

	it("outputs null JSON when no fan controller", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetFanState.mockResolvedValue(null);

		const { fan } = await import("../src/commands/fan.js");
		await fan(["SIG001"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toBeNull();
	});
});

// =============================================================================
// fan set --target
// =============================================================================

describe("fan set", () => {
	it("sets fan target temperature", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetFanTarget.mockResolvedValue(SUCCESS_RESULT);

		const { fan } = await import("../src/commands/fan.js");
		await fan(["set", "SIG001", "--target", "225"], { json: false });

		expect(mockSetFanTarget).toHaveBeenCalledWith("SIG001", 225);
		expect(logSpy).toHaveBeenCalledWith("Fan target temperature set to 225 for SIG001.");
	});

	it("rejects non-finite target temperature", async () => {
		const { fan } = await import("../src/commands/fan.js");
		await expect(fan(["set", "SIG001", "--target", "abc"], { json: false })).rejects.toThrow(
			"process.exit",
		);

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid target temperature"));
	});

	it("rejects Infinity as target temperature", async () => {
		const { fan } = await import("../src/commands/fan.js");
		await expect(fan(["set", "SIG001", "--target", "Infinity"], { json: false })).rejects.toThrow(
			"process.exit",
		);

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid target temperature"));
	});

	it("exits when --target flag is missing", async () => {
		const { fan } = await import("../src/commands/fan.js");
		await expect(fan(["set", "SIG001"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--target"));
	});

	it("exits when serial is missing", async () => {
		const { fan } = await import("../src/commands/fan.js");
		await expect(fan(["set"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("outputs ActionResult as JSON on success", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetFanTarget.mockResolvedValue(SUCCESS_RESULT);

		const { fan } = await import("../src/commands/fan.js");
		await fan(["set", "SIG001", "--target", "225"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual(SUCCESS_RESULT);
	});

	it("reports error when setFanTarget fails", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetFanTarget.mockResolvedValue({
			success: false,
			data: null,
			error: "device offline",
		});

		const { fan } = await import("../src/commands/fan.js");
		await expect(fan(["set", "SIG001", "--target", "225"], { json: false })).rejects.toThrow(
			"process.exit",
		);

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("device offline"));
	});
});

// =============================================================================
// fan enable / disable
// =============================================================================

describe("fan enable", () => {
	it("enables the fan controller", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetFanEnabled.mockResolvedValue(SUCCESS_RESULT);

		const { fan } = await import("../src/commands/fan.js");
		await fan(["enable", "SIG001"], { json: false });

		expect(mockSetFanEnabled).toHaveBeenCalledWith("SIG001", true);
		expect(logSpy).toHaveBeenCalledWith("Fan controller enabled for SIG001.");
	});

	it("exits when serial is missing for enable", async () => {
		const { fan } = await import("../src/commands/fan.js");
		await expect(fan(["enable"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("outputs ActionResult as JSON for enable", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetFanEnabled.mockResolvedValue(SUCCESS_RESULT);

		const { fan } = await import("../src/commands/fan.js");
		await fan(["enable", "SIG001"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual(SUCCESS_RESULT);
	});
});

describe("fan disable", () => {
	it("disables the fan controller", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetFanEnabled.mockResolvedValue(SUCCESS_RESULT);

		const { fan } = await import("../src/commands/fan.js");
		await fan(["disable", "SIG001"], { json: false });

		expect(mockSetFanEnabled).toHaveBeenCalledWith("SIG001", false);
		expect(logSpy).toHaveBeenCalledWith("Fan controller disabled for SIG001.");
	});

	it("exits when serial is missing for disable", async () => {
		const { fan } = await import("../src/commands/fan.js");
		await expect(fan(["disable"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("reports error when setFanEnabled fails", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockSetFanEnabled.mockResolvedValue({
			success: false,
			data: null,
			error: "not supported",
		});

		const { fan } = await import("../src/commands/fan.js");
		await expect(fan(["disable", "SIG001"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not supported"));
	});
});
