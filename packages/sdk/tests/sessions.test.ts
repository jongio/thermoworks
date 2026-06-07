import { afterEach, describe, expect, it, vi } from "vitest";
import { ThermoworksCloud } from "../src/client.js";

vi.mock("../src/auth.js", () => ({
	createAuthSession: vi.fn(),
}));

import { createAuthSession } from "../src/auth.js";

const mockCallFunction = vi.fn();
const mockCreateAuth = vi.mocked(createAuthSession);

function setupSession() {
	mockCreateAuth.mockResolvedValue({
		request: vi.fn(),
		callFunction: mockCallFunction,
		getUserId: () => "user1",
		close: vi.fn(),
	});
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("ThermoworksCloud session management", () => {
	describe("startSession", () => {
		it("calls newSessionRequest with deviceId", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.startSession("ABC-123");

			expect(mockCallFunction).toHaveBeenCalledWith("newSessionRequest", { deviceId: "ABC-123" });
			expect(result.success).toBe(true);
			client.close();
		});

		it("includes label when provided", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await client.startSession("DEV-001", "My Session");

			expect(mockCallFunction).toHaveBeenCalledWith("newSessionRequest", {
				deviceId: "DEV-001",
				label: "My Session",
			});
			client.close();
		});

		it("rejects invalid serial", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.startSession("")).rejects.toThrow("Invalid device serial");
			await expect(client.startSession("bad serial!")).rejects.toThrow("Invalid device serial");
			client.close();
		});
	});

	describe("endSession", () => {
		it("calls endSessionRequest with deviceId", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.endSession("ABC-123");

			expect(mockCallFunction).toHaveBeenCalledWith("endSessionRequest", { deviceId: "ABC-123" });
			expect(result.success).toBe(true);
			client.close();
		});

		it("rejects invalid serial", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.endSession("")).rejects.toThrow("Invalid device serial");
			client.close();
		});
	});

	describe("clearSession", () => {
		it("calls clearSessionRequest with deviceId", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.clearSession("ABC-123");

			expect(mockCallFunction).toHaveBeenCalledWith("clearSessionRequest", {
				deviceId: "ABC-123",
			});
			expect(result.success).toBe(true);
			client.close();
		});

		it("rejects invalid serial", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.clearSession("bad!")).rejects.toThrow("Invalid device serial");
			client.close();
		});
	});

	describe("resetMinMax", () => {
		it("calls telemetryDeviceChannelResetMinMax with deviceId and channelId", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.resetMinMax("ABC-123", 3);

			expect(mockCallFunction).toHaveBeenCalledWith("telemetryDeviceChannelResetMinMax", {
				deviceId: "ABC-123",
				channelId: 3,
			});
			expect(result.success).toBe(true);
			client.close();
		});

		it("rejects invalid channel numbers", async () => {
			setupSession();
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.resetMinMax("ABC-123", 0)).rejects.toThrow("Invalid channel number");
			await expect(client.resetMinMax("ABC-123", 10)).rejects.toThrow("Invalid channel number");
			await expect(client.resetMinMax("ABC-123", 1.5)).rejects.toThrow("Invalid channel number");
			client.close();
		});

		it("rejects invalid serial", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.resetMinMax("", 1)).rejects.toThrow("Invalid device serial");
			client.close();
		});
	});

	describe("clearEvents", () => {
		it("calls deviceClearEvents with deviceId", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.clearEvents("ABC-123");

			expect(mockCallFunction).toHaveBeenCalledWith("deviceClearEvents", {
				deviceId: "ABC-123",
			});
			expect(result.success).toBe(true);
			client.close();
		});

		it("rejects invalid serial", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.clearEvents("bad!")).rejects.toThrow("Invalid device serial");
			client.close();
		});
	});

	describe("ActionResult parsing", () => {
		it("returns success with data from cloud function", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true, sessionId: "sess-42" });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.startSession("ABC-123");

			expect(result).toEqual({
				success: true,
				data: { success: true, sessionId: "sess-42" },
				error: null,
			});
			client.close();
		});

		it("returns error when cloud function reports failure", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ status: "error", message: "Device offline" });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.endSession("ABC-123");

			expect(result).toEqual({
				success: false,
				data: null,
				error: "Device offline",
			});
			client.close();
		});

		it("returns error when result contains error field", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ error: "Not authorized" });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.clearSession("ABC-123");

			expect(result).toEqual({
				success: false,
				data: null,
				error: "Not authorized",
			});
			client.close();
		});

		it("handles null response gracefully", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce(null);

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.clearEvents("ABC-123");

			expect(result).toEqual({
				success: true,
				data: null,
				error: null,
			});
			client.close();
		});
	});

	describe("deprecated actions alias", () => {
		it("delegates to top-level methods", async () => {
			setupSession();
			mockCallFunction.mockResolvedValue({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });

			await client.actions.startSession("DEV-1", "label");
			expect(mockCallFunction).toHaveBeenCalledWith("newSessionRequest", {
				deviceId: "DEV-1",
				label: "label",
			});

			await client.actions.endSession("DEV-1");
			expect(mockCallFunction).toHaveBeenCalledWith("endSessionRequest", {
				deviceId: "DEV-1",
			});

			await client.actions.clearSession("DEV-1");
			expect(mockCallFunction).toHaveBeenCalledWith("clearSessionRequest", {
				deviceId: "DEV-1",
			});

			await client.actions.resetMinMax("DEV-1", 2);
			expect(mockCallFunction).toHaveBeenCalledWith("telemetryDeviceChannelResetMinMax", {
				deviceId: "DEV-1",
				channelId: 2,
			});

			await client.actions.clearEvents("DEV-1");
			expect(mockCallFunction).toHaveBeenCalledWith("deviceClearEvents", {
				deviceId: "DEV-1",
			});

			client.close();
		});
	});
});
