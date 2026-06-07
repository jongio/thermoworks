import { afterEach, describe, expect, it, vi } from "vitest";
import { ThermoworksCloud } from "../src/client.js";

vi.mock("undici", () => {
	const mockRequest = vi.fn();
	class MockAgent {
		close = vi.fn();
	}
	return {
		Agent: MockAgent,
		request: mockRequest,
	};
});

import { request as undiciRequest } from "undici";

const mockRequest = vi.mocked(undiciRequest);

function mockRes(statusCode: number, body: unknown) {
	return { statusCode, headers: {}, body: { text: async () => JSON.stringify(body) } };
}

function setupAuth() {
	mockRequest.mockResolvedValueOnce(mockRes(200, { projectId: "thermoworks-app" }) as any);
	mockRequest.mockResolvedValueOnce(
		mockRes(200, {
			idToken: "token",
			refreshToken: "refresh",
			localId: "user1",
			expiresIn: "3600",
		}) as any,
	);
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("ThermoworksCloud.setAlarm", () => {
	it("sends PATCH with high alarm fields and updateMask", async () => {
		setupAuth();
		mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

		const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
		await client.setAlarm("ABC123", 1, {
			high: { value: 275, units: "F", enabled: true },
		});

		const patchCall = mockRequest.mock.calls[2];
		const url = patchCall[0] as string;
		const opts = patchCall[1] as { method: string; body: string };

		expect(url).toContain("documents/devices/ABC123/channels/1");
		expect(url).toContain("updateMask.fieldPaths=alarmHigh");
		expect(url).not.toContain("updateMask.fieldPaths=alarmLow");
		expect(opts.method).toBe("PATCH");

		const body = JSON.parse(opts.body);
		expect(body.fields.alarmHigh).toEqual({
			mapValue: {
				fields: {
					value: { doubleValue: 275 },
					units: { stringValue: "F" },
					enabled: { booleanValue: true },
				},
			},
		});

		client.close();
	});

	it("sends PATCH with low alarm fields and updateMask", async () => {
		setupAuth();
		mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

		const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
		await client.setAlarm("ABC123", 2, {
			low: { value: 32, units: "F", enabled: true, muted: false },
		});

		const patchCall = mockRequest.mock.calls[2];
		const url = patchCall[0] as string;
		const opts = patchCall[1] as { method: string; body: string };

		expect(url).toContain("documents/devices/ABC123/channels/2");
		expect(url).toContain("updateMask.fieldPaths=alarmLow");
		expect(url).not.toContain("updateMask.fieldPaths=alarmHigh");
		expect(opts.method).toBe("PATCH");

		const body = JSON.parse(opts.body);
		expect(body.fields.alarmLow).toEqual({
			mapValue: {
				fields: {
					value: { doubleValue: 32 },
					units: { stringValue: "F" },
					enabled: { booleanValue: true },
					muted: { booleanValue: false },
				},
			},
		});

		client.close();
	});

	it("sends PATCH with both high and low alarm fields", async () => {
		setupAuth();
		mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

		const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
		await client.setAlarm("SMOKE-01", 1, {
			high: { value: 225, units: "F", enabled: true },
			low: { value: 150, units: "F", enabled: true },
		});

		const patchCall = mockRequest.mock.calls[2];
		const url = patchCall[0] as string;
		const opts = patchCall[1] as { method: string; body: string };

		expect(url).toContain("documents/devices/SMOKE-01/channels/1");
		expect(url).toContain("updateMask.fieldPaths=alarmHigh");
		expect(url).toContain("updateMask.fieldPaths=alarmLow");

		const body = JSON.parse(opts.body);
		expect(body.fields.alarmHigh.mapValue.fields.value).toEqual({ doubleValue: 225 });
		expect(body.fields.alarmLow.mapValue.fields.value).toEqual({ doubleValue: 150 });

		client.close();
	});

	it("only includes provided optional fields in the map value", async () => {
		setupAuth();
		mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

		const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
		await client.setAlarm("ABC123", 1, {
			high: { value: 200 },
		});

		const patchCall = mockRequest.mock.calls[2];
		const opts = patchCall[1] as { method: string; body: string };
		const body = JSON.parse(opts.body);

		// Only value should be present since units, enabled, muted were omitted
		expect(body.fields.alarmHigh).toEqual({
			mapValue: {
				fields: {
					value: { doubleValue: 200 },
				},
			},
		});

		client.close();
	});

	it("throws if neither high nor low is provided", async () => {
		const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
		await expect(client.setAlarm("ABC123", 1, {})).rejects.toThrow(
			"At least one of 'high' or 'low' must be provided",
		);
		client.close();
	});

	it("throws on invalid serial", async () => {
		const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
		await expect(client.setAlarm("../evil", 1, { high: { value: 100 } })).rejects.toThrow(
			"Invalid device serial",
		);
		client.close();
	});

	it("throws on invalid channel number", async () => {
		const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
		await expect(client.setAlarm("ABC123", 0, { high: { value: 100 } })).rejects.toThrow(
			"Invalid channel number",
		);
		await expect(client.setAlarm("ABC123", 10, { high: { value: 100 } })).rejects.toThrow(
			"Invalid channel number",
		);
		client.close();
	});

	it("encodes special characters in serial", async () => {
		setupAuth();
		mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

		const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
		await client.setAlarm("AA:BB:CC", 1, {
			high: { value: 100, enabled: true },
		});

		const patchCall = mockRequest.mock.calls[2];
		const url = patchCall[0] as string;
		expect(url).toContain("documents/devices/AA%3ABB%3ACC/channels/1");

		client.close();
	});

	it("handles muted field correctly", async () => {
		setupAuth();
		mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

		const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
		await client.setAlarm("ABC123", 3, {
			high: { value: 300, muted: true },
		});

		const patchCall = mockRequest.mock.calls[2];
		const opts = patchCall[1] as { method: string; body: string };
		const body = JSON.parse(opts.body);

		expect(body.fields.alarmHigh.mapValue.fields.muted).toEqual({
			booleanValue: true,
		});

		client.close();
	});
});
