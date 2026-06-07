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

describe("ThermoworksCloud device state management", () => {
	describe("updateDeviceState", () => {
		it("calls deviceStateUpdate with deviceId and state", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.updateDeviceState("ABC-123", { recording: true });

			expect(mockCallFunction).toHaveBeenCalledWith("deviceStateUpdate", {
				deviceId: "ABC-123",
				state: { recording: true },
			});
			expect(result.success).toBe(true);
			client.close();
		});

		it("passes complex state objects through", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const state = { interval: 30, units: "C", alarms: { high: 100 } };
			await client.updateDeviceState("DEV-001", state);

			expect(mockCallFunction).toHaveBeenCalledWith("deviceStateUpdate", {
				deviceId: "DEV-001",
				state,
			});
			client.close();
		});

		it("rejects invalid serial", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.updateDeviceState("", { x: 1 })).rejects.toThrow("Invalid device serial");
			await expect(client.updateDeviceState("bad serial!", { x: 1 })).rejects.toThrow(
				"Invalid device serial",
			);
			client.close();
		});

		it("rejects null state", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(
				client.updateDeviceState("ABC-123", null as unknown as Record<string, unknown>),
			).rejects.toThrow("state must be a non-null object");
			client.close();
		});

		it("rejects array state", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(
				client.updateDeviceState("ABC-123", [] as unknown as Record<string, unknown>),
			).rejects.toThrow("state must be a non-null object");
			client.close();
		});

		it("returns error from cloud function", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ status: "error", message: "Device offline" });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.updateDeviceState("ABC-123", { recording: false });

			expect(result).toEqual({
				success: false,
				data: null,
				error: "Device offline",
			});
			client.close();
		});
	});

	describe("renameDevice", () => {
		it("calls setInstrumentName with deviceId and name", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.renameDevice("ABC-123", "Kitchen Probe");

			expect(mockCallFunction).toHaveBeenCalledWith("setInstrumentName", {
				deviceId: "ABC-123",
				name: "Kitchen Probe",
			});
			expect(result.success).toBe(true);
			client.close();
		});

		it("rejects invalid serial", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.renameDevice("", "Name")).rejects.toThrow("Invalid device serial");
			await expect(client.renameDevice("bad!", "Name")).rejects.toThrow("Invalid device serial");
			client.close();
		});

		it("rejects empty name", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.renameDevice("ABC-123", "")).rejects.toThrow(
				"name must be a non-empty string",
			);
			client.close();
		});

		it("rejects whitespace-only name", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.renameDevice("ABC-123", "   ")).rejects.toThrow(
				"name must be a non-empty string",
			);
			client.close();
		});

		it("rejects non-string name", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.renameDevice("ABC-123", 42 as unknown as string)).rejects.toThrow(
				"name must be a non-empty string",
			);
			client.close();
		});

		it("returns error from cloud function", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ error: "Name too long" });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.renameDevice("ABC-123", "Kitchen Probe");

			expect(result).toEqual({
				success: false,
				data: null,
				error: "Name too long",
			});
			client.close();
		});
	});

	describe("factoryReset", () => {
		it("calls deviceFactoryReset with deviceId", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.factoryReset("ABC-123");

			expect(mockCallFunction).toHaveBeenCalledWith("deviceFactoryReset", {
				deviceId: "ABC-123",
			});
			expect(result.success).toBe(true);
			client.close();
		});

		it("rejects invalid serial", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.factoryReset("")).rejects.toThrow("Invalid device serial");
			await expect(client.factoryReset("bad serial!")).rejects.toThrow("Invalid device serial");
			client.close();
		});

		it("returns error from cloud function", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ status: "error", message: "Not authorized" });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.factoryReset("ABC-123");

			expect(result).toEqual({
				success: false,
				data: null,
				error: "Not authorized",
			});
			client.close();
		});

		it("handles null response", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce(null);

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.factoryReset("ABC-123");

			expect(result).toEqual({
				success: true,
				data: null,
				error: null,
			});
			client.close();
		});
	});
});
