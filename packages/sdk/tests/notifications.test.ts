import { afterEach, describe, expect, it, vi } from "vitest";
import { ThermoworksCloud } from "../src/client.js";
import type { NotificationSettings } from "../src/types.js";

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
	describe("getNotificationSettings", () => {
		it("returns notification settings from user document", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						accountId: { stringValue: "acct-123" },
						notificationSettings: {
							mapValue: {
								fields: {
									enabled: { booleanValue: true },
									continuousAlerts: { booleanValue: false },
									emailNotification: { booleanValue: true },
									smsNotification: { booleanValue: false },
									deviceNotification: { booleanValue: true },
								},
							},
						},
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const settings = await client.getNotificationSettings();
			expect(settings).toEqual({
				enabled: true,
				continuousAlerts: false,
				emailNotification: true,
				smsNotification: false,
				deviceNotification: true,
			});
			client.close();
		});

		it("returns defaults when user has no notification settings", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						accountId: { stringValue: "acct-123" },
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
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
		it("patches notification settings with full object", async () => {
			setupAuth();
			// First call: getUser (read current settings)
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						accountId: { stringValue: "acct-123" },
						notificationSettings: {
							mapValue: {
								fields: {
									enabled: { booleanValue: true },
									continuousAlerts: { booleanValue: false },
									emailNotification: { booleanValue: false },
									smsNotification: { booleanValue: false },
									deviceNotification: { booleanValue: true },
								},
							},
						},
					},
				}) as any,
			);
			// Second call: PATCH
			mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const newSettings: NotificationSettings = {
				enabled: true,
				continuousAlerts: true,
				emailNotification: true,
				smsNotification: true,
				deviceNotification: true,
			};
			await client.updateNotificationSettings(newSettings);

			// Verify the PATCH request
			const patchCall = mockRequest.mock.calls[3]; // auth(2) + getUser(1) + patch(1)
			const url = patchCall?.[0] as string;
			expect(url).toContain("documents/users/user1");
			expect(url).toContain("updateMask.fieldPaths=notificationSettings");

			const options = patchCall?.[1] as { method: string; body: string };
			expect(options.method).toBe("PATCH");

			const body = JSON.parse(options.body);
			expect(body.fields.notificationSettings.mapValue.fields).toEqual({
				enabled: { booleanValue: true },
				continuousAlerts: { booleanValue: true },
				emailNotification: { booleanValue: true },
				smsNotification: { booleanValue: true },
				deviceNotification: { booleanValue: true },
			});
			client.close();
		});

		it("merges partial settings with current values", async () => {
			setupAuth();
			// getUser returns current settings
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						accountId: { stringValue: "acct-123" },
						notificationSettings: {
							mapValue: {
								fields: {
									enabled: { booleanValue: true },
									continuousAlerts: { booleanValue: false },
									emailNotification: { booleanValue: false },
									smsNotification: { booleanValue: false },
									deviceNotification: { booleanValue: true },
								},
							},
						},
					},
				}) as any,
			);
			// PATCH response
			mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			// Only update emailNotification
			await client.updateNotificationSettings({ emailNotification: true });

			const patchCall = mockRequest.mock.calls[3];
			const options = patchCall?.[1] as { body: string };
			const body = JSON.parse(options.body);

			// emailNotification should be true, rest should retain original values
			expect(body.fields.notificationSettings.mapValue.fields).toEqual({
				enabled: { booleanValue: true },
				continuousAlerts: { booleanValue: false },
				emailNotification: { booleanValue: true },
				smsNotification: { booleanValue: false },
				deviceNotification: { booleanValue: true },
			});
			client.close();
		});

		it("uses defaults when no existing settings and applies partial update", async () => {
			setupAuth();
			// getUser returns no notification settings
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						accountId: { stringValue: "acct-123" },
					},
				}) as any,
			);
			// PATCH response
			mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await client.updateNotificationSettings({ enabled: true, smsNotification: true });

			const patchCall = mockRequest.mock.calls[3];
			const options = patchCall?.[1] as { body: string };
			const body = JSON.parse(options.body);

			expect(body.fields.notificationSettings.mapValue.fields).toEqual({
				enabled: { booleanValue: true },
				continuousAlerts: { booleanValue: false },
				emailNotification: { booleanValue: false },
				smsNotification: { booleanValue: true },
				deviceNotification: { booleanValue: false },
			});
			client.close();
		});

		it("throws NetworkError on failure", async () => {
			setupAuth();
			// getUser
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						accountId: { stringValue: "acct-123" },
						notificationSettings: {
							mapValue: {
								fields: {
									enabled: { booleanValue: true },
									continuousAlerts: { booleanValue: false },
									emailNotification: { booleanValue: false },
									smsNotification: { booleanValue: false },
									deviceNotification: { booleanValue: true },
								},
							},
						},
					},
				}) as any,
			);
			// PATCH fails with 403
			mockRequest.mockResolvedValueOnce(mockRes(403, { error: { message: "Forbidden" } }) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await expect(client.updateNotificationSettings({ enabled: false })).rejects.toThrow(
				/HTTP 403/,
			);
			client.close();
		});
	});
});
