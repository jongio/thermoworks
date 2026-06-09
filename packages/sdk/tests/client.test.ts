import { afterEach, describe, expect, it, vi } from "vitest";
import { ThermoworksCloud } from "../src/client.js";
import { NetworkError, NotFoundError } from "../src/types.js";

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
			// Channels 3-9: not found
			for (let i = 3; i <= 9; i++) {
				mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);
			}

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
			// Channels 3-9: not found
			for (let i = 3; i <= 9; i++) {
				mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);
			}

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const avg = await client.getAverageTemperature("ABC123");
			expect(avg).toEqual({ value: 72, units: "F" });
			client.close();
		});

		it("returns null when no temperature channels have readings", async () => {
			setupAuth();
			// All 9 channels: not found
			for (let i = 1; i <= 9; i++) {
				mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);
			}

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const avg = await client.getAverageTemperature("ABC123");
			expect(avg).toBeNull();
			client.close();
		});
	});

	describe("close", () => {
		it("throws 'Client is closed' when calling getUser after close", async () => {
			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			client.close();
			await expect(client.getUser()).rejects.toThrow("Client is closed");
		});

		it("throws 'Client is closed' when calling getDevices after close", async () => {
			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			client.close();
			await expect(client.getDevices()).rejects.toThrow("Client is closed");
		});

		it("throws 'Client is closed' when calling getDeviceChannel after close", async () => {
			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			client.close();
			await expect(client.getDeviceChannel("ABC123", 1)).rejects.toThrow("Client is closed");
		});

		it("throws 'Client is closed' when calling getDevice after close", async () => {
			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			client.close();
			await expect(client.getDevice("ABC123")).rejects.toThrow("Client is closed");
		});
	});

	describe("accountId caching", () => {
		it("does not call getUser on second getDevices invocation", async () => {
			setupAuth();
			// First getDevices: getUser response (accountId) + devices query
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
				]) as any,
			);
			// Second getDevices: only devices query (no getUser call)
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
				]) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await client.getDevices();
			const callsAfterFirst = mockRequest.mock.calls.length;

			await client.getDevices();
			const callsAfterSecond = mockRequest.mock.calls.length;

			// Second call should only add the devices query (1 call), not getUser + devices query (2 calls)
			expect(callsAfterSecond - callsAfterFirst).toBe(1);
			client.close();
		});

		it("clears cached accountId on close", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { fields: { accountId: { stringValue: "acct-123" } } }) as any,
			);
			mockRequest.mockResolvedValueOnce(mockRes(200, []) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await client.getDevices();
			client.close();

			// After close, calling getDevices throws - cache is cleared along with the client
			await expect(client.getDevices()).rejects.toThrow("Client is closed");
		});
	});

	describe("getAllDeviceChannels", () => {
		it("probes all 9 slots, skipping gaps", async () => {
			setupAuth();
			// Channel 1: exists
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { value: { doubleValue: 72.4 }, units: { stringValue: "F" } },
				}) as any,
			);
			// Channel 2: gap (not found)
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);
			// Channel 3: exists
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { value: { doubleValue: 45.0 }, units: { stringValue: "H" } },
				}) as any,
			);
			// Channels 4-9: not found
			for (let i = 4; i <= 9; i++) {
				mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);
			}

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const channels = await client.getAllDeviceChannels("ABC123");
			expect(channels).toHaveLength(2);
			expect(channels[0]?.value).toBe(72.4);
			expect(channels[1]?.units).toBe("H");
			client.close();
		});
	});

	describe("getAccount", () => {
		it("fetches account info", async () => {
			setupAuth();
			// resolveAccountId -> getUser
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { accountId: { stringValue: "acct-123" } },
				}) as any,
			);
			// getAccount document
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						name: { stringValue: "My Account" },
						type: { stringValue: "personal" },
						createdOn: { timestampValue: "2024-01-15T08:00:00.000Z" },
						exportVersion: { integerValue: "3" },
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const account = await client.getAccount();
			expect(account.accountId).toBe("acct-123");
			expect(account.name).toBe("My Account");
			expect(account.type).toBe("personal");
			expect(account.createdOn).toEqual(new Date("2024-01-15T08:00:00.000Z"));
			expect(account.exportVersion).toBe(3);
			client.close();
		});

		it("throws NotFoundError for 404", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { accountId: { stringValue: "acct-123" } },
				}) as any,
			);
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await expect(client.getAccount()).rejects.toThrow(NotFoundError);
			client.close();
		});
	});

	describe("getEvents", () => {
		it("fetches events with default limit", async () => {
			setupAuth();
			// resolveAccountId -> getUser
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { accountId: { stringValue: "acct-123" } },
				}) as any,
			);
			// events query
			mockRequest.mockResolvedValueOnce(
				mockRes(200, [
					{
						document: {
							name: "projects/thermoworks-app/databases/(default)/documents/events/evt-1",
							fields: {
								eventType: { stringValue: "High Alarm" },
								severity: { integerValue: "2" },
								eventTime: { timestampValue: "2026-06-01T10:00:00.000Z" },
								deviceId: { stringValue: "ABC123" },
								accountId: { stringValue: "acct-123" },
							},
						},
					},
				]) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const events = await client.getEvents();
			expect(events).toHaveLength(1);
			expect(events[0]?.eventType).toBe("High Alarm");
			expect(events[0]?.severity).toBe(2);
			expect(events[0]?.deviceId).toBe("ABC123");
			expect(events[0]?.id).toBe("evt-1");
			client.close();
		});

		it("filters by deviceId", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { accountId: { stringValue: "acct-123" } },
				}) as any,
			);
			mockRequest.mockResolvedValueOnce(mockRes(200, []) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const events = await client.getEvents({ deviceId: "ABC123" });
			expect(events).toEqual([]);
			// Verify the query body includes the deviceId filter
			const lastCall = mockRequest.mock.calls[mockRequest.mock.calls.length - 1];
			const body = (lastCall?.[1] as any)?.body;
			if (body) {
				const parsed = JSON.parse(body);
				const filters = parsed.structuredQuery.where.compositeFilter.filters;
				const deviceFilter = filters.find((f: any) => f.fieldFilter.field.fieldPath === "deviceId");
				expect(deviceFilter).toBeDefined();
				expect(deviceFilter.fieldFilter.value.stringValue).toBe("ABC123");
			}
			client.close();
		});

		it("filters by eventType", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { accountId: { stringValue: "acct-123" } },
				}) as any,
			);
			mockRequest.mockResolvedValueOnce(mockRes(200, []) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const events = await client.getEvents({ eventType: "Low Battery Alert" });
			expect(events).toEqual([]);
			client.close();
		});

		it("handles server error response", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { accountId: { stringValue: "acct-123" } },
				}) as any,
			);
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { error: { message: "Internal error" } }) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await expect(client.getEvents()).rejects.toThrow(NetworkError);
			client.close();
		});

		it("returns empty array for non-array response", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { accountId: { stringValue: "acct-123" } },
				}) as any,
			);
			mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const events = await client.getEvents();
			expect(events).toEqual([]);
			client.close();
		});
	});

	describe("getArchives", () => {
		it("lists archives for a device", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					documents: [
						{
							name: "projects/thermoworks-app/databases/(default)/documents/devices/ABC123/archive/arch-1",
							fields: {
								label: { stringValue: "Cook Session" },
								type: { stringValue: "session" },
								start: { timestampValue: "2026-06-01T10:00:00.000Z" },
								end: { timestampValue: "2026-06-01T14:00:00.000Z" },
								count: { integerValue: "120" },
								createdOn: { timestampValue: "2026-06-01T14:05:00.000Z" },
							},
						},
					],
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const archives = await client.getArchives("ABC123");
			expect(archives).toHaveLength(1);
			expect(archives[0]?.id).toBe("arch-1");
			expect(archives[0]?.label).toBe("Cook Session");
			expect(archives[0]?.count).toBe(120);
			client.close();
		});

		it("handles pagination token (startAfter)", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, { documents: [] }) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const archives = await client.getArchives("ABC123", { startAfter: "cursor-token" });
			expect(archives).toEqual([]);
			// Verify the URL includes the pageToken
			const lastCall = mockRequest.mock.calls[mockRequest.mock.calls.length - 1];
			const url = lastCall?.[0] as string;
			expect(url).toContain("pageToken=cursor-token");
			client.close();
		});

		it("returns empty when no documents", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const archives = await client.getArchives("ABC123");
			expect(archives).toEqual([]);
			client.close();
		});

		it("throws NetworkError on error response", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { error: { message: "Access denied" } }) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await expect(client.getArchives("ABC123")).rejects.toThrow(NetworkError);
			client.close();
		});
	});

	describe("getArchive", () => {
		it("fetches a specific archive", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					name: "projects/thermoworks-app/databases/(default)/documents/devices/ABC123/archive/arch-1",
					fields: {
						label: { stringValue: "BBQ Session" },
						type: { stringValue: "session" },
						start: { timestampValue: "2026-06-01T10:00:00.000Z" },
						count: { integerValue: "50" },
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const archive = await client.getArchive("ABC123", "arch-1");
			expect(archive.id).toBe("arch-1");
			expect(archive.label).toBe("BBQ Session");
			expect(archive.count).toBe(50);
			client.close();
		});

		it("throws NotFoundError for 404", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await expect(client.getArchive("ABC123", "missing")).rejects.toThrow(NotFoundError);
			client.close();
		});
	});

	describe("getCalibration", () => {
		it("returns calibration records", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					documents: [
						{
							name: "projects/thermoworks-app/databases/(default)/documents/devices/ABC123/calibration/cal-1",
							fields: {
								deviceId: { stringValue: "ABC123" },
								calibrationDate: { timestampValue: "2025-12-01T00:00:00.000Z" },
								performedBy: { stringValue: "ThermoWorks Lab" },
								result: { stringValue: "pass" },
							},
						},
					],
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const records = await client.getCalibration("ABC123");
			expect(records).toHaveLength(1);
			expect(records[0]?.calibrationId).toBe("cal-1");
			expect(records[0]?.deviceId).toBe("ABC123");
			expect(records[0]?.result).toBe("pass");
			client.close();
		});

		it("returns empty array when no documents", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const records = await client.getCalibration("ABC123");
			expect(records).toEqual([]);
			client.close();
		});
	});

	describe("getFirmwareInfo", () => {
		it("fetches firmware info by device type", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						name: { stringValue: "Smoke X4" },
						version: { stringValue: "2.1.0" },
						location: { stringValue: "https://firmware.thermoworks.com/smoke-x4-2.1.0.bin" },
						md5: { stringValue: "abc123def456" },
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const fw = await client.getFirmwareInfo("smoke_x4");
			expect(fw).not.toBeNull();
			expect(fw!.name).toBe("Smoke X4");
			expect(fw!.version).toBe("2.1.0");
			expect(fw!.location).toContain("smoke-x4");
			expect(fw!.md5).toBe("abc123def456");
			client.close();
		});

		it("returns null for 404", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const result = await client.getFirmwareInfo("unknown_type");
			expect(result).toBeNull();
			client.close();
		});
	});

	describe("getTemperatureGuide", () => {
		it("fetches temperature categories", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						categories: {
							arrayValue: {
								values: [
									{
										mapValue: {
											fields: {
												label: { stringValue: "Beef" },
												icon: { stringValue: "beef-icon" },
												pullWarning: { stringValue: "Pull 5F early" },
											},
										},
									},
									{
										mapValue: {
											fields: {
												label: { stringValue: "Poultry" },
												icon: { stringValue: "poultry-icon" },
												warning: { stringValue: "Must reach 165F" },
											},
										},
									},
								],
							},
						},
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const guide = await client.getTemperatureGuide();
			expect(guide.categories).toHaveLength(2);
			expect(guide.categories[0]?.label).toBe("Beef");
			expect(guide.categories[0]?.pullWarning).toBe("Pull 5F early");
			expect(guide.categories[1]?.label).toBe("Poultry");
			expect(guide.categories[1]?.warning).toBe("Must reach 165F");
			client.close();
		});

		it("throws NotFoundError for 404", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await expect(client.getTemperatureGuide()).rejects.toThrow(NotFoundError);
			client.close();
		});
	});

	describe("error handling", () => {
		it("throws on 500 server error from getDevices", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { fields: { accountId: { stringValue: "acct-123" } } }) as any,
			);
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { error: { message: "Internal Server Error" } }) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await expect(client.getDevices()).rejects.toThrow(NetworkError);
			client.close();
		});

		it("handles network failures gracefully", async () => {
			// Auth succeeds, but the actual API call fails on all retry attempts.
			// Use short retry delays to avoid hitting the test timeout.
			setupAuth();
			mockRequest.mockRejectedValueOnce(new Error("ECONNREFUSED"));
			mockRequest.mockRejectedValueOnce(new Error("ECONNREFUSED"));
			mockRequest.mockRejectedValueOnce(new Error("ECONNREFUSED"));

			const client = new ThermoworksCloud({
				email: "test@example.com",
				password: "pass",
				retry: { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50 },
			});
			await expect(client.getUser()).rejects.toThrow(NetworkError);
			client.close();
		});
	});
});
