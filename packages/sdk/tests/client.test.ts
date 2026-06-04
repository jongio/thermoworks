import { afterEach, describe, expect, it, vi } from "vitest";
import { ThermoworksCloud } from "../src/client.js";
import { NotFoundError } from "../src/types.js";

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

describe("ThermoworksCloud", () => {
	describe("getUser", () => {
		it("fetches user information", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						accountId: { stringValue: "acct-123" },
						email: { stringValue: "test@example.com" },
						displayName: { stringValue: "Test User" },
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const user = await client.getUser();
			expect(user.userId).toBe("user1");
			expect(user.accountId).toBe("acct-123");
			expect(user.email).toBe("test@example.com");
			client.close();
		});
	});

	describe("getDevices", () => {
		it("queries and parses devices", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { fields: { accountId: { stringValue: "acct-123" } } }) as any,
			);
			mockRequest.mockResolvedValueOnce(
				mockRes(200, [
					{
						document: {
							fields: {
								serial: { stringValue: "ABC123" },
								label: { stringValue: "Garage Sensor" },
								type: { stringValue: "node" },
								battery: { integerValue: "85" },
								last_seen: { timestampValue: "2026-06-01T12:00:00.000Z" },
								accountId: { stringValue: "acct-123" },
							},
						},
					},
					{
						document: {
							fields: {
								serial: { stringValue: "DEF456" },
								label: { stringValue: "Fridge" },
								type: { stringValue: "node" },
								accountId: { stringValue: "acct-123" },
							},
						},
					},
				]) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const devices = await client.getDevices();
			expect(devices).toHaveLength(2);
			expect(devices[0]?.serial).toBe("ABC123");
			expect(devices[0]?.battery).toBe(85);
			expect(devices[1]?.label).toBe("Fridge");
			client.close();
		});

		it("filters devices by serial", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { fields: { accountId: { stringValue: "acct-123" } } }) as any,
			);
			mockRequest.mockResolvedValueOnce(
				mockRes(200, [
					{
						document: {
							fields: {
								serial: { stringValue: "A" },
								type: { stringValue: "node" },
								accountId: { stringValue: "acct-123" },
							},
						},
					},
					{
						document: {
							fields: {
								serial: { stringValue: "B" },
								type: { stringValue: "smoke" },
								accountId: { stringValue: "acct-123" },
							},
						},
					},
				]) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const devices = await client.getDevices({ serial: "B" });
			expect(devices).toHaveLength(1);
			expect(devices[0]?.serial).toBe("B");
			client.close();
		});

		it("filters devices by type", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { fields: { accountId: { stringValue: "acct-123" } } }) as any,
			);
			mockRequest.mockResolvedValueOnce(
				mockRes(200, [
					{
						document: {
							fields: {
								serial: { stringValue: "A" },
								type: { stringValue: "node" },
								accountId: { stringValue: "acct-123" },
							},
						},
					},
					{
						document: {
							fields: {
								serial: { stringValue: "B" },
								type: { stringValue: "smoke" },
								accountId: { stringValue: "acct-123" },
							},
						},
					},
				]) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const devices = await client.getDevices({ type: "smoke" });
			expect(devices).toHaveLength(1);
			expect(devices[0]?.type).toBe("smoke");
			client.close();
		});

		it("filters devices by activeWithinMinutes", async () => {
			setupAuth();
			const now = new Date();
			const fiveMinAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
			const twoHoursAgo = new Date(now.getTime() - 120 * 60_000).toISOString();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { fields: { accountId: { stringValue: "acct-123" } } }) as any,
			);
			mockRequest.mockResolvedValueOnce(
				mockRes(200, [
					{
						document: {
							fields: {
								serial: { stringValue: "ACTIVE" },
								type: { stringValue: "node" },
								last_seen: { timestampValue: fiveMinAgo },
								accountId: { stringValue: "acct-123" },
							},
						},
					},
					{
						document: {
							fields: {
								serial: { stringValue: "STALE" },
								type: { stringValue: "node" },
								last_seen: { timestampValue: twoHoursAgo },
								accountId: { stringValue: "acct-123" },
							},
						},
					},
				]) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const devices = await client.getDevices({ activeWithinMinutes: 15 });
			expect(devices).toHaveLength(1);
			expect(devices[0]?.serial).toBe("ACTIVE");
			client.close();
		});

		it("filters devices by status", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { fields: { accountId: { stringValue: "acct-123" } } }) as any,
			);
			mockRequest.mockResolvedValueOnce(
				mockRes(200, [
					{
						document: {
							fields: {
								serial: { stringValue: "A" },
								type: { stringValue: "node" },
								status: { stringValue: "online" },
								accountId: { stringValue: "acct-123" },
							},
						},
					},
					{
						document: {
							fields: {
								serial: { stringValue: "B" },
								type: { stringValue: "node" },
								status: { stringValue: "offline" },
								accountId: { stringValue: "acct-123" },
							},
						},
					},
				]) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const devices = await client.getDevices({ status: "online" });
			expect(devices).toHaveLength(1);
			expect(devices[0]?.serial).toBe("A");
			client.close();
		});
	});

	describe("getDeviceChannel", () => {
		it("parses channel with temperature reading", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						value: { doubleValue: 72.4 },
						units: { stringValue: "F" },
						label: { stringValue: "Ambient" },
						status: { stringValue: "NORMAL" },
						alarmHigh: {
							mapValue: {
								fields: {
									enabled: { booleanValue: true },
									alarming: { booleanValue: false },
									value: { integerValue: "100" },
									units: { stringValue: "F" },
								},
							},
						},
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const channel = await client.getDeviceChannel("ABC123", 1);
			expect(channel.value).toBe(72.4);
			expect(channel.units).toBe("F");
			expect(channel.alarmHigh?.enabled).toBe(true);
			expect(channel.alarmHigh?.value).toBe(100);
			client.close();
		});

		it("throws NotFoundError for missing channel", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await expect(client.getDeviceChannel("ABC123", 5)).rejects.toThrow(NotFoundError);
			client.close();
		});
	});

	describe("getDevice", () => {
		it("fetches a single device by serial", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						serial: { stringValue: "ABC123" },
						label: { stringValue: "Pit Sensor" },
						type: { stringValue: "smoke" },
						battery: { integerValue: "92" },
						accountId: { stringValue: "acct-123" },
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const device = await client.getDevice("ABC123");
			expect(device.serial).toBe("ABC123");
			expect(device.label).toBe("Pit Sensor");
			expect(device.type).toBe("smoke");
			expect(device.battery).toBe(92);
			client.close();
		});

		it("throws NotFoundError for missing device", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await expect(client.getDevice("MISSING")).rejects.toThrow(NotFoundError);
			client.close();
		});
	});

	describe("getAverageTemperature", () => {
		it("computes average across temperature channels", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { value: { doubleValue: 70 }, units: { stringValue: "F" } },
				}) as any,
			);
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { value: { doubleValue: 80 }, units: { stringValue: "F" } },
				}) as any,
			);
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const avg = await client.getAverageTemperature("ABC123");
			expect(avg).toEqual({ value: 75, units: "F" });
			client.close();
		});

		it("excludes humidity channels from average", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { value: { doubleValue: 72 }, units: { stringValue: "F" } },
				}) as any,
			);
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { value: { doubleValue: 45 }, units: { stringValue: "H" } },
				}) as any,
			);
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const avg = await client.getAverageTemperature("ABC123");
			expect(avg).toEqual({ value: 72, units: "F" });
			client.close();
		});

		it("returns null when no temperature channels have readings", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const avg = await client.getAverageTemperature("ABC123");
			expect(avg).toBeNull();
			client.close();
		});
	});

	describe("getAllDeviceChannels", () => {
		it("collects channels until NotFoundError", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { value: { doubleValue: 72.4 }, units: { stringValue: "F" } },
				}) as any,
			);
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { value: { doubleValue: 45.0 }, units: { stringValue: "H" } },
				}) as any,
			);
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const channels = await client.getAllDeviceChannels("ABC123");
			expect(channels).toHaveLength(2);
			expect(channels[0]?.value).toBe(72.4);
			expect(channels[1]?.units).toBe("H");
			client.close();
		});
	});
});
