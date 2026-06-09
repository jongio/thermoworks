import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type AlarmState,
	AuthError,
	getChannelAlarmState,
	getPublicArchive,
	getPublicDevice,
	getPublicDeviceChannels,
	ThermoworksWebClient,
} from "../src/lib/api.ts";

// ─── Fetch mock infrastructure ──────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Suppress window.location usage in shareDevice/shareArchive
Object.defineProperty(globalThis, "window", {
	value: {
		location: { origin: "https://cloud.thermoworks.com", pathname: "/" },
	},
	writable: true,
});

function jsonResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
		text: () => Promise.resolve(JSON.stringify(body)),
	} as Response;
}

function errorResponse(status: number, body?: unknown): Response {
	return {
		ok: false,
		status,
		json: () => Promise.resolve(body ?? { error: { message: "MOCK_ERROR" } }),
		text: () => Promise.resolve(JSON.stringify(body ?? {})),
	} as Response;
}

// Standard responses for login + project ID fetch (used by most tests)
const LOGIN_RESPONSE = {
	idToken: "mock-id-token",
	refreshToken: "mock-refresh-token",
	localId: "user-123",
	expiresIn: "3600",
};

const PROJECT_ID_RESPONSE = { projectId: "thermoworks-cloud" };

const REFRESH_RESPONSE = {
	id_token: "refreshed-token",
	refresh_token: "new-refresh-token",
	user_id: "user-123",
	expires_in: "3600",
};

/**
 * Configures mockFetch to handle the login + projectId fetch sequence,
 * then sets up subsequent responses for the test.
 */
function setupAuthenticatedClient(subsequentResponses: Response[] = []): void {
	const responses = [
		// login call
		jsonResponse(LOGIN_RESPONSE),
		// fetchProjectId call
		jsonResponse(PROJECT_ID_RESPONSE),
		...subsequentResponses,
	];
	for (const resp of responses) {
		mockFetch.mockResolvedValueOnce(resp);
	}
}

async function createAuthenticatedClient(): Promise<ThermoworksWebClient> {
	const client = new ThermoworksWebClient();
	setupAuthenticatedClient();
	await client.login("test@example.com", "password123");
	return client;
}

// ─── getChannelAlarmState tests ─────────────────────────────────────────────

describe("getChannelAlarmState", () => {
	it("returns 'high' when alarmHigh is alarming", () => {
		const channel = {
			value: 200,
			units: "F",
			label: "Probe 1",
			status: null,
			type: null,
			number: "1",
			enabled: true,
			color: null,
			lastSeen: null,
			lastTelemetrySaved: null,
			lastEventId: null,
			showAvgTemp: null,
			estimatedAlarmStatus: null,
			rateOfChange: null,
			rateOfChangeUnit: null,
			alarmHigh: {
				enabled: true,
				alarming: true,
				muted: null,
				value: 180,
				units: "F",
				lastNotified: null,
			},
			alarmLow: {
				enabled: true,
				alarming: false,
				muted: null,
				value: 32,
				units: "F",
				lastNotified: null,
			},
			minimum: null,
			maximum: null,
		};
		expect(getChannelAlarmState(channel)).toBe("high");
	});

	it("returns 'low' when alarmLow is alarming", () => {
		const channel = {
			value: 20,
			units: "F",
			label: "Probe 1",
			status: null,
			type: null,
			number: "1",
			enabled: true,
			color: null,
			lastSeen: null,
			lastTelemetrySaved: null,
			lastEventId: null,
			showAvgTemp: null,
			estimatedAlarmStatus: null,
			rateOfChange: null,
			rateOfChangeUnit: null,
			alarmHigh: {
				enabled: true,
				alarming: false,
				muted: null,
				value: 180,
				units: "F",
				lastNotified: null,
			},
			alarmLow: {
				enabled: true,
				alarming: true,
				muted: null,
				value: 32,
				units: "F",
				lastNotified: null,
			},
			minimum: null,
			maximum: null,
		};
		expect(getChannelAlarmState(channel)).toBe("low");
	});

	it("returns 'none' when no alarms are active", () => {
		const channel = {
			value: 100,
			units: "F",
			label: "Probe 1",
			status: null,
			type: null,
			number: "1",
			enabled: true,
			color: null,
			lastSeen: null,
			lastTelemetrySaved: null,
			lastEventId: null,
			showAvgTemp: null,
			estimatedAlarmStatus: null,
			rateOfChange: null,
			rateOfChangeUnit: null,
			alarmHigh: {
				enabled: true,
				alarming: false,
				muted: null,
				value: 180,
				units: "F",
				lastNotified: null,
			},
			alarmLow: {
				enabled: true,
				alarming: false,
				muted: null,
				value: 32,
				units: "F",
				lastNotified: null,
			},
			minimum: null,
			maximum: null,
		};
		expect(getChannelAlarmState(channel)).toBe("none");
	});

	it("returns 'none' when alarms are null", () => {
		const channel = {
			value: 100,
			units: "F",
			label: null,
			status: null,
			type: null,
			number: null,
			enabled: null,
			color: null,
			lastSeen: null,
			lastTelemetrySaved: null,
			lastEventId: null,
			showAvgTemp: null,
			estimatedAlarmStatus: null,
			rateOfChange: null,
			rateOfChangeUnit: null,
			alarmHigh: null,
			alarmLow: null,
			minimum: null,
			maximum: null,
		};
		expect(getChannelAlarmState(channel)).toBe("none");
	});

	it("prioritizes high alarm over low when both are alarming", () => {
		const channel = {
			value: 200,
			units: "F",
			label: "Probe 1",
			status: null,
			type: null,
			number: "1",
			enabled: true,
			color: null,
			lastSeen: null,
			lastTelemetrySaved: null,
			lastEventId: null,
			showAvgTemp: null,
			estimatedAlarmStatus: null,
			rateOfChange: null,
			rateOfChangeUnit: null,
			alarmHigh: {
				enabled: true,
				alarming: true,
				muted: null,
				value: 180,
				units: "F",
				lastNotified: null,
			},
			alarmLow: {
				enabled: true,
				alarming: true,
				muted: null,
				value: 32,
				units: "F",
				lastNotified: null,
			},
			minimum: null,
			maximum: null,
		};
		expect(getChannelAlarmState(channel)).toBe("high");
	});
});

// ─── AuthError ───────────────────────────────────────────────────────────────

describe("AuthError", () => {
	it("carries a reason property and sets the name", () => {
		const err = new AuthError("test message", "INVALID_CREDS");
		expect(err.message).toBe("test message");
		expect(err.reason).toBe("INVALID_CREDS");
		expect(err.name).toBe("AuthError");
		expect(err).toBeInstanceOf(Error);
	});
});

// ─── ThermoworksWebClient ────────────────────────────────────────────────────

describe("ThermoworksWebClient", () => {
	beforeEach(() => {
		mockFetch.mockReset();
		sessionStorage.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ─── login ─────────────────────────────────────────────────────────────

	describe("login", () => {
		it("sends credentials to identity endpoint and fetches projectId", async () => {
			const client = new ThermoworksWebClient();
			setupAuthenticatedClient();
			await client.login("user@test.com", "pass123");

			expect(client.isAuthenticated).toBe(true);

			// First call: login
			const loginCall = mockFetch.mock.calls[0];
			expect(loginCall[0]).toContain("/v1/accounts:signInWithPassword");
			expect(loginCall[0]).toContain("key=");
			const loginBody = JSON.parse(loginCall[1].body);
			expect(loginBody.email).toBe("user@test.com");
			expect(loginBody.password).toBe("pass123");
			expect(loginBody.returnSecureToken).toBe(true);

			// Second call: fetchProjectId
			const projCall = mockFetch.mock.calls[1];
			expect(projCall[0]).toContain("/v1alpha/projects/-/apps/");
			expect(projCall[0]).toContain("/webConfig");
		});

		it("throws AuthError on invalid credentials (HTTP 400)", async () => {
			const client = new ThermoworksWebClient();
			mockFetch
				.mockResolvedValueOnce(errorResponse(400, { error: { message: "INVALID_PASSWORD" } }))
				.mockResolvedValueOnce(jsonResponse(PROJECT_ID_RESPONSE));

			await expect(client.login("user@test.com", "wrong")).rejects.toThrow(AuthError);
			await expect(
				(async () => {
					const c = new ThermoworksWebClient();
					mockFetch
						.mockResolvedValueOnce(errorResponse(400, { error: { message: "EMAIL_NOT_FOUND" } }))
						.mockResolvedValueOnce(jsonResponse(PROJECT_ID_RESPONSE));
					await c.login("nouser@test.com", "any");
				})(),
			).rejects.toThrow("Authentication failed: EMAIL_NOT_FOUND");
		});

		it("handles network errors gracefully", async () => {
			const client = new ThermoworksWebClient();
			mockFetch.mockRejectedValueOnce(new Error("Network failure"));

			await expect(client.login("user@test.com", "pass")).rejects.toThrow("Network failure");
			expect(client.isAuthenticated).toBe(false);
		});

		it("handles malformed error JSON response", async () => {
			const client = new ThermoworksWebClient();
			mockFetch
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
					json: () => Promise.reject(new Error("bad json")),
				} as unknown as Response)
				.mockResolvedValueOnce(jsonResponse(PROJECT_ID_RESPONSE));

			await expect(client.login("user@test.com", "pass")).rejects.toThrow(
				"Authentication failed: UNKNOWN",
			);
		});
	});

	// ─── logout ────────────────────────────────────────────────────────────

	describe("logout", () => {
		it("clears authentication state", async () => {
			const client = await createAuthenticatedClient();
			expect(client.isAuthenticated).toBe(true);
			client.logout();
			expect(client.isAuthenticated).toBe(false);
		});
	});

	// ─── token refresh ─────────────────────────────────────────────────────

	describe("token refresh", () => {
		it("refreshes token when expired and reuses for subsequent calls", async () => {
			const client = new ThermoworksWebClient();
			// Login with token that expires immediately
			const expiredLogin = {
				...LOGIN_RESPONSE,
				expiresIn: "0", // expires immediately
			};
			mockFetch
				.mockResolvedValueOnce(jsonResponse(expiredLogin))
				.mockResolvedValueOnce(jsonResponse(PROJECT_ID_RESPONSE));

			await client.login("test@example.com", "pass");

			// Next call triggers refresh, then the actual request
			mockFetch.mockResolvedValueOnce(jsonResponse(REFRESH_RESPONSE)).mockResolvedValueOnce(
				jsonResponse({
					fields: {
						accountId: { stringValue: "acc-1" },
						email: { stringValue: "test@example.com" },
					},
				}),
			);

			const user = await client.getUser();
			expect(user.email).toBe("test@example.com");

			// Verify the refresh call was made to the token endpoint
			const refreshCall = mockFetch.mock.calls[2];
			expect(refreshCall[0]).toContain("/v1/token");
			const refreshBody = JSON.parse(refreshCall[1].body);
			expect(refreshBody.grant_type).toBe("refresh_token");
			expect(refreshBody.refresh_token).toBe("mock-refresh-token");
		});

		it("throws AuthError when refresh fails", async () => {
			const client = new ThermoworksWebClient();
			const expiredLogin = { ...LOGIN_RESPONSE, expiresIn: "0" };
			mockFetch
				.mockResolvedValueOnce(jsonResponse(expiredLogin))
				.mockResolvedValueOnce(jsonResponse(PROJECT_ID_RESPONSE));

			await client.login("test@example.com", "pass");

			mockFetch.mockResolvedValueOnce(errorResponse(401));

			await expect(client.getUser()).rejects.toThrow(AuthError);
		});
	});

	// ─── getUser ───────────────────────────────────────────────────────────

	describe("getUser", () => {
		it("fetches user document and parses all fields", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: {
						accountId: { stringValue: "acc-42" },
						email: { stringValue: "user@test.com" },
						displayName: { stringValue: "Test User" },
						timeZone: { stringValue: "America/Denver" },
						preferredUnits: { stringValue: "F" },
						locale: { stringValue: "en-US" },
						photoURL: { stringValue: "https://example.com/photo.png" },
						use24Time: { booleanValue: false },
						lastLogin: { timestampValue: "2026-01-01T00:00:00Z" },
						appVersion: { stringValue: "2.0.1" },
						accountRoles: { mapValue: { fields: { admin: { booleanValue: true } } } },
						roles: { mapValue: { fields: { owner: { booleanValue: true } } } },
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
				}),
			);

			const user = await client.getUser();
			expect(user.userId).toBe("user-123");
			expect(user.accountId).toBe("acc-42");
			expect(user.email).toBe("user@test.com");
			expect(user.displayName).toBe("Test User");
			expect(user.timeZone).toBe("America/Denver");
			expect(user.preferredUnits).toBe("F");
			expect(user.locale).toBe("en-US");
			expect(user.photoUrl).toBe("https://example.com/photo.png");
			expect(user.use24Time).toBe(false);
			expect(user.lastLogin).toEqual(new Date("2026-01-01T00:00:00Z"));
			expect(user.appVersion).toBe("2.0.1");
			expect(user.accountRoles).toEqual({ admin: true });
			expect(user.roles).toEqual({ owner: true });
			expect(user.notificationSettings).toEqual({
				enabled: true,
				continuousAlerts: false,
				emailNotification: true,
				smsNotification: false,
				deviceNotification: true,
			});
		});

		it("throws when not authenticated", async () => {
			const client = new ThermoworksWebClient();
			await expect(client.getUser()).rejects.toThrow(AuthError);
		});

		it("throws when user document not found (404)", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(errorResponse(404));

			await expect(client.getUser()).rejects.toThrow("User not found");
		});

		it("handles missing optional fields", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({ fields: {} }));

			const user = await client.getUser();
			expect(user.accountId).toBeNull();
			expect(user.email).toBeNull();
			expect(user.displayName).toBeNull();
			expect(user.notificationSettings).toBeNull();
		});
	});

	// ─── getAccount ────────────────────────────────────────────────────────

	describe("getAccount", () => {
		it("fetches and parses account document", async () => {
			const client = await createAuthenticatedClient();
			// getAccountId -> getUser
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-99" } },
				}),
			);
			// getAccount doc fetch
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: {
						name: { stringValue: "My Account" },
						billingPlanId: { stringValue: "plan-pro" },
						devicesUsed: { integerValue: "3" },
					},
				}),
			);
			// billing plan lookup
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: {
						name: { stringValue: "Pro" },
						deviceCount: { integerValue: "10" },
					},
				}),
			);

			const account = await client.getAccount();
			expect(account.id).toBe("acc-99");
			expect(account.name).toBe("My Account");
			expect(account.plan).toBe("Pro");
			expect(account.devicesUsed).toBe(3);
			expect(account.devicesLimit).toBe(10);
			expect(account.devicesLimit).toBe(10);
		});

		it("returns defaults when account document not found", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-99" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(errorResponse(404));

			const account = await client.getAccount();
			expect(account.id).toBe("acc-99");
			expect(account.name).toBeNull();
			expect(account.devicesUsed).toBe(0);
			expect(account.devicesLimit).toBe(0);
		});
	});

	// ─── getDevices ────────────────────────────────────────────────────────

	describe("getDevices", () => {
		it("queries Firestore with account filter and parses devices", async () => {
			const client = await createAuthenticatedClient();
			// getAccountId -> getUser
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			// runQuery
			mockFetch.mockResolvedValueOnce(
				jsonResponse([
					{
						document: {
							fields: {
								serial: { stringValue: "SN-001" },
								label: { stringValue: "Smoker" },
								type: { stringValue: "signals" },
								status: { stringValue: "online" },
								battery: { integerValue: "95" },
								firmware: { stringValue: "1.0.2" },
							},
						},
					},
					{
						document: {
							fields: {
								serial: { stringValue: "SN-002" },
								label: { stringValue: "Oven" },
								type: { stringValue: "node" },
								status: { stringValue: "offline" },
							},
						},
					},
				]),
			);

			const devices = await client.getDevices();
			expect(devices).toHaveLength(2);
			expect(devices[0].serial).toBe("SN-001");
			expect(devices[0].label).toBe("Smoker");
			expect(devices[0].type).toBe("signals");
			expect(devices[0].battery).toBe(95);
			expect(devices[1].serial).toBe("SN-002");
			expect(devices[1].label).toBe("Oven");

			// Verify query body
			const queryCall = mockFetch.mock.calls[3]; // login, projId, getUser, runQuery
			expect(queryCall[0]).toContain("documents:runQuery");
			const queryBody = JSON.parse(queryCall[1].body);
			expect(queryBody.structuredQuery.from[0].collectionId).toBe("devices");
			expect(queryBody.structuredQuery.where.fieldFilter.field.fieldPath).toBe("accountId");
			expect(queryBody.structuredQuery.where.fieldFilter.value.stringValue).toBe("acc-1");
		});

		it("returns empty array when response is not an array", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(jsonResponse({ notAnArray: true }));

			const devices = await client.getDevices();
			expect(devices).toEqual([]);
		});

		it("skips results without document fields", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(
				jsonResponse([
					{ readTime: "2026-01-01T00:00:00Z" }, // no document
					{ document: {} }, // no fields
					{ document: { fields: { serial: { stringValue: "SN-003" } } } },
				]),
			);

			const devices = await client.getDevices();
			expect(devices).toHaveLength(1);
			expect(devices[0].serial).toBe("SN-003");
		});

		it("parses device with gateway, fan, and bigQuery nested maps", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(
				jsonResponse([
					{
						document: {
							fields: {
								serial: { stringValue: "SN-GW" },
								gatewayId: { stringValue: "gw-123" },
								gatewayRSSI: { integerValue: "-45" },
								gatewayLastSeen: { timestampValue: "2026-06-01T12:00:00Z" },
								fan: {
									mapValue: {
										fields: {
											connected: { booleanValue: true },
											connection: { booleanValue: true },
											setTemp: { doubleValue: 225.0 },
											fan_channel: { stringValue: "ch1" },
											state: { integerValue: "2" },
										},
									},
								},
								bigQuery: {
									mapValue: {
										fields: {
											datasetId: { stringValue: "ds-1" },
											tableId: { stringValue: "tbl-1" },
										},
									},
								},
							},
						},
					},
				]),
			);

			const devices = await client.getDevices();
			expect(devices[0].gateway).toEqual({
				gatewayId: "gw-123",
				rssi: -45,
				lastSeen: new Date("2026-06-01T12:00:00Z"),
				switchedAt: null,
				lastPacketId: null,
			});
			expect(devices[0].fan).toEqual({
				connected: true,
				connection: true,
				setTemp: 225.0,
				fanChannel: "ch1",
				state: 2,
			});
			expect(devices[0].bigQuery).toEqual({
				datasetId: "ds-1",
				tableId: "tbl-1",
			});
		});
	});

	// ─── getAllDeviceChannels ───────────────────────────────────────────────

	describe("getAllDeviceChannels", () => {
		it("fetches channel collection and returns parsed results", async () => {
			const client = await createAuthenticatedClient();

			// Single collection GET returns documents array
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					documents: [
						{
							fields: {
								number: { stringValue: "1" },
								value: { doubleValue: 101 },
								units: { stringValue: "F" },
								label: { stringValue: "Channel 1" },
								status: { stringValue: "active" },
								enabled: { booleanValue: true },
							},
						},
						{
							fields: {
								number: { stringValue: "2" },
								value: { doubleValue: 102 },
								units: { stringValue: "F" },
								label: { stringValue: "Channel 2" },
								status: { stringValue: "active" },
								enabled: { booleanValue: true },
							},
						},
						{
							fields: {
								number: { stringValue: "3" },
								value: { doubleValue: 103 },
								units: { stringValue: "F" },
								label: { stringValue: "Channel 3" },
								status: { stringValue: "active" },
								enabled: { booleanValue: true },
							},
						},
						{
							fields: {
								number: { stringValue: "4" },
								value: { doubleValue: 104 },
								units: { stringValue: "F" },
								label: { stringValue: "Channel 4" },
								status: { stringValue: "active" },
								enabled: { booleanValue: true },
							},
						},
					],
				}),
			);

			const channels = await client.getAllDeviceChannels("SN-001");
			expect(channels).toHaveLength(4);
			expect(channels[0].number).toBe("1");
			expect(channels[0].value).toBe(101);
			expect(channels[3].number).toBe("4");
			expect(channels[3].value).toBe(104);
		});

		it("returns empty array when no channels exist", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const channels = await client.getAllDeviceChannels("SN-EMPTY");
			expect(channels).toEqual([]);
		});

		it("returns empty array on HTTP error", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(errorResponse(500));

			const channels = await client.getAllDeviceChannels("SN-ERR");
			expect(channels).toEqual([]);
		});

		it("parses alarm and min/max data on channels", async () => {
			const client = await createAuthenticatedClient();
			// Single collection GET returns documents array with one channel
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					documents: [
						{
							fields: {
								number: { stringValue: "1" },
								value: { doubleValue: 165.5 },
								units: { stringValue: "F" },
								label: { stringValue: "Meat" },
								enabled: { booleanValue: true },
								status: { stringValue: "active" },
								alarmHigh: {
									mapValue: {
										fields: {
											enabled: { booleanValue: true },
											alarming: { booleanValue: false },
											value: { doubleValue: 200.0 },
											units: { stringValue: "F" },
										},
									},
								},
								alarmLow: {
									mapValue: {
										fields: {
											enabled: { booleanValue: true },
											alarming: { booleanValue: false },
											value: { doubleValue: 32.0 },
											units: { stringValue: "F" },
										},
									},
								},
								minimum: {
									mapValue: {
										fields: {
											reading: {
												mapValue: {
													fields: { value: { doubleValue: 40.0 }, units: { stringValue: "F" } },
												},
											},
											dateReading: { timestampValue: "2026-06-01T10:00:00Z" },
										},
									},
								},
								maximum: {
									mapValue: {
										fields: {
											reading: {
												mapValue: {
													fields: { value: { doubleValue: 190.0 }, units: { stringValue: "F" } },
												},
											},
											dateReading: { timestampValue: "2026-06-01T14:00:00Z" },
										},
									},
								},
							},
						},
					],
				}),
			);

			const channels = await client.getAllDeviceChannels("SN-001");
			expect(channels).toHaveLength(1);
			const ch = channels[0];
			expect(ch.alarmHigh).toEqual({
				enabled: true,
				alarming: false,
				muted: null,
				value: 200.0,
				units: "F",
				lastNotified: null,
			});
			expect(ch.alarmLow?.value).toBe(32.0);
			expect(ch.minimum?.value).toBe(40.0);
			expect(ch.minimum?.units).toBe("F");
			expect(ch.minimum?.date).toEqual(new Date("2026-06-01T10:00:00Z"));
			expect(ch.maximum?.value).toBe(190.0);
			expect(ch.maximum?.date).toEqual(new Date("2026-06-01T14:00:00Z"));
		});
	});

	// ─── getDevicesWithChannels ─────────────────────────────────────────────

	describe("getDevicesWithChannels", () => {
		it("returns devices paired with their channels", async () => {
			const client = await createAuthenticatedClient();
			// getAccountId -> getUser
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			// getDevices query
			mockFetch.mockResolvedValueOnce(
				jsonResponse([{ document: { fields: { serial: { stringValue: "SN-A" } } } }]),
			);
			// getAllDeviceChannels for SN-A (single collection GET)
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					documents: [
						{
							fields: {
								number: { stringValue: "1" },
								value: { doubleValue: 72 },
								units: { stringValue: "F" },
							},
						},
					],
				}),
			);

			const result = await client.getDevicesWithChannels();
			expect(result).toHaveLength(1);
			expect(result[0].device.serial).toBe("SN-A");
			expect(result[0].channels).toHaveLength(1);
			expect(result[0].channels[0].value).toBe(72);
		});
	});

	// ─── getArchives ───────────────────────────────────────────────────────

	describe("getArchives", () => {
		it("fetches archive list with pagination", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					documents: [
						{
							name: "projects/p/databases/(default)/documents/devices/SN-1/archive/arc-1",
							fields: {
								start: { timestampValue: "2026-01-01T00:00:00Z" },
								end: { timestampValue: "2026-01-01T06:00:00Z" },
								count: { integerValue: "1200" },
								type: { stringValue: "session" },
								label: { stringValue: "Brisket Cook" },
								createdOn: { timestampValue: "2026-01-01T06:00:00Z" },
								channels: {
									arrayValue: {
										values: [
											{
												mapValue: {
													fields: {
														number: { stringValue: "1" },
														label: { stringValue: "Meat" },
														units: { stringValue: "F" },
														value: { doubleValue: 203 },
													},
												},
											},
										],
									},
								},
							},
						},
					],
				}),
			);

			const archives = await client.getArchives("SN-1", 10);
			expect(archives).toHaveLength(1);
			expect(archives[0].id).toBe("arc-1");
			expect(archives[0].label).toBe("Brisket Cook");
			expect(archives[0].count).toBe(1200);
			expect(archives[0].start).toEqual(new Date("2026-01-01T00:00:00Z"));
			expect(archives[0].channels).toHaveLength(1);
			expect(archives[0].channels![0].label).toBe("Meat");

			// Verify URL includes pageSize and ordering
			const archiveCall = mockFetch.mock.calls[2]; // login, projId, archives
			expect(archiveCall[0]).toContain("pageSize=10");
			expect(archiveCall[0]).toContain("orderBy=createdOn");
		});

		it("returns empty array when no documents", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({ documents: undefined }));

			const archives = await client.getArchives("SN-1");
			expect(archives).toEqual([]);
		});

		it("clamps limit to valid range (1-500)", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({ documents: [] }));

			await client.getArchives("SN-1", 9999);
			const call = mockFetch.mock.calls[2];
			expect(call[0]).toContain("pageSize=500");
		});

		it("throws on HTTP error", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(errorResponse(500));

			await expect(client.getArchives("SN-1")).rejects.toThrow("Failed to list archives");
		});
	});

	// ─── getTemperatureGuide ───────────────────────────────────────────────

	describe("getTemperatureGuide", () => {
		it("parses nested category/item structure", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: {
						categories: {
							arrayValue: {
								values: [
									{
										mapValue: {
											fields: {
												name: { stringValue: "Beef" },
												items: {
													arrayValue: {
														values: [
															{
																mapValue: {
																	fields: {
																		name: { stringValue: "Medium Rare" },
																		temp: { integerValue: "130" },
																		units: { stringValue: "F" },
																		doneness: { stringValue: "pink center" },
																	},
																},
															},
															{
																mapValue: {
																	fields: {
																		name: { stringValue: "Well Done" },
																		temp: { doubleValue: 160.0 },
																		units: { stringValue: "F" },
																	},
																},
															},
														],
													},
												},
											},
										},
									},
									{
										mapValue: {
											fields: {
												name: { stringValue: "Poultry" },
												items: {
													arrayValue: {
														values: [
															{
																mapValue: {
																	fields: {
																		name: { stringValue: "Chicken" },
																		temp: { integerValue: "165" },
																		units: { stringValue: "F" },
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
				}),
			);

			const guide = await client.getTemperatureGuide();
			expect(guide.categories).toHaveLength(2);
			expect(guide.categories[0].name).toBe("Beef");
			expect(guide.categories[0].items).toHaveLength(2);
			expect(guide.categories[0].items[0]).toEqual({
				name: "Medium Rare",
				temp: 130,
				units: "F",
				doneness: "pink center",
			});
			expect(guide.categories[0].items[1].doneness).toBeUndefined();
			expect(guide.categories[1].name).toBe("Poultry");
			expect(guide.categories[1].items[0].temp).toBe(165);
		});

		it("returns empty categories when document not found", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(errorResponse(404));

			const guide = await client.getTemperatureGuide();
			expect(guide).toEqual({ categories: [] });
		});

		it("handles non-map values in categories array", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: {
						categories: {
							arrayValue: {
								values: [
									{ stringValue: "not a map" },
									{ mapValue: { fields: { name: { stringValue: "Valid" } } } },
								],
							},
						},
					},
				}),
			);

			const guide = await client.getTemperatureGuide();
			expect(guide.categories).toHaveLength(2);
			expect(guide.categories[0]).toEqual({ name: "", items: [] });
			expect(guide.categories[1].name).toBe("Valid");
		});
	});

	// ─── getFirmwareInfo ───────────────────────────────────────────────────

	describe("getFirmwareInfo", () => {
		it("fetches and parses firmware document", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: {
						name: { stringValue: "Signals" },
						version: { stringValue: "2.3.1" },
						location: { stringValue: "https://fw.example.com/signals-2.3.1.bin" },
						md5: { stringValue: "abc123def456" },
					},
				}),
			);

			const fw = await client.getFirmwareInfo("signals");
			expect(fw).toEqual({
				name: "Signals",
				version: "2.3.1",
				location: "https://fw.example.com/signals-2.3.1.bin",
				md5: "abc123def456",
			});
		});

		it("returns null when firmware not found", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(errorResponse(404));

			const fw = await client.getFirmwareInfo("unknown-device");
			expect(fw).toBeNull();
		});
	});

	// ─── startSession / endSession ─────────────────────────────────────────

	describe("startSession", () => {
		it("sends PATCH with sessionActive=true and label", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const result = await client.startSession("SN-001", "Brisket Cook");
			expect(result.success).toBe(true);

			const patchCall = mockFetch.mock.calls[2];
			expect(patchCall[0]).toContain("documents/devices/SN-001");
			expect(patchCall[0]).toContain("updateMask.fieldPaths=sessionActive");
			expect(patchCall[0]).toContain("updateMask.fieldPaths=sessionLabel");
			expect(patchCall[0]).toContain("updateMask.fieldPaths=sessionStart");
			expect(patchCall[1].method).toBe("PATCH");

			const body = JSON.parse(patchCall[1].body);
			expect(body.fields.sessionActive.booleanValue).toBe(true);
			expect(body.fields.sessionLabel.stringValue).toBe("Brisket Cook");
		});

		it("uses empty string as default label", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			await client.startSession("SN-001");
			const body = JSON.parse(mockFetch.mock.calls[2][1].body);
			expect(body.fields.sessionLabel.stringValue).toBe("");
		});
	});

	describe("endSession", () => {
		it("sends PATCH with sessionActive=false", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const result = await client.endSession("SN-001");
			expect(result.success).toBe(true);

			const patchCall = mockFetch.mock.calls[2];
			const body = JSON.parse(patchCall[1].body);
			expect(body.fields.sessionActive.booleanValue).toBe(false);
			expect(patchCall[0]).toContain("updateMask.fieldPaths=sessionActive");
		});
	});

	// ─── renameDevice ──────────────────────────────────────────────────────

	describe("renameDevice", () => {
		it("sends PATCH with new label", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const result = await client.renameDevice("SN-001", "My Smoker");
			expect(result.success).toBe(true);

			const call = mockFetch.mock.calls[2];
			expect(call[0]).toContain("updateMask.fieldPaths=label");
			const body = JSON.parse(call[1].body);
			expect(body.fields.label.stringValue).toBe("My Smoker");
		});
	});

	// ─── shareDevice / shareArchive ────────────────────────────────────────

	describe("shareDevice", () => {
		it("sends PATCH to set shared=true and returns URL", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const result = await client.shareDevice("SN-001");
			expect(result.shareUrl).toContain("#/share/device/SN-001");
		});

		it("throws on failure", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(errorResponse(500));

			await expect(client.shareDevice("SN-001")).rejects.toThrow("Failed to share device");
		});
	});

	describe("shareArchive", () => {
		it("returns share URL without making API call", async () => {
			const client = await createAuthenticatedClient();
			const result = await client.shareArchive("SN-001", "arc-123");
			expect(result.shareUrl).toContain("#/share/archive/SN-001/arc-123");
		});
	});

	// ─── getEvents ─────────────────────────────────────────────────────────

	describe("getEvents", () => {
		it("builds query with accountId filter and parses results", async () => {
			const client = await createAuthenticatedClient();
			// getAccountId -> getUser
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			// runQuery
			mockFetch.mockResolvedValueOnce(
				jsonResponse([
					{
						document: {
							name: "projects/p/databases/(default)/documents/events/evt-1",
							fields: {
								eventType: { stringValue: "High Temperature Alert" },
								severity: { integerValue: "3" },
								eventTime: { timestampValue: "2026-06-01T10:00:00Z" },
								deviceId: { stringValue: "SN-001" },
								channelId: { stringValue: "1" },
								accountId: { stringValue: "acc-1" },
								valueBefore: { stringValue: "170" },
								valueAfter: { stringValue: "205" },
								groups: { arrayValue: { values: [{ stringValue: "grp-1" }] } },
							},
						},
					},
				]),
			);

			const events = await client.getEvents();
			expect(events).toHaveLength(1);
			expect(events[0].id).toBe("evt-1");
			expect(events[0].eventType).toBe("High Temperature Alert");
			expect(events[0].severity).toBe(3);
			expect(events[0].deviceId).toBe("SN-001");
			expect(events[0].channelId).toBe("1");
			expect(events[0].valueBefore).toBe("170");
			expect(events[0].valueAfter).toBe("205");
			expect(events[0].groups).toEqual(["grp-1"]);
		});

		it("builds composite filter with deviceId and eventType", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(jsonResponse([]));

			await client.getEvents({ deviceId: "SN-001", eventType: "alarm", limit: 10 });

			const queryCall = mockFetch.mock.calls[3];
			const body = JSON.parse(queryCall[1].body);
			expect(body.structuredQuery.where.compositeFilter).toBeDefined();
			expect(body.structuredQuery.where.compositeFilter.op).toBe("AND");
			const filters = body.structuredQuery.where.compositeFilter.filters;
			expect(filters).toHaveLength(3);
			expect(filters[0].fieldFilter.field.fieldPath).toBe("accountId");
			expect(filters[1].fieldFilter.field.fieldPath).toBe("deviceId");
			expect(filters[1].fieldFilter.value.stringValue).toBe("SN-001");
			expect(filters[2].fieldFilter.field.fieldPath).toBe("EventType");
			expect(filters[2].fieldFilter.value.stringValue).toBe("alarm");
			expect(body.structuredQuery.limit).toBe(10);
		});

		it("respects limit clamping (1-500)", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(jsonResponse([]));

			await client.getEvents({ limit: 9999 });
			const body = JSON.parse(mockFetch.mock.calls[3][1].body);
			expect(body.structuredQuery.limit).toBe(500);
		});

		it("returns empty array on non-array response", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(jsonResponse({ notAnArray: true }));

			const events = await client.getEvents();
			expect(events).toEqual([]);
		});
	});

	// ─── setAlarm ──────────────────────────────────────────────────────────

	describe("setAlarm", () => {
		it("sends PATCH with high alarm threshold", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			await client.setAlarm("SN-001", 1, { high: { value: 200, units: "F", enabled: true } });

			const call = mockFetch.mock.calls[2];
			expect(call[0]).toContain("documents/devices/SN-001/channels/1");
			expect(call[0]).toContain("updateMask.fieldPaths=alarmHigh");
			expect(call[1].method).toBe("PATCH");
			const body = JSON.parse(call[1].body);
			expect(body.fields.alarmHigh.mapValue.fields.value.doubleValue).toBe(200);
			expect(body.fields.alarmHigh.mapValue.fields.units.stringValue).toBe("F");
			expect(body.fields.alarmHigh.mapValue.fields.enabled.booleanValue).toBe(true);
		});

		it("sends PATCH with both high and low alarm thresholds", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			await client.setAlarm("SN-001", 2, {
				high: { value: 200, units: "F" },
				low: { value: 32, units: "F", muted: true },
			});

			const call = mockFetch.mock.calls[2];
			expect(call[0]).toContain("updateMask.fieldPaths=alarmHigh");
			expect(call[0]).toContain("updateMask.fieldPaths=alarmLow");
			const body = JSON.parse(call[1].body);
			expect(body.fields.alarmHigh.mapValue.fields.value.doubleValue).toBe(200);
			expect(body.fields.alarmLow.mapValue.fields.value.doubleValue).toBe(32);
			expect(body.fields.alarmLow.mapValue.fields.muted.booleanValue).toBe(true);
		});

		it("throws when neither high nor low provided", async () => {
			const client = await createAuthenticatedClient();

			await expect(client.setAlarm("SN-001", 1, {})).rejects.toThrow(
				"At least one of 'high' or 'low' must be provided",
			);
		});

		it("throws on HTTP error response", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(errorResponse(400));

			await expect(client.setAlarm("SN-001", 1, { high: { value: 200 } })).rejects.toThrow(
				"Failed to set alarm",
			);
		});
	});

	// ─── updateDeviceState ─────────────────────────────────────────────────

	describe("updateDeviceState", () => {
		it("builds Firestore fields for string, number, and boolean values", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const result = await client.updateDeviceState("SN-001", {
				label: "New Name",
				battery: 95,
				public: true,
			});
			expect(result.success).toBe(true);

			const call = mockFetch.mock.calls[2];
			expect(call[0]).toContain("updateMask.fieldPaths=label");
			expect(call[0]).toContain("updateMask.fieldPaths=battery");
			expect(call[0]).toContain("updateMask.fieldPaths=public");
			const body = JSON.parse(call[1].body);
			expect(body.fields.label.stringValue).toBe("New Name");
			expect(body.fields.battery.doubleValue).toBe(95);
			expect(body.fields.public.booleanValue).toBe(true);
		});
	});

	// ─── factoryReset ──────────────────────────────────────────────────────

	describe("factoryReset", () => {
		it("sends PATCH with factoryReset=true", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const result = await client.factoryReset("SN-001");
			expect(result.success).toBe(true);

			const call = mockFetch.mock.calls[2];
			expect(call[0]).toContain("updateMask.fieldPaths=factoryReset");
			const body = JSON.parse(call[1].body);
			expect(body.fields.factoryReset.booleanValue).toBe(true);
		});
	});

	// ─── setFanTarget / setFanEnabled ──────────────────────────────────────

	describe("setFanTarget", () => {
		it("sends PATCH with fan.setTemp nested map", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const result = await client.setFanTarget("SN-001", 225.5);
			expect(result.success).toBe(true);

			const call = mockFetch.mock.calls[2];
			expect(call[0]).toContain("updateMask.fieldPaths=fan.setTemp");
			const body = JSON.parse(call[1].body);
			expect(body.fields.fan.mapValue.fields.setTemp.doubleValue).toBe(225.5);
		});
	});

	describe("setFanEnabled", () => {
		it("sends PATCH with fan.connection nested map", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const result = await client.setFanEnabled("SN-001", false);
			expect(result.success).toBe(true);

			const call = mockFetch.mock.calls[2];
			expect(call[0]).toContain("updateMask.fieldPaths=fan.connection");
			const body = JSON.parse(call[1].body);
			expect(body.fields.fan.mapValue.fields.connection.booleanValue).toBe(false);
		});
	});

	// ─── getCalibration ────────────────────────────────────────────────────

	describe("getCalibration", () => {
		it("fetches calibration records and parses points", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					documents: [
						{
							name: "projects/p/databases/(default)/documents/devices/SN-1/calibration/cal-1",
							fields: {
								calibratedAt: { timestampValue: "2026-03-15T09:00:00Z" },
								source: { stringValue: "ice-bath" },
								result: { stringValue: "pass" },
								ambientTemp: { doubleValue: 72.0 },
								ambientUnits: { stringValue: "F" },
								points: {
									arrayValue: {
										values: [
											{
												mapValue: {
													fields: {
														referenceTemp: { doubleValue: 32.0 },
														measuredTemp: { doubleValue: 32.1 },
														units: { stringValue: "F" },
													},
												},
											},
											{
												mapValue: {
													fields: {
														referenceTemp: { doubleValue: 212.0 },
														measuredTemp: { doubleValue: 211.8 },
														units: { stringValue: "F" },
													},
												},
											},
										],
									},
								},
							},
						},
					],
				}),
			);

			const records = await client.getCalibration("SN-1");
			expect(records).toHaveLength(1);
			expect(records[0].id).toBe("cal-1");
			expect(records[0].source).toBe("ice-bath");
			expect(records[0].result).toBe("pass");
			expect(records[0].ambientTemp).toBe(72.0);
			expect(records[0].date).toEqual(new Date("2026-03-15T09:00:00Z"));
			expect(records[0].points).toHaveLength(2);
			expect(records[0].points[0]).toEqual({ referenceTemp: 32.0, measuredTemp: 32.1, units: "F" });
			expect(records[0].points[1]).toEqual({
				referenceTemp: 212.0,
				measuredTemp: 211.8,
				units: "F",
			});
		});

		it("returns empty array on HTTP error", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(errorResponse(403));

			const records = await client.getCalibration("SN-1");
			expect(records).toEqual([]);
		});
	});

	// ─── getHistory ────────────────────────────────────────────────────────

	describe("getHistory", () => {
		it("fetches and parses historical readings with channel data", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					documents: [
						{
							fields: {
								timestamp: { timestampValue: "2026-06-01T12:00:00Z" },
								channels: {
									mapValue: {
										fields: {
											ch1: { doubleValue: 165.5 },
											ch2: { integerValue: "225" },
										},
									},
								},
							},
						},
						{
							fields: {
								timestamp: { timestampValue: "2026-06-01T12:05:00Z" },
								channels: {
									mapValue: {
										fields: {
											ch1: { doubleValue: 167.0 },
										},
									},
								},
							},
						},
					],
				}),
			);

			const history = await client.getHistory("SN-001");
			expect(history.readings).toHaveLength(2);
			expect(history.readings[0].timestamp).toEqual(new Date("2026-06-01T12:00:00Z"));
			expect(history.readings[0].channels).toEqual({ ch1: 165.5, ch2: 225 });
			expect(history.readings[1].channels).toEqual({ ch1: 167.0 });
		});

		it("returns empty readings on HTTP error", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(errorResponse(500));

			const history = await client.getHistory("SN-001");
			expect(history).toEqual({ readings: [] });
		});

		it("returns empty readings when no documents", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const history = await client.getHistory("SN-001");
			expect(history).toEqual({ readings: [] });
		});
	});

	// ─── resetMinMax ───────────────────────────────────────────────────────

	describe("resetMinMax", () => {
		it("sends PATCH with null values for min/max fields", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const result = await client.resetMinMax("SN-001", 2);
			expect(result.success).toBe(true);

			const call = mockFetch.mock.calls[2];
			expect(call[0]).toContain("updateMask.fieldPaths=ch2Min");
			expect(call[0]).toContain("updateMask.fieldPaths=ch2Max");
		});
	});

	// ─── getInvites ────────────────────────────────────────────────────────

	describe("getInvites", () => {
		it("queries usersInvites collection and parses results", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(
				jsonResponse([
					{
						document: {
							name: "projects/p/databases/(default)/documents/usersInvites/inv-1",
							fields: {
								accountId: { stringValue: "acc-1" },
								email: { stringValue: "invitee@test.com" },
								status: { stringValue: "pending" },
								createdAt: { stringValue: "2026-05-01" },
							},
						},
					},
				]),
			);

			const invites = await client.getInvites();
			expect(invites).toHaveLength(1);
			expect(invites[0].id).toBe("inv-1");
			expect(invites[0].email).toBe("invitee@test.com");
			expect(invites[0].status).toBe("pending");
		});

		it("returns empty array on non-array response", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const invites = await client.getInvites();
			expect(invites).toEqual([]);
		});
	});

	// ─── removeUser ────────────────────────────────────────────────────────

	describe("removeUser", () => {
		it("sends DELETE to user path under account", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const result = await client.removeUser("user-456");
			expect(result.success).toBe(true);

			const call = mockFetch.mock.calls[3];
			expect(call[0]).toContain("documents/accounts/acc-1/users/user-456");
			expect(call[1].method).toBe("DELETE");
		});
	});

	// ─── getDeviceGroups / createDeviceGroup / deleteDeviceGroup ────────────

	describe("getDeviceGroups", () => {
		it("fetches and parses groups", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					documents: [
						{
							name: "projects/p/databases/(default)/documents/accounts/acc-1/groups/grp-1",
							fields: {
								name: { stringValue: "BBQ Setup" },
								devices: {
									arrayValue: { values: [{ stringValue: "SN-001" }, { stringValue: "SN-002" }] },
								},
							},
						},
					],
				}),
			);

			const groups = await client.getDeviceGroups();
			expect(groups).toHaveLength(1);
			expect(groups[0].id).toBe("grp-1");
			expect(groups[0].name).toBe("BBQ Setup");
			expect(groups[0].devices).toEqual(["SN-001", "SN-002"]);
		});

		it("returns empty array on HTTP error", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(errorResponse(500));

			const groups = await client.getDeviceGroups();
			expect(groups).toEqual([]);
		});
	});

	describe("createDeviceGroup", () => {
		it("sends POST with group data and returns parsed result", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					name: "projects/p/databases/(default)/documents/accounts/acc-1/groups/grp-new",
					fields: {
						name: { stringValue: "New Group" },
						devices: { arrayValue: { values: [{ stringValue: "SN-001" }] } },
					},
				}),
			);

			const group = await client.createDeviceGroup("New Group", ["SN-001"]);
			expect(group.id).toBe("grp-new");
			expect(group.name).toBe("New Group");
			expect(group.devices).toEqual(["SN-001"]);
		});

		it("throws on HTTP error", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(errorResponse(400));

			await expect(client.createDeviceGroup("Bad", [])).rejects.toThrow(
				"Failed to create device group",
			);
		});
	});

	describe("deleteDeviceGroup", () => {
		it("sends DELETE request for group", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			await client.deleteDeviceGroup("grp-1");
			const call = mockFetch.mock.calls[3];
			expect(call[0]).toContain("documents/accounts/acc-1/groups/grp-1");
			expect(call[1].method).toBe("DELETE");
		});

		it("throws on HTTP error", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: { accountId: { stringValue: "acc-1" } },
				}),
			);
			mockFetch.mockResolvedValueOnce(errorResponse(404));

			await expect(client.deleteDeviceGroup("grp-x")).rejects.toThrow(
				"Failed to delete device group",
			);
		});
	});

	// ─── getNotificationSettings / updateNotificationSettings ──────────────

	describe("getNotificationSettings", () => {
		it("returns user notification settings", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: {
						notificationSettings: {
							mapValue: {
								fields: {
									enabled: { booleanValue: true },
									continuousAlerts: { booleanValue: true },
									emailNotification: { booleanValue: false },
									smsNotification: { booleanValue: true },
									deviceNotification: { booleanValue: false },
								},
							},
						},
					},
				}),
			);

			const settings = await client.getNotificationSettings();
			expect(settings).toEqual({
				enabled: true,
				continuousAlerts: true,
				emailNotification: false,
				smsNotification: true,
				deviceNotification: false,
			});
		});

		it("returns defaults when user has no notification settings", async () => {
			const client = await createAuthenticatedClient();
			mockFetch.mockResolvedValueOnce(jsonResponse({ fields: {} }));

			const settings = await client.getNotificationSettings();
			expect(settings).toEqual({
				enabled: false,
				continuousAlerts: false,
				emailNotification: false,
				smsNotification: false,
				deviceNotification: false,
			});
		});
	});

	describe("updateNotificationSettings", () => {
		it("merges partial settings and sends PATCH", async () => {
			const client = await createAuthenticatedClient();
			// First call: getNotificationSettings -> getUser
			mockFetch.mockResolvedValueOnce(
				jsonResponse({
					fields: {
						notificationSettings: {
							mapValue: {
								fields: {
									enabled: { booleanValue: true },
									continuousAlerts: { booleanValue: false },
									emailNotification: { booleanValue: false },
									smsNotification: { booleanValue: false },
									deviceNotification: { booleanValue: false },
								},
							},
						},
					},
				}),
			);
			// PATCH response
			mockFetch.mockResolvedValueOnce(jsonResponse({}));

			const result = await client.updateNotificationSettings({ emailNotification: true });
			expect(result.success).toBe(true);

			const patchCall = mockFetch.mock.calls[3];
			expect(patchCall[0]).toContain("updateMask.fieldPaths=notificationSettings");
			const body = JSON.parse(patchCall[1].body);
			const nsFields = body.fields.notificationSettings.mapValue.fields;
			expect(nsFields.enabled.booleanValue).toBe(true);
			expect(nsFields.emailNotification.booleanValue).toBe(true);
			expect(nsFields.smsNotification.booleanValue).toBe(false);
		});

		it("throws when not authenticated", async () => {
			const client = new ThermoworksWebClient();
			await expect(client.updateNotificationSettings({ enabled: true })).rejects.toThrow(AuthError);
		});
	});
});

describe("ThermoworksWebClient data usage", () => {
	beforeEach(() => {
		mockFetch.mockReset();
		sessionStorage.clear();
	});

	it("fetches total usage with plan limits and billing period", async () => {
		const client = await createAuthenticatedClient();

		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: { accountId: { stringValue: "acct-usage" } },
			}),
		);
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				result: { totalBytes: 3_221_225_472 },
			}),
		);
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					billingPlanId: { stringValue: "plan-pro" },
					periodStart: { timestampValue: "2026-06-01T00:00:00Z" },
					currentPeriodEnd: { timestampValue: "2026-06-30T00:00:00Z" },
					devicesUsed: { integerValue: "2" },
				},
			}),
		);
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					dataLoggerSettings: {
						mapValue: {
							fields: {
								storageLimitBytes: { integerValue: "4294967296" },
							},
						},
					},
				},
			}),
		);

		const usage = await client.getDataUsage();

		expect(usage).toEqual({
			totalBytes: 3_221_225_472,
			limitBytes: 4_294_967_296,
			periodStart: new Date("2026-06-01T00:00:00Z"),
			periodEnd: new Date("2026-06-30T00:00:00Z"),
			deviceCount: 2,
		});
		expect(mockFetch.mock.calls[3][0]).toContain("accountDataStorageSize");
	});

	it("fetches and enriches per-device usage from callable functions", async () => {
		const client = await createAuthenticatedClient();

		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: { accountId: { stringValue: "acct-usage" } },
			}),
		);
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				result: [
					{ deviceId: "SN-001", bytes: 1_048_576 },
					{ deviceId: "dev-2", bytes: 524_288 },
				],
			}),
		);
		mockFetch.mockResolvedValueOnce(
			jsonResponse([
				{
					document: {
						fields: {
							serial: { stringValue: "SN-001" },
							label: { stringValue: "Kitchen Signals" },
						},
					},
				},
				{
					document: {
						fields: {
							serial: { stringValue: "SN-002" },
							deviceId: { stringValue: "dev-2" },
							label: { stringValue: "Patio Node" },
							lastTelemetrySaved: { timestampValue: "2026-06-08T20:00:00Z" },
						},
					},
				},
			]),
		);

		const deviceUsage = await client.getDataUsageByDevice();

		expect(deviceUsage).toEqual([
			{
				serial: "SN-001",
				label: "Kitchen Signals",
				bytes: 1_048_576,
				percentage: 67,
				lastSync: null,
			},
			{
				serial: "SN-002",
				label: "Patio Node",
				bytes: 524_288,
				percentage: 33,
				lastSync: new Date("2026-06-08T20:00:00Z"),
			},
		]);
		expect(mockFetch.mock.calls[3][0]).toContain("accountDataStorageSizeByTable");
	});

	it("fetches billing plan metadata for the usage dashboard", async () => {
		const client = await createAuthenticatedClient();

		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: { accountId: { stringValue: "acct-usage" } },
			}),
		);
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					billingPlanId: { stringValue: "plan-pro" },
					renewalDate: { timestampValue: "2026-06-30T00:00:00Z" },
					devicesLimit: { integerValue: "10" },
				},
			}),
		);
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					label: { stringValue: "ThermoWorks Pro" },
					tier: { stringValue: "pro" },
					deviceCount: { integerValue: "10" },
					monthlyAmount: { integerValue: "999" },
					currency: { stringValue: "USD" },
					dataLoggerSettings: {
						mapValue: {
							fields: {
								storageLimitBytes: { integerValue: "4294967296" },
								retentionDays: { integerValue: "90" },
							},
						},
					},
				},
			}),
		);

		const plan = await client.getBillingPlan();

		expect(plan).toEqual({
			name: "ThermoWorks Pro",
			tier: "pro",
			storageLimitBytes: 4_294_967_296,
			deviceLimit: 10,
			retentionDays: 90,
			price: 999,
			currency: "USD",
			renewalDate: new Date("2026-06-30T00:00:00Z"),
		});
	});
});

// ─── Public share functions ──────────────────────────────────────────────────

describe("getPublicDevice", () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it("returns null for invalid serial (path traversal)", async () => {
		const result = await getPublicDevice("../../../etc/passwd");
		expect(result).toBeNull();
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("returns null for empty serial", async () => {
		const result = await getPublicDevice("");
		expect(result).toBeNull();
	});

	it("fetches public device and returns it if public=true", async () => {
		// getProjectId
		mockFetch.mockResolvedValueOnce(jsonResponse(PROJECT_ID_RESPONSE));
		// publicFirestoreGet
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					serial: { stringValue: "SN-PUB" },
					label: { stringValue: "Public Smoker" },
					public: { booleanValue: true },
					status: { stringValue: "online" },
				},
			}),
		);

		const device = await getPublicDevice("SN-PUB");
		expect(device).not.toBeNull();
		expect(device!.serial).toBe("SN-PUB");
		expect(device!.label).toBe("Public Smoker");
	});

	it("returns null if device exists but public=false", async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse(PROJECT_ID_RESPONSE));
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					serial: { stringValue: "SN-PRIV" },
					public: { booleanValue: false },
				},
			}),
		);

		const device = await getPublicDevice("SN-PRIV");
		expect(device).toBeNull();
	});

	it("returns null on 404", async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse(PROJECT_ID_RESPONSE));
		mockFetch.mockResolvedValueOnce(errorResponse(404));

		const device = await getPublicDevice("SN-MISSING");
		expect(device).toBeNull();
	});

	it("returns null on 403 (permission denied)", async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse(PROJECT_ID_RESPONSE));
		mockFetch.mockResolvedValueOnce(errorResponse(403));

		const device = await getPublicDevice("SN-DENIED");
		expect(device).toBeNull();
	});
});

describe("getPublicDeviceChannels", () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it("returns empty array for invalid serial", async () => {
		const channels = await getPublicDeviceChannels("../bad");
		expect(channels).toEqual([]);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("fetches 9 channels and returns non-null results", async () => {
		// getProjectId (cached after first call in previous tests, but module-level
		// cachedProjectId may persist - mock both calls)
		mockFetch.mockResolvedValueOnce(jsonResponse(PROJECT_ID_RESPONSE));
		// Channel 1: has data
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					number: { stringValue: "1" },
					value: { doubleValue: 155 },
					units: { stringValue: "F" },
				},
			}),
		);
		// Channels 2-9: 404
		for (let i = 0; i < 8; i++) {
			mockFetch.mockResolvedValueOnce(errorResponse(404));
		}

		const channels = await getPublicDeviceChannels("SN-PUB");
		expect(channels).toHaveLength(1);
		expect(channels[0].value).toBe(155);
	});
});

describe("getPublicArchive", () => {
	beforeEach(() => {
		mockFetch.mockReset();
	});

	it("returns null for invalid serial", async () => {
		const archive = await getPublicArchive("../bad", "arc-1");
		expect(archive).toBeNull();
	});

	it("returns null for empty archiveId", async () => {
		const archive = await getPublicArchive("SN-001", "");
		expect(archive).toBeNull();
	});

	it("fetches public archive when public=true", async () => {
		// Note: cachedProjectId is already populated by earlier getPublicDevice tests,
		// so getProjectId() won't make a fetch call - only the archive fetch happens.
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					start: { timestampValue: "2026-01-01T00:00:00Z" },
					end: { timestampValue: "2026-01-01T06:00:00Z" },
					label: { stringValue: "Public Cook" },
					public: { booleanValue: true },
				},
			}),
		);

		const archive = await getPublicArchive("SN-001", "arc-pub");
		expect(archive).not.toBeNull();
		expect(archive!.id).toBe("arc-pub");
		expect(archive!.label).toBe("Public Cook");
	});

	it("returns null when archive exists but public=false", async () => {
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					label: { stringValue: "Private Cook" },
					public: { booleanValue: false },
				},
			}),
		);

		const archive = await getPublicArchive("SN-001", "arc-priv");
		expect(archive).toBeNull();
	});
});

// ─── SERIAL_PATTERN validation ──────────────────────────────────────────────

describe("SERIAL_PATTERN validation", () => {
	const SERIAL_PATTERN = /^[A-Za-z0-9:_-]+$/;

	it("accepts valid serial formats", () => {
		expect(SERIAL_PATTERN.test("AB12CD34")).toBe(true);
		expect(SERIAL_PATTERN.test("device-001")).toBe(true);
		expect(SERIAL_PATTERN.test("DEV_123")).toBe(true);
		expect(SERIAL_PATTERN.test("AA:BB:CC:DD")).toBe(true);
	});

	it("rejects serials with path traversal characters", () => {
		expect(SERIAL_PATTERN.test("../etc/passwd")).toBe(false);
		expect(SERIAL_PATTERN.test("device/../../")).toBe(false);
	});

	it("rejects empty strings", () => {
		expect(SERIAL_PATTERN.test("")).toBe(false);
	});

	it("rejects serials with spaces or special chars", () => {
		expect(SERIAL_PATTERN.test("device 001")).toBe(false);
		expect(SERIAL_PATTERN.test("device;drop")).toBe(false);
		expect(SERIAL_PATTERN.test("device<script>")).toBe(false);
	});
});
