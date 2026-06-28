import type { ActionResult } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockRenameDevice = vi.fn();
	const mockResetMinMax = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		renameDevice = mockRenameDevice;
		resetMinMax = mockResetMinMax;
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
const mockRenameDevice = vi.mocked(mockClient.renameDevice);
const mockResetMinMax = vi.mocked(mockClient.resetMinMax);

// --- Helpers ---

const SUCCESS_RESULT: ActionResult = { success: true, data: null, error: null };

// --- Test setup ---

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
// device rename
// =============================================================================

describe("device rename", () => {
	it("renames a device and confirms the new name", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockRenameDevice.mockResolvedValue(SUCCESS_RESULT);

		const { device } = await import("../src/commands/device.js");
		await device(["rename", "ABC123", "--name", "Pit Boss"], { json: false });

		expect(mockRenameDevice).toHaveBeenCalledWith("ABC123", "Pit Boss");
		expect(logSpy).toHaveBeenCalledWith('Renamed ABC123 to "Pit Boss".');
	});

	it("outputs ActionResult as JSON on success", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockRenameDevice.mockResolvedValue(SUCCESS_RESULT);

		const { device } = await import("../src/commands/device.js");
		await device(["rename", "ABC123", "--name", "Pit Boss"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual(SUCCESS_RESULT);
	});

	it("exits with error when --name is missing", async () => {
		const { device } = await import("../src/commands/device.js");
		await expect(device(["rename", "ABC123"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--name"));
	});

	it("reports error when renameDevice fails", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockRenameDevice.mockResolvedValue({
			success: false,
			data: null,
			error: "device offline",
		});

		const { device } = await import("../src/commands/device.js");
		await expect(device(["rename", "ABC123", "--name", "New"], { json: false })).rejects.toThrow(
			"process.exit",
		);

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("device offline"));
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);

		const { device } = await import("../src/commands/device.js");
		await expect(device(["rename", "ABC123", "--name", "New"], { json: false })).rejects.toThrow(
			"process.exit",
		);

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});
});

// =============================================================================
// device reset-minmax
// =============================================================================

describe("device reset-minmax", () => {
	it("resets min/max for a channel and confirms", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockResetMinMax.mockResolvedValue(SUCCESS_RESULT);

		const { device } = await import("../src/commands/device.js");
		await device(["reset-minmax", "SIG001", "--channel", "3"], { json: false });

		expect(mockResetMinMax).toHaveBeenCalledWith("SIG001", 3);
		expect(logSpy).toHaveBeenCalledWith("Min/max reset for SIG001 channel 3.");
	});

	it("outputs ActionResult as JSON on success", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockResetMinMax.mockResolvedValue(SUCCESS_RESULT);

		const { device } = await import("../src/commands/device.js");
		await device(["reset-minmax", "SIG001", "--channel", "3"], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual(SUCCESS_RESULT);
	});

	it("exits with error when --channel is missing", async () => {
		const { device } = await import("../src/commands/device.js");
		await expect(device(["reset-minmax", "SIG001"], { json: false })).rejects.toThrow(
			"process.exit",
		);

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("--channel"));
	});

	it("exits with error for invalid channel (non-integer)", async () => {
		const { device } = await import("../src/commands/device.js");
		await expect(
			device(["reset-minmax", "SIG001", "--channel", "abc"], { json: false }),
		).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid channel"));
	});

	it("exits with error for channel out of range", async () => {
		const { device } = await import("../src/commands/device.js");
		await expect(
			device(["reset-minmax", "SIG001", "--channel", "0"], { json: false }),
		).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid channel"));
	});

	it("exits with error for channel above 9", async () => {
		const { device } = await import("../src/commands/device.js");
		await expect(
			device(["reset-minmax", "SIG001", "--channel", "10"], { json: false }),
		).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid channel"));
	});

	it("reports error when resetMinMax fails", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockResetMinMax.mockResolvedValue({
			success: false,
			data: null,
			error: "not supported",
		});

		const { device } = await import("../src/commands/device.js");
		await expect(
			device(["reset-minmax", "SIG001", "--channel", "1"], { json: false }),
		).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not supported"));
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);

		const { device } = await import("../src/commands/device.js");
		await expect(
			device(["reset-minmax", "SIG001", "--channel", "1"], { json: false }),
		).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
	});
});

// =============================================================================
// device router
// =============================================================================

describe("device (router)", () => {
	it("exits with usage when no subcommand provided", async () => {
		const { device } = await import("../src/commands/device.js");
		await expect(device([], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("exits with usage when no serial provided", async () => {
		const { device } = await import("../src/commands/device.js");
		await expect(device(["rename"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
	});

	it("exits with error for unknown subcommand", async () => {
		const { device } = await import("../src/commands/device.js");
		await expect(device(["unknown", "SER123"], { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith("Unknown device command: unknown");
	});
});
