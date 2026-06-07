import { afterEach, describe, expect, it, vi } from "vitest";
import { ThermoworksCloud } from "../src/client.js";

vi.mock("../src/auth.js", () => ({
	createAuthSession: vi.fn(),
}));

import { createAuthSession } from "../src/auth.js";

const mockCallFunction = vi.fn();
const mockRequest = vi.fn();
const mockCreateAuth = vi.mocked(createAuthSession);

function setupSession() {
	mockCreateAuth.mockResolvedValue({
		request: mockRequest,
		callFunction: mockCallFunction,
		getUserId: () => "user1",
		close: vi.fn(),
	});
}

function firestoreDeviceDoc(fanFields: Record<string, unknown> | null) {
	const fields: Record<string, unknown> = {
		serial: { stringValue: "BBQ-001" },
		type: { stringValue: "signals" },
	};
	if (fanFields) {
		fields.fan = { mapValue: { fields: fanFields } };
	}
	return {
		ok: true,
		status: 200,
		json: async () => ({ fields }),
		text: async () => JSON.stringify({ fields }),
	};
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("ThermoworksCloud fan controller", () => {
	describe("getFanState", () => {
		it("returns fan settings when device has a fan", async () => {
			setupSession();
			mockRequest.mockResolvedValueOnce(
				firestoreDeviceDoc({
					connected: { booleanValue: true },
					connection: { booleanValue: true },
					setTemp: { integerValue: "275" },
					fan_channel: { stringValue: "1" },
					state: { integerValue: "0" },
				}),
			);

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const fan = await client.getFanState("BBQ-001");

			expect(fan).toEqual({
				connected: true,
				connection: true,
				setTemp: 275,
				fanChannel: "1",
				state: 0,
			});
			client.close();
		});

		it("returns null when device has no fan", async () => {
			setupSession();
			mockRequest.mockResolvedValueOnce(firestoreDeviceDoc(null));

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const fan = await client.getFanState("BBQ-001");

			expect(fan).toBeNull();
			client.close();
		});

		it("rejects invalid serial", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.getFanState("")).rejects.toThrow("Invalid device serial");
			await expect(client.getFanState("bad serial!")).rejects.toThrow("Invalid device serial");
			client.close();
		});
	});

	describe("setFanTarget", () => {
		it("calls deviceStateUpdate with fan.setTemp", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.setFanTarget("BBQ-001", 275);

			expect(mockCallFunction).toHaveBeenCalledWith("deviceStateUpdate", {
				deviceId: "BBQ-001",
				fan: { setTemp: 275 },
			});
			expect(result.success).toBe(true);
			client.close();
		});

		it("supports decimal target temperatures", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await client.setFanTarget("BBQ-001", 135.5);

			expect(mockCallFunction).toHaveBeenCalledWith("deviceStateUpdate", {
				deviceId: "BBQ-001",
				fan: { setTemp: 135.5 },
			});
			client.close();
		});

		it("returns error when cloud function reports failure", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ status: "error", message: "Device offline" });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.setFanTarget("BBQ-001", 275);

			expect(result).toEqual({
				success: false,
				data: null,
				error: "Device offline",
			});
			client.close();
		});

		it("rejects invalid serial", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.setFanTarget("", 275)).rejects.toThrow("Invalid device serial");
			await expect(client.setFanTarget("../evil", 275)).rejects.toThrow("Invalid device serial");
			client.close();
		});

		it("rejects non-finite targetTemp", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.setFanTarget("BBQ-001", Number.NaN)).rejects.toThrow(
				"targetTemp must be a finite number",
			);
			await expect(client.setFanTarget("BBQ-001", Number.POSITIVE_INFINITY)).rejects.toThrow(
				"targetTemp must be a finite number",
			);
			client.close();
		});
	});

	describe("setFanEnabled", () => {
		it("calls deviceStateUpdate with fan.connection = true", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.setFanEnabled("BBQ-001", true);

			expect(mockCallFunction).toHaveBeenCalledWith("deviceStateUpdate", {
				deviceId: "BBQ-001",
				fan: { connection: true },
			});
			expect(result.success).toBe(true);
			client.close();
		});

		it("calls deviceStateUpdate with fan.connection = false", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.setFanEnabled("BBQ-001", false);

			expect(mockCallFunction).toHaveBeenCalledWith("deviceStateUpdate", {
				deviceId: "BBQ-001",
				fan: { connection: false },
			});
			expect(result.success).toBe(true);
			client.close();
		});

		it("returns error when cloud function reports failure", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ error: "Not authorized" });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.setFanEnabled("BBQ-001", true);

			expect(result).toEqual({
				success: false,
				data: null,
				error: "Not authorized",
			});
			client.close();
		});

		it("rejects invalid serial", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.setFanEnabled("", true)).rejects.toThrow("Invalid device serial");
			await expect(client.setFanEnabled("bad!", false)).rejects.toThrow("Invalid device serial");
			client.close();
		});

		it("handles null response gracefully", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce(null);

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.setFanEnabled("BBQ-001", true);

			expect(result).toEqual({
				success: true,
				data: null,
				error: null,
			});
			client.close();
		});
	});
});
