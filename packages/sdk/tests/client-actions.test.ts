import { afterEach, describe, expect, it, vi } from "vitest";
import { ThermoworksCloud } from "../src/client.js";
import { NetworkError } from "../src/types.js";

vi.mock("undici", () => {
	const mockRequest = vi.fn();
	class MockAgent {
		close = vi.fn();
	}
	return { Agent: MockAgent, request: mockRequest };
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

function createClient() {
	return new ThermoworksCloud({ email: "test@example.com", password: "pass" });
}

function mockUserDoc(fields: Record<string, unknown>) {
	mockRequest.mockResolvedValueOnce(mockRes(200, { fields }) as any);
}

function mockAccountUser(accountId = "acct-1", extraFields: Record<string, unknown> = {}) {
	mockUserDoc({
		accountId: { stringValue: accountId },
		...extraFields,
	});
}

function lastCallBody() {
	const lastCall = mockRequest.mock.calls[mockRequest.mock.calls.length - 1];
	const body = (lastCall?.[1] as { body?: string } | undefined)?.body;
	return body ? JSON.parse(body) : null;
}

function lastCallUrl() {
	const lastCall = mockRequest.mock.calls[mockRequest.mock.calls.length - 1];
	return (lastCall?.[0] as string | undefined) ?? "";
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("ThermoworksCloud client actions", () => {
	describe("getNotificationSettings", () => {
		it("returns stored notification settings", async () => {
			setupAuth();
			mockUserDoc({
				notificationSettings: {
					mapValue: {
						fields: {
							enabled: { booleanValue: true },
							continuousAlerts: { booleanValue: true },
							emailNotification: { booleanValue: false },
							smsNotification: { booleanValue: true },
							deviceNotification: { booleanValue: true },
						},
					},
				},
			});

			const client = createClient();
			const settings = await client.getNotificationSettings();

			expect(settings).toEqual({
				enabled: true,
				continuousAlerts: true,
				emailNotification: false,
				smsNotification: true,
				deviceNotification: true,
			});
			client.close();
		});

		it("returns disabled defaults when settings are missing", async () => {
			setupAuth();
			mockUserDoc({});

			const client = createClient();
			const settings = await client.getNotificationSettings();

			expect(settings).toEqual({
				enabled: false,
				continuousAlerts: false,
				emailNotification: false,
				smsNotification: false,
				deviceNotification: false,
			});
			client.close();
		});
	});

	describe("updateNotificationSettings", () => {
		it("merges existing settings before patching", async () => {
			setupAuth();
			mockUserDoc({
				notificationSettings: {
					mapValue: {
						fields: {
							enabled: { booleanValue: true },
							continuousAlerts: { booleanValue: false },
							emailNotification: { booleanValue: true },
							smsNotification: { booleanValue: false },
							deviceNotification: { booleanValue: false },
						},
					},
				},
			});
			mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

			const client = createClient();
			await client.updateNotificationSettings({
				smsNotification: true,
				deviceNotification: true,
			});

			expect(lastCallUrl()).toContain("updateMask.fieldPaths=notificationSettings");
			expect(lastCallBody()).toEqual({
				fields: {
					notificationSettings: {
						mapValue: {
							fields: {
								enabled: { booleanValue: true },
								continuousAlerts: { booleanValue: false },
								emailNotification: { booleanValue: true },
								smsNotification: { booleanValue: true },
								deviceNotification: { booleanValue: true },
							},
						},
					},
				},
			});
			client.close();
		});

		it("throws a NetworkError when the patch request fails with 404", async () => {
			setupAuth();
			mockUserDoc({});
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = createClient();
			const promise = client.updateNotificationSettings({ enabled: true });
			await expect(promise).rejects.toBeInstanceOf(NetworkError);
			await expect(promise).rejects.toThrow("Failed to update notification settings: HTTP 404");
			client.close();
		});
	});

	describe("setAlarm", () => {
		it("patches only the high alarm when requested", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

			const client = createClient();
			await client.setAlarm("ABC123", 1, {
				high: { value: 275, units: "F", enabled: true },
			});

			expect(lastCallUrl()).toContain("updateMask.fieldPaths=alarmHigh");
			expect(lastCallBody()).toEqual({
				fields: {
					alarmHigh: {
						mapValue: {
							fields: {
								value: { doubleValue: 275 },
								units: { stringValue: "F" },
								enabled: { booleanValue: true },
							},
						},
					},
				},
			});
			client.close();
		});

		it("patches both high and low alarms with optional fields", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

			const client = createClient();
			await client.setAlarm("ABC123", 2, {
				high: { value: 260, enabled: true },
				low: { value: 32, units: "F", muted: true },
			});

			expect(lastCallUrl()).toContain(
				"updateMask.fieldPaths=alarmHigh&updateMask.fieldPaths=alarmLow",
			);
			expect(lastCallBody()).toEqual({
				fields: {
					alarmHigh: {
						mapValue: {
							fields: {
								value: { doubleValue: 260 },
								enabled: { booleanValue: true },
							},
						},
					},
					alarmLow: {
						mapValue: {
							fields: {
								value: { doubleValue: 32 },
								units: { stringValue: "F" },
								muted: { booleanValue: true },
							},
						},
					},
				},
			});
			client.close();
		});

		it("rejects empty alarm configurations", async () => {
			const client = createClient();
			await expect(client.setAlarm("ABC123", 1, {})).rejects.toThrow(
				"At least one of 'high' or 'low' must be provided",
			);
		});
	});

	describe("data usage", () => {
		it("formats zero-byte account usage", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(mockRes(200, null) as any);

			const client = createClient();
			const usage = await client.getDataUsage();

			expect(usage).toEqual({ totalBytes: 0, formattedSize: "0 B" });
			client.close();
		});

		it("formats per-device usage and default values", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, [{ deviceId: "ABC123", bytes: 512 }, { bytes: 2048 }]) as any,
			);

			const client = createClient();
			const usage = await client.getDataUsageByDevice();

			expect(usage).toEqual([
				{ deviceId: "ABC123", bytes: 512, formattedSize: "512 B" },
				{ deviceId: "", bytes: 2048, formattedSize: "2.00 KB" },
			]);
			client.close();
		});

		it("returns an empty array when device usage payload is not an array", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(mockRes(200, { totalBytes: 1024 }) as any);

			const client = createClient();
			const usage = await client.getDataUsageByDevice();

			expect(usage).toEqual([]);
			client.close();
		});

		it("formats megabyte account usage", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(mockRes(200, { totalBytes: 5 * 1024 * 1024 }) as any);

			const client = createClient();
			const usage = await client.getDataUsage();

			expect(usage).toEqual({ totalBytes: 5 * 1024 * 1024, formattedSize: "5.00 MB" });
			client.close();
		});
	});

	describe("billing plan", () => {
		it("returns null when the account document is missing", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = createClient();
			await expect(client.getBillingPlan()).resolves.toBeNull();
			client.close();
		});

		it("returns null when the account has no billing plan id", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

			const client = createClient();
			await expect(client.getBillingPlan()).resolves.toBeNull();
			client.close();
		});

		it("returns null when the billing plan document is missing", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { fields: { billingPlanId: { stringValue: "pro" } } }) as any,
			);
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = createClient();
			await expect(client.getBillingPlan()).resolves.toBeNull();
			client.close();
		});

		it("parses billing plan details", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { fields: { billingPlanId: { stringValue: "pro" } } }) as any,
			);
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						name: { stringValue: "Pro" },
						description: { stringValue: "More devices" },
						monthlyAmount: { integerValue: "19" },
						deviceCount: { integerValue: "8" },
						isDefault: { booleanValue: true },
					},
				}) as any,
			);

			const client = createClient();
			const plan = await client.getBillingPlan();

			expect(plan).toEqual({
				id: "pro",
				name: "Pro",
				description: "More devices",
				monthlyAmount: 19,
				deviceCount: 8,
				isDefault: true,
			});
			client.close();
		});
	});

	describe("invites and user removal", () => {
		it("parses account invites and extracts document ids", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, [
					{
						document: {
							name: "projects/test/databases/(default)/documents/usersInvites/invite-1",
							fields: {
								email: { stringValue: "friend@example.com" },
								status: { stringValue: "pending" },
								createdAt: { stringValue: "2024-01-01T00:00:00Z" },
							},
						},
					},
					{
						document: {
							name: "projects/test/databases/(default)/documents/usersInvites/invite-2",
							fields: {
								accountId: { stringValue: "acct-2" },
							},
						},
					},
				]) as any,
			);

			const client = createClient();
			const invites = await client.getInvites();

			expect(invites).toEqual([
				{
					id: "invite-1",
					accountId: "acct-1",
					email: "friend@example.com",
					status: "pending",
					createdAt: "2024-01-01T00:00:00Z",
				},
				{
					id: "invite-2",
					accountId: "acct-2",
					email: undefined,
					status: undefined,
					createdAt: undefined,
				},
			]);
			client.close();
		});

		it("returns an empty invite list for non-array query responses", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

			const client = createClient();
			await expect(client.getInvites()).resolves.toEqual([]);
			client.close();
		});

		it("throws a NetworkError for invite query error envelopes", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(mockRes(200, { error: { message: "bad query" } }) as any);

			const client = createClient();
			const promise = client.getInvites();
			await expect(promise).rejects.toBeInstanceOf(NetworkError);
			await expect(promise).rejects.toThrow("bad query");
			client.close();
		});

		it("validates user id before removing a user", async () => {
			const client = createClient();
			await expect(client.removeUser("")).rejects.toThrow("userId is required");
		});

		it("maps callable function error envelopes for removeUser", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { status: "error", message: "cannot remove owner" }) as any,
			);

			const client = createClient();
			const result = await client.removeUser("user-2");

			expect(result).toEqual({
				success: false,
				data: null,
				error: "cannot remove owner",
			});
			client.close();
		});
	});

	describe("search", () => {
		it("returns search hits and clamps page arguments", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					hits: [{ id: "device-1", score: 1.5, document: { label: "Pit Probe" } }],
					totalHits: 1,
					page: 3,
				}) as any,
			);

			const client = createClient();
			const result = await client.search("pit", {
				collection: "device",
				page: 0,
				pageSize: 500,
			});

			expect(result).toEqual({
				hits: [{ id: "device-1", score: 1.5, document: { label: "Pit Probe" } }],
				totalHits: 1,
				page: 3,
			});
			expect(lastCallBody()).toEqual({
				data: {
					query: "pit",
					collection: "device",
					page: 1,
					pageSize: 100,
				},
			});
			client.close();
		});

		it("returns default search values for null responses", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, null) as any);

			const client = createClient();
			const result = await client.search("pit", { collection: "users" });

			expect(result).toEqual({ hits: [], totalHits: 0, page: 1 });
			client.close();
		});

		it("validates search collection and query length", async () => {
			const client = createClient();
			await expect(client.search("pit", { collection: "invalid" as any })).rejects.toThrow(
				"Invalid search collection: invalid",
			);
			await expect(client.search("x".repeat(501), { collection: "device" })).rejects.toThrow(
				"Search query exceeds maximum length of 500 characters",
			);
		});
	});

	describe("session and device actions", () => {
		it("sanitizes labels for startSession", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { success: true, sessionId: "sess-1" }) as any,
			);

			const client = createClient();
			const result = await client.startSession("ABC123", "\u001b[31mCook\n\u001b[0m");

			expect(result).toEqual({
				success: true,
				data: { success: true, sessionId: "sess-1" },
				error: null,
			});
			expect(lastCallBody()).toEqual({
				data: {
					deviceId: "ABC123",
					label: "Cook",
				},
			});
			client.close();
		});

		it("maps error and null envelopes for endSession and clearSession", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { status: "error", message: "no active session" }) as any,
			);
			mockRequest.mockResolvedValueOnce(mockRes(200, null) as any);

			const client = createClient();
			const ended = await client.endSession("ABC123");
			const cleared = await client.clearSession("ABC123");

			expect(ended).toEqual({
				success: false,
				data: null,
				error: "no active session",
			});
			expect(cleared).toEqual({
				success: true,
				data: null,
				error: null,
			});
			client.close();
		});

		it("sends expected payloads for resetMinMax, clearEvents, and updateDeviceState", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, { success: true }) as any);
			mockRequest.mockResolvedValueOnce(mockRes(200, { success: true }) as any);
			mockRequest.mockResolvedValueOnce(mockRes(200, { success: true }) as any);

			const client = createClient();
			await client.resetMinMax("ABC123", 2);
			const resetBody = lastCallBody();
			await client.clearEvents("ABC123");
			const clearEventsBody = lastCallBody();
			await client.updateDeviceState("ABC123", { mode: "cool", fan: true });
			const updateBody = lastCallBody();

			expect(resetBody).toEqual({
				data: { deviceId: "ABC123", channelId: 2 },
			});
			expect(clearEventsBody).toEqual({
				data: { deviceId: "ABC123" },
			});
			expect(updateBody).toEqual({
				data: { deviceId: "ABC123", state: { mode: "cool", fan: true } },
			});
			client.close();
		});

		it("validates updateDeviceState input", async () => {
			const client = createClient();
			await expect(
				client.updateDeviceState("ABC123", [] as unknown as Record<string, unknown>),
			).rejects.toThrow("state must be a non-null object");
		});

		it("validates renameDevice inputs", async () => {
			const client = createClient();
			await expect(client.renameDevice("ABC123", "   ")).rejects.toThrow(
				"name must be a non-empty string",
			);
			await expect(client.renameDevice("ABC123", "x".repeat(201))).rejects.toThrow(
				"name exceeds maximum length of 200 characters",
			);
		});

		it("renames and factory resets devices via callable actions", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, { success: true, renamed: true }) as any);
			mockRequest.mockResolvedValueOnce(mockRes(200, { success: true }) as any);

			const client = createClient();
			const renamed = await client.renameDevice("ABC123", "Backyard");
			const renameBody = lastCallBody();
			const reset = await client.factoryReset("ABC123");
			const resetBody = lastCallBody();

			expect(renamed.success).toBe(true);
			expect(renameBody).toEqual({
				data: { deviceId: "ABC123", name: "Backyard" },
			});
			expect(reset.success).toBe(true);
			expect(resetBody).toEqual({
				data: { deviceId: "ABC123" },
			});
			client.close();
		});
	});

	describe("sharing and history", () => {
		it("returns a public link for shareDevice", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { success: true, publicLink: "https://share/device" }) as any,
			);

			const client = createClient();
			const result = await client.shareDevice("ABC123");

			expect(result).toEqual({ success: true, publicLink: "https://share/device" });
			client.close();
		});

		it("maps share failures and null archive share responses", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, { status: "error" }) as any);
			mockRequest.mockResolvedValueOnce(mockRes(200, null) as any);

			const client = createClient();
			const deviceShare = await client.shareDevice("ABC123");
			const archiveShare = await client.shareArchive("ABC123", "archive-1");

			expect(deviceShare).toEqual({ success: false });
			expect(archiveShare).toEqual({ success: true });
			client.close();
		});

		it("parses valid history readings and drops malformed entries", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					readings: [
						{ v: "225", ts: "2024-01-01T00:00:00Z", u: "F" },
						{ v: "bad", ts: "2024-01-01T00:01:00Z", u: "F" },
						{ v: "210", ts: "", u: "F" },
					],
				}) as any,
			);

			const client = createClient();
			const history = await client.getHistory("ABC123");

			expect(history).toEqual({
				deviceId: "ABC123",
				readings: [{ value: 225, timestamp: "2024-01-01T00:00:00Z", units: "F" }],
			});
			client.close();
		});

		it("returns empty history when the payload has no readings array", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

			const client = createClient();
			await expect(client.getHistory("ABC123")).resolves.toEqual({
				deviceId: "ABC123",
				readings: [],
			});
			client.close();
		});
	});

	describe("calibration helpers", () => {
		it("parses sparse calibration points and skips non-map entries", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					documents: [
						{
							name: "projects/test/databases/(default)/documents/devices/ABC123/calibration/cal-1",
							fields: {
								deviceId: { stringValue: "ABC123" },
								lowPointAdjustments: {
									arrayValue: {
										values: [
											{
												mapValue: {
													fields: {
														channel: { integerValue: "1" },
														value: { doubleValue: 212 },
														units: { stringValue: "F" },
														result: { stringValue: "PASS" },
													},
												},
											},
											{ stringValue: "ignore" },
										],
									},
								},
							},
						},
					],
				}) as any,
			);

			const client = createClient();
			const calibration = await client.getCalibration("ABC123");

			expect(calibration[0]?.lowPointAdjustments).toEqual([
				{
					channel: 1,
					value: 212,
					units: "F",
					referenceValue: 0,
					deviation: 0,
					trimValue: null,
					result: "PASS",
				},
			]);
			expect(calibration[0]?.highPointReference).toEqual([]);
			client.close();
		});
	});

	describe("device groups", () => {
		it("parses referenced device groups and falls back for missing group docs", async () => {
			setupAuth();
			mockUserDoc({
				accountId: { stringValue: "acct-1" },
				deviceGroupOrDeviceOrder: {
					mapValue: {
						fields: {
							"acct-1": {
								mapValue: {
									fields: {
										first: {
											mapValue: {
												fields: {
													id: { stringValue: "group-1" },
													type: { stringValue: "deviceGroup" },
												},
											},
										},
										second: {
											mapValue: {
												fields: {
													id: { stringValue: "group-2" },
													type: { stringValue: "deviceGroup" },
												},
											},
										},
										ignored: {
											mapValue: {
												fields: {
													id: { stringValue: "ABC123" },
													type: { stringValue: "device" },
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						name: { stringValue: "Backyard" },
						devices: {
							arrayValue: {
								values: [{ stringValue: "ABC123" }, { stringValue: "DEF456" }],
							},
						},
					},
				}) as any,
			);
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = createClient();
			const groups = await client.getDeviceGroups();

			expect(groups).toEqual([
				{ id: "group-1", name: "Backyard", devices: ["ABC123", "DEF456"] },
				{ id: "group-2", name: "", devices: [] },
			]);
			client.close();
		});

		it("creates a device group from account-scoped data", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					name: "projects/test/databases/(default)/documents/accounts/acct-1/deviceGroups/group-1",
				}) as any,
			);

			const client = createClient();
			const group = await client.createDeviceGroup("Weekend", ["ABC123", "DEF456"]);

			expect(group).toEqual({
				id: "group-1",
				name: "Weekend",
				devices: ["ABC123", "DEF456"],
			});
			expect(lastCallBody()).toEqual({
				fields: {
					name: { stringValue: "Weekend" },
					devices: {
						arrayValue: {
							values: [{ stringValue: "ABC123" }, { stringValue: "DEF456" }],
						},
					},
				},
			});
			client.close();
		});

		it("throws for unsupported deleteDeviceGroup", async () => {
			const client = createClient();
			await expect(client.deleteDeviceGroup("group-1")).rejects.toThrow(
				"deleteDeviceGroup is not yet supported: the device group write API is not fully documented",
			);
		});

		it("adds a device to a group by patching the devices array", async () => {
			setupAuth();
			mockUserDoc({
				accountId: { stringValue: "acct-1" },
				deviceGroupOrDeviceOrder: {
					mapValue: {
						fields: {
							"acct-1": {
								mapValue: {
									fields: {
										first: {
											mapValue: {
												fields: {
													id: { stringValue: "group-1" },
													type: { stringValue: "deviceGroup" },
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						name: { stringValue: "Backyard" },
						devices: {
							arrayValue: {
								values: [{ stringValue: "ABC123" }],
							},
						},
					},
				}) as any,
			);
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

			const client = createClient();
			await client.addDeviceToGroup("group-1", "DEF456");

			expect(lastCallBody()).toEqual({
				fields: {
					devices: {
						arrayValue: {
							values: [{ stringValue: "ABC123" }, { stringValue: "DEF456" }],
						},
					},
				},
			});
			client.close();
		});

		it("removes a device from a group by patching the devices array", async () => {
			setupAuth();
			mockUserDoc({
				accountId: { stringValue: "acct-1" },
				deviceGroupOrDeviceOrder: {
					mapValue: {
						fields: {
							"acct-1": {
								mapValue: {
									fields: {
										first: {
											mapValue: {
												fields: {
													id: { stringValue: "group-1" },
													type: { stringValue: "deviceGroup" },
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						name: { stringValue: "Backyard" },
						devices: {
							arrayValue: {
								values: [{ stringValue: "ABC123" }, { stringValue: "DEF456" }],
							},
						},
					},
				}) as any,
			);
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(mockRes(200, {}) as any);

			const client = createClient();
			await client.removeDeviceFromGroup("group-1", "ABC123");

			expect(lastCallBody()).toEqual({
				fields: {
					devices: {
						arrayValue: {
							values: [{ stringValue: "DEF456" }],
						},
					},
				},
			});
			client.close();
		});
	});

	describe("fan controls", () => {
		it("returns parsed fan settings or null when absent", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						serial: { stringValue: "ABC123" },
						fan: {
							mapValue: {
								fields: {
									connected: { booleanValue: true },
									connection: { booleanValue: false },
									setTemp: { integerValue: "225" },
									fan_channel: { stringValue: "1" },
									state: { integerValue: "3" },
								},
							},
						},
					},
				}) as any,
			);

			const clientWithFan = createClient();
			const fan = await clientWithFan.getFanState("ABC123");
			expect(fan).toEqual({
				connected: true,
				connection: false,
				setTemp: 225,
				fanChannel: "1",
				state: 3,
			});
			clientWithFan.close();

			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { fields: { serial: { stringValue: "ABC123" } } }) as any,
			);

			const clientWithoutFan = createClient();
			await expect(clientWithoutFan.getFanState("ABC123")).resolves.toBeNull();
			clientWithoutFan.close();
		});

		it("validates setFanTarget input", async () => {
			const client = createClient();
			await expect(client.setFanTarget("ABC123", Number.NaN)).rejects.toThrow(
				"targetTemp must be a finite number",
			);
		});

		it("sends fan control actions for target and enabled state", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, { success: true }) as any);
			mockRequest.mockResolvedValueOnce(mockRes(200, { success: false }) as any);

			const client = createClient();
			const targetResult = await client.setFanTarget("ABC123", 225);
			const targetBody = lastCallBody();
			const enabledResult = await client.setFanEnabled("ABC123", true);
			const enabledBody = lastCallBody();

			expect(targetResult.success).toBe(true);
			expect(targetBody).toEqual({
				data: { deviceId: "ABC123", fan: { setTemp: 225 } },
			});
			expect(enabledResult).toEqual({
				success: false,
				data: { success: false },
				error: null,
			});
			expect(enabledBody).toEqual({
				data: { deviceId: "ABC123", fan: { connection: true } },
			});
			client.close();
		});
	});

	describe("additional branch coverage", () => {
		it("returns no devices when the user has no account id", async () => {
			setupAuth();
			mockUserDoc({});

			const client = createClient();
			await expect(client.getDevices()).resolves.toEqual([]);
			client.close();
		});

		it("throws on device query error envelopes", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { error: { message: "query failed" } }) as any,
			);

			const client = createClient();
			await expect(client.getDevices()).rejects.toThrow("query failed");
			client.close();
		});

		it("ignores device query rows without document fields", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, [{ document: {} }, { skippedResults: 1 }]) as any,
			);

			const client = createClient();
			await expect(client.getDevices()).resolves.toEqual([]);
			client.close();
		});

		it("rethrows non-NotFound errors while probing all device channels", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(401, {}) as any);
			for (let i = 2; i <= 9; i++) {
				mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);
			}

			const client = createClient();
			await expect(client.getAllDeviceChannels("ABC123")).rejects.toThrow(NetworkError);
			client.close();
		});

		it("parses device events with lowercase fields and epoch timestamps", async () => {
			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, [
					{
						document: {
							name: "projects/test/databases/(default)/documents/events/event-1",
							fields: {
								eventType: { stringValue: "TEMP_HIGH" },
								severity: { integerValue: "2" },
								eventTime: { integerValue: "1704067200" },
								deviceId: { stringValue: "ABC123" },
								accountId: { stringValue: "acct-1" },
							},
						},
					},
				]) as any,
			);

			const client = createClient();
			const events = await client.getDeviceEvents("ABC123");

			expect(events).toEqual([
				{
					id: "event-1",
					eventType: "TEMP_HIGH",
					severity: 2,
					eventTime: new Date("2024-01-01T00:00:00.000Z"),
					deviceId: "ABC123",
					channelId: null,
					accountId: "acct-1",
					valueBefore: null,
					valueAfter: null,
					groups: null,
				},
			]);
			client.close();
		});

		it("parses archive channels and recent readings", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					documents: [
						{
							name: "projects/test/databases/(default)/documents/devices/ABC123/archive/archive-1",
							fields: {
								channels: {
									arrayValue: {
										values: [
											{
												mapValue: {
													fields: {
														number: { stringValue: "1" },
														label: { stringValue: "Pit" },
														recentReadings: {
															arrayValue: {
																values: [
																	{
																		mapValue: {
																			fields: {
																				v: { stringValue: "225" },
																				ts: {
																					timestampValue: "2024-01-01T00:00:00.000Z",
																				},
																				u: { stringValue: "F" },
																			},
																		},
																	},
																	{
																		mapValue: {
																			fields: {
																				value: { integerValue: "200" },
																				timestamp: {
																					timestampValue: "2024-01-01T00:01:00.000Z",
																				},
																				units: { stringValue: "F" },
																			},
																		},
																	},
																	{
																		mapValue: {
																			fields: {
																				v: { stringValue: "bad" },
																				u: { stringValue: "F" },
																			},
																		},
																	},
																],
															},
														},
													},
												},
											},
										],
									},
								},
							},
						},
					],
				}) as any,
			);

			const client = createClient();
			const archives = await client.getArchives("ABC123");

			expect(archives[0]?.channels?.[0]?.recentReadings).toEqual([
				{
					value: 225,
					timestamp: new Date("2024-01-01T00:00:00.000Z"),
					units: "F",
				},
				{
					value: 200,
					timestamp: new Date("2024-01-01T00:01:00.000Z"),
					units: "F",
				},
			]);
			client.close();
		});

		it("throws on archive list error envelopes", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { error: { message: "archive failed" } }) as any,
			);

			const client = createClient();
			await expect(client.getArchives("ABC123")).rejects.toThrow("archive failed");
			client.close();
		});

		it("parses temperature guide categories", async () => {
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
												icon: { stringValue: "cow" },
												pullWarning: { stringValue: "Rest before slicing" },
											},
										},
									},
									{ stringValue: "ignore" },
								],
							},
						},
					},
				}) as any,
			);

			const client = createClient();
			const guide = await client.getTemperatureGuide();

			expect(guide).toEqual({
				categories: [
					{
						label: "Beef",
						icon: "cow",
						pullWarning: "Rest before slicing",
						warning: null,
					},
				],
			});
			client.close();
		});

		it("falls back to default firmware info fields", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

			const client = createClient();
			const info = await client.getFirmwareInfo("signals");

			expect(info).toEqual({
				name: "signals",
				version: "",
				location: "",
				md5: "",
			});
			client.close();
		});

		it("returns empty device groups when account metadata is incomplete", async () => {
			setupAuth();
			mockUserDoc({});
			const clientNoAccount = createClient();
			await expect(clientNoAccount.getDeviceGroups()).resolves.toEqual([]);
			clientNoAccount.close();

			setupAuth();
			mockUserDoc({ accountId: { stringValue: "acct-1" } });
			const clientNoOrder = createClient();
			await expect(clientNoOrder.getDeviceGroups()).resolves.toEqual([]);
			clientNoOrder.close();

			setupAuth();
			mockUserDoc({
				accountId: { stringValue: "acct-1" },
				deviceGroupOrDeviceOrder: {
					mapValue: {
						fields: {
							other: {
								mapValue: {
									fields: {},
								},
							},
						},
					},
				},
			});
			const clientNoAccountMap = createClient();
			await expect(clientNoAccountMap.getDeviceGroups()).resolves.toEqual([]);
			clientNoAccountMap.close();
		});

		it("validates and handles createDeviceGroup failures", async () => {
			const client = createClient();
			await expect(client.createDeviceGroup("   ", [])).rejects.toThrow(
				"Group name must be a non-empty string",
			);
			await expect(client.createDeviceGroup("x".repeat(201), [])).rejects.toThrow(
				"Group name exceeds maximum length of 200 characters",
			);

			setupAuth();
			mockAccountUser();
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const failingClient = createClient();
			await expect(failingClient.createDeviceGroup("Weekend", ["ABC123"])).rejects.toThrow(
				"Failed to create group: 404",
			);
			failingClient.close();
		});

		it("handles addDeviceToGroup validation, missing groups, and no-op duplicates", async () => {
			const client = createClient();
			await expect(client.addDeviceToGroup("", "ABC123")).rejects.toThrow("groupId is required");

			setupAuth();
			mockUserDoc({ accountId: { stringValue: "acct-1" } });
			const missingClient = createClient();
			await expect(missingClient.addDeviceToGroup("group-1", "ABC123")).rejects.toThrow(
				"Group group-1 not found",
			);
			missingClient.close();

			setupAuth();
			mockUserDoc({
				accountId: { stringValue: "acct-1" },
				deviceGroupOrDeviceOrder: {
					mapValue: {
						fields: {
							"acct-1": {
								mapValue: {
									fields: {
										first: {
											mapValue: {
												fields: {
													id: { stringValue: "group-1" },
													type: { stringValue: "deviceGroup" },
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						devices: {
							arrayValue: {
								values: [{ stringValue: "ABC123" }],
							},
						},
					},
				}) as any,
			);
			const duplicateClient = createClient();
			const callsBefore = mockRequest.mock.calls.length;
			await duplicateClient.addDeviceToGroup("group-1", "ABC123");
			expect(mockRequest.mock.calls.length - callsBefore).toBe(4);
			duplicateClient.close();
		});

		it("handles removeDeviceFromGroup validation, missing groups, and no-op removals", async () => {
			const client = createClient();
			await expect(client.removeDeviceFromGroup("", "ABC123")).rejects.toThrow(
				"groupId is required",
			);

			setupAuth();
			mockUserDoc({ accountId: { stringValue: "acct-1" } });
			const missingClient = createClient();
			await expect(missingClient.removeDeviceFromGroup("group-1", "ABC123")).rejects.toThrow(
				"Group group-1 not found",
			);
			missingClient.close();

			setupAuth();
			mockUserDoc({
				accountId: { stringValue: "acct-1" },
				deviceGroupOrDeviceOrder: {
					mapValue: {
						fields: {
							"acct-1": {
								mapValue: {
									fields: {
										first: {
											mapValue: {
												fields: {
													id: { stringValue: "group-1" },
													type: { stringValue: "deviceGroup" },
												},
											},
										},
									},
								},
							},
						},
					},
				},
			});
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						devices: {
							arrayValue: {
								values: [{ stringValue: "DEF456" }],
							},
						},
					},
				}) as any,
			);
			const absentClient = createClient();
			const callsBefore = mockRequest.mock.calls.length;
			await absentClient.removeDeviceFromGroup("group-1", "ABC123");
			expect(mockRequest.mock.calls.length - callsBefore).toBe(4);
			absentClient.close();
		});

		it("validates shareArchive ids and startSession label length", async () => {
			const client = createClient();
			await expect(client.shareArchive("ABC123", "")).rejects.toThrow("archiveId is required");
			await expect(client.startSession("ABC123", "x".repeat(201))).rejects.toThrow(
				"label exceeds maximum length of 200 characters",
			);
		});

		it("omits labels when startSession is called without one", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, { success: true }) as any);

			const client = createClient();
			await client.startSession("ABC123");

			expect(lastCallBody()).toEqual({
				data: { deviceId: "ABC123" },
			});
			client.close();
		});

		it("parses boolean role maps and partial notification settings on getUser", async () => {
			setupAuth();
			mockUserDoc({
				accountRoles: {
					mapValue: {
						fields: {
							admin: { booleanValue: true },
							ignored: { stringValue: "yes" },
						},
					},
				},
				roles: {
					mapValue: {
						fields: {
							viewer: { booleanValue: false },
						},
					},
				},
				notificationSettings: {
					mapValue: {
						fields: {
							enabled: { booleanValue: true },
						},
					},
				},
			});

			const client = createClient();
			const user = await client.getUser();

			expect(user.accountRoles).toEqual({ admin: true });
			expect(user.roles).toEqual({ viewer: false });
			expect(user.notificationSettings).toEqual({
				enabled: true,
				continuousAlerts: false,
				emailNotification: false,
				smsNotification: false,
				deviceNotification: false,
			});
			client.close();
		});
	});
});
