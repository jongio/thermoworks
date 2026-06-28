/**
 * Tests for Firestore field parsers exercised through ThermoworksWebClient methods.
 *
 * Since getString, getNumber, getBoolean, getTimestamp, getArray, getMapFields,
 * and getStringArray are module-private, we test them indirectly by providing
 * Firestore-shaped responses to client methods that rely on each parser.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThermoworksWebClient } from "../src/lib/api.ts";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

Object.defineProperty(globalThis, "window", {
	value: { location: { origin: "https://cloud.thermoworks.com", pathname: "/" } },
	writable: true,
});

function jsonResponse(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
	} as Response;
}

function _errorResponse(status: number): Response {
	return { ok: false, status, json: () => Promise.resolve({}) } as Response;
}

const LOGIN_RESPONSE = {
	idToken: "token",
	refreshToken: "refresh",
	localId: "uid-1",
	expiresIn: "3600",
};
const PROJECT_ID_RESPONSE = { projectId: "test-proj" };

async function makeClient(): Promise<ThermoworksWebClient> {
	const client = new ThermoworksWebClient();
	mockFetch
		.mockResolvedValueOnce(jsonResponse(LOGIN_RESPONSE))
		.mockResolvedValueOnce(jsonResponse(PROJECT_ID_RESPONSE));
	await client.login("test@test.com", "pass");
	return client;
}

beforeEach(() => {
	mockFetch.mockReset();
	sessionStorage.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ─── getString parser ────────────────────────────────────────────────────────

describe("getString parser (via getUser)", () => {
	it("extracts stringValue fields", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					email: { stringValue: "hello@example.com" },
					displayName: { stringValue: "John Doe" },
				},
			}),
		);

		const user = await client.getUser();
		expect(user.email).toBe("hello@example.com");
		expect(user.displayName).toBe("John Doe");
	});

	it("returns null for missing fields", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(jsonResponse({ fields: {} }));

		const user = await client.getUser();
		expect(user.email).toBeNull();
		expect(user.displayName).toBeNull();
		expect(user.timeZone).toBeNull();
	});

	it("returns null for nullValue fields", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					email: { nullValue: null },
					displayName: { nullValue: null },
				},
			}),
		);

		const user = await client.getUser();
		expect(user.email).toBeNull();
		expect(user.displayName).toBeNull();
	});

	it("returns null when field has wrong type (integerValue for string)", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					email: { integerValue: "42" },
				},
			}),
		);

		const user = await client.getUser();
		expect(user.email).toBeNull();
	});
});

// ─── getNumber parser ────────────────────────────────────────────────────────

describe("getNumber parser (via getAccount)", () => {
	it("extracts integerValue as number", async () => {
		const client = await makeClient();
		// getAccountId -> getUser
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: { accountId: { stringValue: "acc-1" } },
			}),
		);
		// getAccount doc
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					devicesUsed: { integerValue: "5" },
					devicesLimit: { integerValue: "20" },
				},
			}),
		);

		const account = await client.getAccount();
		expect(account.devicesUsed).toBe(5);
		expect(account.devicesLimit).toBe(20);
	});

	it("extracts doubleValue as number", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: { accountId: { stringValue: "acc-1" } },
			}),
		);
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					devicesUsed: { doubleValue: 3.5 },
					devicesLimit: { doubleValue: 10.0 },
				},
			}),
		);

		const account = await client.getAccount();
		expect(account.devicesUsed).toBe(3.5);
		expect(account.devicesLimit).toBe(10.0);
	});

	it("returns null (defaulting to 0) for missing number fields", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: { accountId: { stringValue: "acc-1" } },
			}),
		);
		mockFetch.mockResolvedValueOnce(jsonResponse({ fields: {} }));

		const account = await client.getAccount();
		expect(account.devicesUsed).toBe(0);
		expect(account.devicesLimit).toBe(0);
	});
});

// ─── getBoolean parser ───────────────────────────────────────────────────────

describe("getBoolean parser (via getUser)", () => {
	it("extracts booleanValue", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					use24Time: { booleanValue: true },
				},
			}),
		);

		const user = await client.getUser();
		expect(user.use24Time).toBe(true);
	});

	it("returns null for missing boolean field", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(jsonResponse({ fields: {} }));

		const user = await client.getUser();
		expect(user.use24Time).toBeNull();
	});

	it("returns null when field has wrong type (stringValue for boolean)", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					use24Time: { stringValue: "true" },
				},
			}),
		);

		const user = await client.getUser();
		expect(user.use24Time).toBeNull();
	});
});

// ─── getTimestamp parser ─────────────────────────────────────────────────────

describe("getTimestamp parser (via getUser)", () => {
	it("parses valid ISO timestamp to Date", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					lastLogin: { timestampValue: "2026-06-08T14:30:00.000Z" },
				},
			}),
		);

		const user = await client.getUser();
		expect(user.lastLogin).toEqual(new Date("2026-06-08T14:30:00.000Z"));
	});

	it("returns null for invalid timestamp string", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					lastLogin: { timestampValue: "not-a-date" },
				},
			}),
		);

		const user = await client.getUser();
		expect(user.lastLogin).toBeNull();
	});

	it("returns null for missing timestamp field", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(jsonResponse({ fields: {} }));

		const user = await client.getUser();
		expect(user.lastLogin).toBeNull();
	});
});

// ─── getMapFields parser ─────────────────────────────────────────────────────

describe("getMapFields parser (via getUser accountRoles)", () => {
	it("extracts nested map fields", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					accountRoles: {
						mapValue: {
							fields: {
								admin: { booleanValue: true },
								viewer: { booleanValue: false },
							},
						},
					},
				},
			}),
		);

		const user = await client.getUser();
		expect(user.accountRoles).toEqual({ admin: true, viewer: false });
	});

	it("returns null when map has no fields key", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					accountRoles: { mapValue: {} },
				},
			}),
		);

		const user = await client.getUser();
		expect(user.accountRoles).toBeNull();
	});

	it("returns null when field is not a mapValue", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					accountRoles: { stringValue: "not a map" },
				},
			}),
		);

		const user = await client.getUser();
		expect(user.accountRoles).toBeNull();
	});
});

// ─── getArray parser ─────────────────────────────────────────────────────────

describe("getArray parser (via getTemperatureGuide categories)", () => {
	it("extracts array values", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					categories: {
						arrayValue: {
							values: [{ mapValue: { fields: { name: { stringValue: "Beef" } } } }],
						},
					},
				},
			}),
		);

		const guide = await client.getTemperatureGuide();
		expect(guide.categories).toHaveLength(1);
		expect(guide.categories[0].name).toBe("Beef");
	});

	it("returns empty categories when arrayValue has no values key", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					categories: { arrayValue: {} },
				},
			}),
		);

		const guide = await client.getTemperatureGuide();
		expect(guide.categories).toEqual([]);
	});

	it("returns empty categories when field is not an arrayValue", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					categories: { stringValue: "not an array" },
				},
			}),
		);

		const guide = await client.getTemperatureGuide();
		expect(guide.categories).toEqual([]);
	});
});

// ─── getStringArray parser ───────────────────────────────────────────────────

describe("getStringArray parser (via getDevices ringColors)", () => {
	it("extracts string array values", async () => {
		const client = await makeClient();
		// getAccountId -> getUser
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: { accountId: { stringValue: "acc-1" } },
			}),
		);
		// getDevices query
		mockFetch.mockResolvedValueOnce(
			jsonResponse([
				{
					document: {
						fields: {
							serial: { stringValue: "SN-RING" },
							ringColors: {
								arrayValue: {
									values: [
										{ stringValue: "#FF0000" },
										{ stringValue: "#00FF00" },
										{ stringValue: "#0000FF" },
									],
								},
							},
						},
					},
				},
			]),
		);

		const devices = await client.getDevices();
		expect(devices[0].ringColors).toEqual(["#FF0000", "#00FF00", "#0000FF"]);
	});

	it("returns null when array has no string values", async () => {
		const client = await makeClient();
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
							serial: { stringValue: "SN-001" },
							ringColors: {
								arrayValue: {
									values: [{ integerValue: "1" }, { integerValue: "2" }],
								},
							},
						},
					},
				},
			]),
		);

		const devices = await client.getDevices();
		expect(devices[0].ringColors).toBeNull();
	});

	it("returns null when arrayValue has no values", async () => {
		const client = await makeClient();
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
							serial: { stringValue: "SN-001" },
							ringColors: { arrayValue: {} },
						},
					},
				},
			]),
		);

		const devices = await client.getDevices();
		expect(devices[0].ringColors).toBeNull();
	});
});

// ─── parseBooleanMap parser ──────────────────────────────────────────────────

describe("parseBooleanMap parser (via getUser roles)", () => {
	it("extracts only boolean entries from map", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					roles: {
						mapValue: {
							fields: {
								admin: { booleanValue: true },
								label: { stringValue: "not a bool" },
								editor: { booleanValue: false },
							},
						},
					},
				},
			}),
		);

		const user = await client.getUser();
		// Only boolean entries should be included
		expect(user.roles).toEqual({ admin: true, editor: false });
	});

	it("returns null when map has no boolean entries", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					roles: {
						mapValue: {
							fields: {
								name: { stringValue: "only strings" },
							},
						},
					},
				},
			}),
		);

		const user = await client.getUser();
		expect(user.roles).toBeNull();
	});
});

// ─── sanitizeLabel parser ────────────────────────────────────────────────────

describe("sanitizeLabel (via getDevices label)", () => {
	it("strips control characters from device labels", async () => {
		const client = await makeClient();
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
							serial: { stringValue: "SN-CTRL" },
							label: { stringValue: "My\x1b[31mRed\x1b[0m Smoker" },
						},
					},
				},
			]),
		);

		const devices = await client.getDevices();
		expect(devices[0].label).toBe("MyRed Smoker");
	});

	it("strips null bytes and other control chars from labels", async () => {
		const client = await makeClient();
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
							serial: { stringValue: "SN-NULL" },
							label: { stringValue: "Clean\x00\x01\x02Label" },
						},
					},
				},
			]),
		);

		const devices = await client.getDevices();
		expect(devices[0].label).toBe("CleanLabel");
	});

	it("returns null for null label", async () => {
		const client = await makeClient();
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
							serial: { stringValue: "SN-NOLABEL" },
						},
					},
				},
			]),
		);

		const devices = await client.getDevices();
		expect(devices[0].label).toBeNull();
	});
});

// ─── extractDocId parser ─────────────────────────────────────────────────────

describe("extractDocId (via getArchives document name parsing)", () => {
	it("extracts last segment from document name path", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				documents: [
					{
						name: "projects/thermoworks-cloud/databases/(default)/documents/devices/SN-1/archive/archive-id-123",
						fields: {
							label: { stringValue: "Test Archive" },
						},
					},
				],
			}),
		);

		const archives = await client.getArchives("SN-1");
		expect(archives[0].id).toBe("archive-id-123");
	});

	it("handles missing name field (returns empty string)", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				documents: [
					{
						fields: { label: { stringValue: "No Name" } },
					},
				],
			}),
		);

		const archives = await client.getArchives("SN-1");
		expect(archives[0].id).toBe("");
	});
});

// ─── parseArchiveChannel with recentReadings ─────────────────────────────────

describe("parseArchiveChannel recentReadings (via getArchives)", () => {
	it("parses recentReadings array from archive channels", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				documents: [
					{
						name: "projects/p/databases/(default)/documents/devices/SN-1/archive/arc-readings",
						fields: {
							channels: {
								arrayValue: {
									values: [
										{
											mapValue: {
												fields: {
													number: { stringValue: "1" },
													label: { stringValue: "Probe" },
													units: { stringValue: "F" },
													value: { doubleValue: 165 },
													recentReadings: {
														arrayValue: {
															values: [
																{
																	mapValue: {
																		fields: {
																			value: { doubleValue: 160.0 },
																			timestamp: { timestampValue: "2026-06-01T10:00:00Z" },
																			units: { stringValue: "F" },
																		},
																	},
																},
																{
																	mapValue: {
																		fields: {
																			value: { doubleValue: 165.5 },
																			timestamp: { timestampValue: "2026-06-01T10:05:00Z" },
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
					},
				],
			}),
		);

		const archives = await client.getArchives("SN-1");
		const channel = archives[0].channels![0];
		expect(channel.recentReadings).toHaveLength(2);
		expect(channel.recentReadings[0].value).toBe(160.0);
		expect(channel.recentReadings[0].timestamp).toEqual(new Date("2026-06-01T10:00:00Z"));
		expect(channel.recentReadings[0].units).toBe("F");
		expect(channel.recentReadings[1].value).toBe(165.5);
	});

	it("skips incomplete reading entries (missing required fields)", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				documents: [
					{
						name: "projects/p/databases/(default)/documents/devices/SN-1/archive/arc-bad",
						fields: {
							channels: {
								arrayValue: {
									values: [
										{
											mapValue: {
												fields: {
													number: { stringValue: "1" },
													recentReadings: {
														arrayValue: {
															values: [
																// Missing timestamp - should be skipped
																{
																	mapValue: {
																		fields: {
																			value: { doubleValue: 100 },
																			units: { stringValue: "F" },
																		},
																	},
																},
																// Missing value - should be skipped
																{
																	mapValue: {
																		fields: {
																			timestamp: { timestampValue: "2026-06-01T10:00:00Z" },
																			units: { stringValue: "F" },
																		},
																	},
																},
																// Valid
																{
																	mapValue: {
																		fields: {
																			value: { doubleValue: 155 },
																			timestamp: { timestampValue: "2026-06-01T10:10:00Z" },
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
					},
				],
			}),
		);

		const archives = await client.getArchives("SN-1");
		const channel = archives[0].channels![0];
		expect(channel.recentReadings).toHaveLength(1);
		expect(channel.recentReadings[0].value).toBe(155);
	});
});

// ─── parseNotificationSettings ───────────────────────────────────────────────

describe("parseNotificationSettings (via getUser)", () => {
	it("defaults missing booleans to false", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: {
					notificationSettings: {
						mapValue: {
							fields: {
								// Only "enabled" is present
								enabled: { booleanValue: true },
							},
						},
					},
				},
			}),
		);

		const user = await client.getUser();
		expect(user.notificationSettings).toEqual({
			enabled: true,
			continuousAlerts: false,
			emailNotification: false,
			smsNotification: false,
			deviceNotification: false,
		});
	});
});

// ─── Device field edge cases ─────────────────────────────────────────────────

describe("parseDevice edge cases", () => {
	it("handles alternate field names (battery_state vs batteryState, wifi_stength vs wifiStrength)", async () => {
		const client = await makeClient();
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
							serial: { stringValue: "SN-ALT" },
							battery_state: { stringValue: "charging" },
							wifi_stength: { integerValue: "-55" },
							last_seen: { timestampValue: "2026-06-08T10:00:00Z" },
						},
					},
				},
			]),
		);

		const devices = await client.getDevices();
		expect(devices[0].batteryState).toBe("charging");
		expect(devices[0].wifiStrength).toBe(-55);
		expect(devices[0].lastSeen).toEqual(new Date("2026-06-08T10:00:00Z"));
	});

	it("prefers first field name variant (battery_state over batteryState)", async () => {
		const client = await makeClient();
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
							serial: { stringValue: "SN-BOTH" },
							battery_state: { stringValue: "first" },
							batteryState: { stringValue: "second" },
						},
					},
				},
			]),
		);

		const devices = await client.getDevices();
		expect(devices[0].batteryState).toBe("first");
	});

	it("returns empty serial when serial field is missing", async () => {
		const client = await makeClient();
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				fields: { accountId: { stringValue: "acc-1" } },
			}),
		);
		mockFetch.mockResolvedValueOnce(jsonResponse([{ document: { fields: {} } }]));

		const devices = await client.getDevices();
		expect(devices[0].serial).toBe("");
	});
});
