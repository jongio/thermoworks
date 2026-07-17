/**
 * Browser-native client for ThermoWorks Cloud.
 *
 * Replicates the SDK's Firebase REST API calls using native fetch,
 * since the SDK depends on Node.js-specific modules (undici, node:timers/promises).
 * Types are imported from the SDK package for shared type safety.
 *
 * ARCHITECTURE NOTE: This file intentionally duplicates Firestore field parsing
 * from packages/sdk/src/firestore.ts and entity construction from client.ts.
 * A future improvement would extract an isomorphic parser package shared between
 * SDK and web. See docs/xray/xray-report-2026-06-07.md § XRAY-002.
 */
import type {
	AccountInvite,
	Alarm,
	AlarmSetOptions,
	AlarmThresholdOptions,
	Archive,
	ArchiveChannel,
	Device,
	DeviceChannel,
	DeviceEvent,
	EventFilter,
	FirmwareInfo,
	MinMaxReading,
	NotificationSettings,
	TemperatureReading,
	User,
} from "thermoworks-sdk";

export interface AccountInfo {
	id: string;
	name: string | null;
	plan: string | null;
	devicesUsed: number;
	devicesLimit: number;
}

export interface DataUsage {
	totalBytes: number;
	limitBytes: number;
	periodStart: Date | null;
	periodEnd: Date | null;
	deviceCount: number;
}

export interface DeviceDataUsage {
	serial: string;
	label: string;
	bytes: number;
	percentage: number;
	lastSync: Date | null;
}

export interface BillingPlan {
	name: string;
	tier: string;
	storageLimitBytes: number;
	deviceLimit: number;
	retentionDays: number;
	price: number;
	currency: string;
	renewalDate: Date | null;
}

interface CalibrationPoint {
	referenceTemp: number;
	measuredTemp: number;
	units: string;
}

interface CalibrationRecord {
	id: string;
	date: Date | null;
	source: string;
	result: string;
	ambientTemp: number | null;
	ambientUnits: string | null;
	points: CalibrationPoint[];
}

export type { CalibrationPoint, CalibrationRecord };

export interface HistoricalReading {
	value: number;
	timestamp: string;
	units: string;
}

export interface DeviceHistory {
	readings: HistoricalReading[];
}

const isDev = import.meta.env.DEV;

const IDENTITY_HOST = isDev ? "/api/identity" : "https://identitytoolkit.googleapis.com";
const TOKEN_HOST = isDev ? "/api/token" : "https://securetoken.googleapis.com";
const FIREBASE_HOST = isDev ? "/api/firebase" : "https://firebase.googleapis.com";
const FIRESTORE_HOST = isDev ? "/api/firestore" : "https://firestore.googleapis.com";
const FUNCTIONS_HOST = isDev
	? "/api/functions"
	: "https://us-central1-thermoworks-cloud-production.cloudfunctions.net";

// Firebase client-side API key (public identifier, not a secret).
// Security is enforced by Firebase Security Rules server-side.
const DEFAULT_API_KEY = "AIzaSyCf079iccUFc1k7VHdGXng22zXDy8Y3KEY";
const DEFAULT_APP_ID = "1:78998049458:web:b41e9d405d8c7de95eefab";
const REFERER = "https://cloud.thermoworks.com/";

const EXPIRY_BUFFER_MS = 60_000;

// ─── Firestore field parsers ─────────────────────────────────────────────────

type FirestoreValue =
	| { stringValue: string }
	| { integerValue: string }
	| { doubleValue: number }
	| { booleanValue: boolean }
	| { timestampValue: string }
	| { nullValue: null }
	| { mapValue: { fields?: Record<string, FirestoreValue> } }
	| { arrayValue: { values?: FirestoreValue[] } };

type FirestoreFields = Record<string, FirestoreValue>;

function getString(fields: FirestoreFields, key: string): string | null {
	const field = fields[key];
	if (!field) return null;
	if ("stringValue" in field) return field.stringValue;
	return null;
}

function getNumber(fields: FirestoreFields, key: string): number | null {
	const field = fields[key];
	if (!field) return null;
	if ("doubleValue" in field) return field.doubleValue;
	if ("integerValue" in field) return Number(field.integerValue);
	return null;
}

function getBoolean(fields: FirestoreFields, key: string): boolean | null {
	const field = fields[key];
	if (!field) return null;
	if ("booleanValue" in field) return field.booleanValue;
	return null;
}

function getTimestamp(fields: FirestoreFields, key: string): Date | null {
	const field = fields[key];
	if (!field) return null;
	if ("timestampValue" in field) {
		const date = new Date(field.timestampValue);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	return null;
}

function getMapFields(fields: FirestoreFields, key: string): FirestoreFields | null {
	const field = fields[key];
	if (!field) return null;
	if ("mapValue" in field) return field.mapValue.fields ?? null;
	return null;
}

function getArray(fields: FirestoreFields, key: string): FirestoreValue[] | null {
	const field = fields[key];
	if (!field) return null;
	if ("arrayValue" in field) return field.arrayValue.values ?? null;
	return null;
}

function getStringArray(fields: FirestoreFields, key: string): string[] | null {
	const field = fields[key];
	if (!field) return null;
	if ("arrayValue" in field) {
		const values = field.arrayValue.values;
		if (!values) return null;
		const result: string[] = [];
		for (const v of values) {
			if ("stringValue" in v) result.push(v.stringValue);
		}
		return result.length > 0 ? result : null;
	}
	return null;
}

function getNestedFields(
	fields: FirestoreFields | null,
	...path: string[]
): FirestoreFields | null {
	let current = fields;
	for (const segment of path) {
		if (!current) return null;
		current = getMapFields(current, segment);
	}
	return current;
}

function getFirstNumber(fields: FirestoreFields | null, ...keys: string[]): number | null {
	if (!fields) return null;
	for (const key of keys) {
		const value = getNumber(fields, key);
		if (value != null) return value;
	}
	return null;
}

function getFirstString(fields: FirestoreFields | null, ...keys: string[]): string | null {
	if (!fields) return null;
	for (const key of keys) {
		const value = getString(fields, key);
		if (value != null) return value;
	}
	return null;
}

function getFirstTimestamp(fields: FirestoreFields | null, ...keys: string[]): Date | null {
	if (!fields) return null;
	for (const key of keys) {
		const value = getTimestamp(fields, key);
		if (value != null) return value;
	}
	return null;
}

function parseDateValue(value: Date | string | number | null | undefined): Date | null {
	if (value == null) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function resolveStorageLimitBytes(
	planFields: FirestoreFields | null,
	accountFields: FirestoreFields | null,
): number {
	const planLoggerSettings = getNestedFields(planFields, "dataLoggerSettings");
	const accountLoggerSettings = getNestedFields(accountFields, "dataLoggerSettings");

	return (
		getFirstNumber(planLoggerSettings, "storageLimitBytes", "limitBytes", "dataLimitBytes") ??
		getFirstNumber(planFields, "storageLimitBytes", "limitBytes", "dataLimitBytes") ??
		getFirstNumber(accountLoggerSettings, "storageLimitBytes", "limitBytes", "dataLimitBytes") ??
		getFirstNumber(accountFields, "storageLimitBytes", "limitBytes", "dataLimitBytes") ??
		0
	);
}

function resolveRetentionDays(
	planFields: FirestoreFields | null,
	accountFields: FirestoreFields | null,
): number {
	const planLoggerSettings = getNestedFields(planFields, "dataLoggerSettings");
	const accountLoggerSettings = getNestedFields(accountFields, "dataLoggerSettings");

	return (
		getFirstNumber(planLoggerSettings, "retentionDays", "historyDays") ??
		getFirstNumber(planFields, "retentionDays", "historyDays") ??
		getFirstNumber(accountLoggerSettings, "retentionDays", "historyDays") ??
		getFirstNumber(accountFields, "retentionDays", "historyDays") ??
		0
	);
}

function parseBooleanMap(fields: FirestoreFields | null): Record<string, boolean> | null {
	if (!fields) return null;
	const result: Record<string, boolean> = {};
	for (const [key, value] of Object.entries(fields)) {
		if ("booleanValue" in value) {
			result[key] = value.booleanValue;
		}
	}
	return Object.keys(result).length > 0 ? result : null;
}

// ─── Temperature guide types ─────────────────────────────────────────────────

export interface TemperatureGuideItem {
	name: string;
	temp: number;
	units: string;
	doneness?: string;
}

export interface TemperatureCategory {
	name: string;
	items: TemperatureGuideItem[];
}

export interface TemperatureGuide {
	categories: TemperatureCategory[];
}

// ─── Token state ─────────────────────────────────────────────────────────────

interface TokenState {
	accessToken: string;
	refreshToken: string;
	userId: string;
	expiresAt: number;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/** Parse expiresIn from Firebase auth responses, guarding against NaN/Infinity/negative. */
function parseExpiresIn(raw: unknown): number {
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) return 3600; // Default to 1 hour for invalid values
	return n;
}

async function login(email: string, password: string): Promise<TokenState> {
	const url = `${IDENTITY_HOST}/v1/accounts:signInWithPassword?key=${DEFAULT_API_KEY}`;
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			referer: REFERER,
		},
		body: JSON.stringify({ email, password, returnSecureToken: true }),
	});

	if (!response.ok) {
		const errorData = (await response.json().catch(() => null)) as {
			error?: { message?: string };
		} | null;
		const reason = errorData?.error?.message ?? "UNKNOWN";
		throw new AuthError(`Authentication failed: ${reason}`, reason);
	}

	const data = (await response.json()) as {
		idToken: string;
		refreshToken: string;
		localId: string;
		expiresIn: string;
	};

	return {
		accessToken: data.idToken,
		refreshToken: data.refreshToken,
		userId: data.localId,
		expiresAt: Date.now() + parseExpiresIn(data.expiresIn) * 1000,
	};
}

async function refreshAccessToken(refreshToken: string): Promise<TokenState> {
	const url = `${TOKEN_HOST}/v1/token?key=${DEFAULT_API_KEY}`;
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			referer: REFERER,
		},
		body: JSON.stringify({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
		}),
	});

	if (!response.ok) {
		throw new AuthError("Token refresh failed", "TOKEN_REFRESH_FAILED");
	}

	const data = (await response.json()) as {
		id_token: string;
		refresh_token: string;
		user_id: string;
		expires_in: string;
	};

	return {
		accessToken: data.id_token,
		refreshToken: data.refresh_token,
		userId: data.user_id,
		expiresAt: Date.now() + parseExpiresIn(data.expires_in) * 1000,
	};
}

async function fetchProjectId(): Promise<string> {
	const url = `${FIREBASE_HOST}/v1alpha/projects/-/apps/${DEFAULT_APP_ID}/webConfig`;
	const response = await fetch(url, {
		headers: {
			accept: "application/json",
			"x-goog-api-key": DEFAULT_API_KEY,
			referer: REFERER,
		},
	});

	if (!response.ok) {
		throw new Error("Failed to fetch Firebase web config");
	}

	const data = (await response.json()) as { projectId: string };
	return data.projectId;
}

// ─── Firestore document parsers ──────────────────────────────────────────────

function parseNotificationSettings(fields: FirestoreFields | null): NotificationSettings | null {
	if (!fields) return null;
	return {
		enabled: getBoolean(fields, "enabled") ?? false,
		continuousAlerts: getBoolean(fields, "continuousAlerts") ?? false,
		emailNotification: getBoolean(fields, "emailNotification") ?? false,
		smsNotification: getBoolean(fields, "smsNotification") ?? false,
		deviceNotification: getBoolean(fields, "deviceNotification") ?? false,
	};
}

function parseAlarm(fields: FirestoreFields | null): Alarm | null {
	if (!fields) return null;
	return {
		enabled: getBoolean(fields, "enabled") ?? false,
		alarming: getBoolean(fields, "alarming") ?? false,
		muted: getBoolean(fields, "muted"),
		value: getNumber(fields, "value"),
		units: getString(fields, "units"),
		lastNotified: getTimestamp(fields, "lastNotified"),
	};
}

function parseMinMaxReading(fields: FirestoreFields | null): MinMaxReading | null {
	if (!fields) return null;
	const readingFields = getMapFields(fields, "reading");
	return {
		value: readingFields ? getNumber(readingFields, "value") : null,
		units: readingFields ? getString(readingFields, "units") : null,
		date: getTimestamp(fields, "dateReading"),
	};
}

function sanitizeLabel(value: string | null): string | null {
	if (value == null) return null;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars
	return value.replace(/[\x00-\x1f\x7f\x1b](\[[0-9;]*[A-Za-z])?/g, "");
}

function extractDocId(name?: string): string {
	if (!name) return "";
	const parts = name.split("/");
	return parts[parts.length - 1] ?? "";
}

function parseArchiveChannel(fields: FirestoreFields): ArchiveChannel {
	const readingsRaw = getArray(fields, "recentReadings");
	const recentReadings: TemperatureReading[] = [];

	if (readingsRaw) {
		for (const item of readingsRaw) {
			if ("mapValue" in item && item.mapValue.fields) {
				const rf = item.mapValue.fields;
				// ThermoWorks uses short field names: v (value), ts (timestamp), u (units)
				const rawValue =
					getNumber(rf, "value") ?? getNumber(rf, "v") ?? parseFloat(getString(rf, "v") ?? "");
				const timestamp = getTimestamp(rf, "timestamp") ?? getTimestamp(rf, "ts");
				const units = getString(rf, "units") ?? getString(rf, "u");
				if (rawValue != null && !Number.isNaN(rawValue) && timestamp != null && units != null) {
					recentReadings.push({ value: rawValue, timestamp, units });
				}
			}
		}
	}

	return {
		number: getString(fields, "number"),
		label: getString(fields, "label"),
		units: getString(fields, "units"),
		value: getNumber(fields, "value"),
		status: getString(fields, "status"),
		enabled: getBoolean(fields, "enabled"),
		color: getString(fields, "color"),
		type: getString(fields, "type"),
		alarmHigh: parseAlarm(getMapFields(fields, "alarmHigh")),
		alarmLow: parseAlarm(getMapFields(fields, "alarmLow")),
		minimum: parseMinMaxReading(getMapFields(fields, "minimum")),
		maximum: parseMinMaxReading(getMapFields(fields, "maximum")),
		recentReadings,
	};
}

function parseArchive(fields: FirestoreFields, id: string): Archive {
	const channelsRaw = getArray(fields, "channels");
	let channels: ArchiveChannel[] | null = null;

	if (channelsRaw) {
		channels = [];
		for (const item of channelsRaw) {
			if ("mapValue" in item && item.mapValue.fields) {
				channels.push(parseArchiveChannel(item.mapValue.fields));
			}
		}
		if (channels.length === 0) channels = null;
	}

	return {
		id,
		start: getTimestamp(fields, "start"),
		end: getTimestamp(fields, "end"),
		count: getNumber(fields, "count"),
		type: getString(fields, "type"),
		label: getString(fields, "label"),
		deviceLabel: getString(fields, "deviceLabel"),
		notes: getString(fields, "notes"),
		createdOn: getTimestamp(fields, "createdOn"),
		public: getBoolean(fields, "public"),
		publicLink: getString(fields, "publicLink"),
		filename: getString(fields, "filename"),
		channels,
	};
}

function parseDevice(fields: FirestoreFields): Device {
	const gatewayId = getString(fields, "gatewayId");
	const gatewayFields = gatewayId != null ? fields : null;
	const fanMap = getMapFields(fields, "fan");
	const bigQueryMap = getMapFields(fields, "bigQuery");

	return {
		serial: getString(fields, "serial") ?? "",
		deviceId: getString(fields, "deviceId"),
		label: sanitizeLabel(getString(fields, "label")),
		type: getString(fields, "type"),
		device: getString(fields, "device"),
		status: getString(fields, "status"),
		battery: getNumber(fields, "battery"),
		batteryState: getString(fields, "battery_state") ?? getString(fields, "batteryState"),
		wifiStrength: getNumber(fields, "wifi_stength") ?? getNumber(fields, "wifiStrength"),
		firmware: getString(fields, "firmware"),
		color: getString(fields, "color"),
		thumbnail: getString(fields, "thumbnail"),
		deviceDisplayUnits: getString(fields, "deviceDisplayUnits"),
		iotDeviceId: getString(fields, "iotDeviceId"),
		iotCoreDeviceBlocked: getBoolean(fields, "iotCoreDeviceBlocked"),
		recordingIntervalInSeconds: getNumber(fields, "recordingIntervalInSeconds"),
		transmitIntervalInSeconds: getNumber(fields, "transmitIntervalInSeconds"),
		readInterval: getNumber(fields, "readInterval"),
		heartbeatInterval: getNumber(fields, "heartbeatInterval"),
		temperatureDeltaTrigger: getNumber(fields, "temperatureDeltaTrigger"),
		pendingLoad: getBoolean(fields, "pendingLoad"),
		batteryAlertSent: getBoolean(fields, "batteryAlertSent"),
		lastSeen: getTimestamp(fields, "last_seen") ?? getTimestamp(fields, "lastSeen"),
		lastTelemetrySaved: getTimestamp(fields, "lastTelemetrySaved"),
		latestReading: getTimestamp(fields, "latestReading"),
		lastWifiConnection: getTimestamp(fields, "lastWifiConnection"),
		lastBluetoothConnection: getTimestamp(fields, "lastBluetoothConnection"),
		sessionStart: getTimestamp(fields, "sessionStart"),
		sessionLabel: getString(fields, "sessionLabel"),
		lastArchive: getTimestamp(fields, "lastArchive"),
		lastPurged: getTimestamp(fields, "lastPurged"),
		assignedToAccountOn: getTimestamp(fields, "assignedToAccountOn"),
		accountId: getString(fields, "accountId"),
		notes: getString(fields, "notes"),
		public: getBoolean(fields, "public"),
		publicLink: getString(fields, "publicLink"),
		searModeEnabled: getBoolean(fields, "searModeEnabled"),
		showSensorChannels: getBoolean(fields, "showSensorChannels"),
		ringColors: getStringArray(fields, "ringColors"),
		gateway: gatewayFields
			? {
					gatewayId,
					rssi: getNumber(gatewayFields, "gatewayRSSI"),
					lastSeen: getTimestamp(gatewayFields, "gatewayLastSeen"),
					switchedAt: getTimestamp(gatewayFields, "gatewaySwitchLastAt"),
					lastPacketId: getNumber(gatewayFields, "lastPacketId"),
				}
			: null,
		fan: fanMap
			? {
					connected: getBoolean(fanMap, "connected") ?? false,
					connection: getBoolean(fanMap, "connection") ?? false,
					setTemp: getNumber(fanMap, "setTemp"),
					fanChannel: getString(fanMap, "fan_channel"),
					state: getNumber(fanMap, "state"),
				}
			: null,
		bigQuery: bigQueryMap
			? {
					datasetId: getString(bigQueryMap, "datasetId") ?? "",
					tableId: getString(bigQueryMap, "tableId") ?? "",
				}
			: null,
	};
}

function parseDeviceChannel(fields: FirestoreFields): DeviceChannel {
	return {
		value: getNumber(fields, "value"),
		units: getString(fields, "units"),
		label: sanitizeLabel(getString(fields, "label")),
		status: getString(fields, "status"),
		type: getString(fields, "type"),
		number: getString(fields, "number"),
		enabled: getBoolean(fields, "enabled"),
		color: getString(fields, "color"),
		lastSeen: getTimestamp(fields, "last_seen") ?? getTimestamp(fields, "lastSeen"),
		lastTelemetrySaved: getTimestamp(fields, "lastTelemetrySaved"),
		lastEventId: getString(fields, "lastEventId"),
		showAvgTemp: getBoolean(fields, "showAvgTemp"),
		estimatedAlarmStatus: getString(fields, "estimatedAlarmStatus"),
		rateOfChange: getNumber(fields, "rateOfChange"),
		rateOfChangeUnit: getString(fields, "rateOfChangeUnit"),
		alarmHigh: parseAlarm(getMapFields(fields, "alarmHigh")),
		alarmLow: parseAlarm(getMapFields(fields, "alarmLow")),
		minimum: parseMinMaxReading(getMapFields(fields, "minimum")),
		maximum: parseMinMaxReading(getMapFields(fields, "maximum")),
	};
}

// ─── Error types ─────────────────────────────────────────────────────────────

export class AuthError extends Error {
	readonly reason: string;
	constructor(message: string, reason: string) {
		super(message);
		this.name = "AuthError";
		this.reason = reason;
	}
}

// ─── Alarm state ─────────────────────────────────────────────────────────────

export type AlarmState = "none" | "low" | "high";

export function getChannelAlarmState(channel: DeviceChannel): AlarmState {
	if (channel.alarmHigh?.alarming) return "high";
	if (channel.alarmLow?.alarming) return "low";
	return "none";
}

// ─── Client ──────────────────────────────────────────────────────────────────

export interface DeviceWithChannels {
	device: Device;
	channels: DeviceChannel[];
}

export interface DeviceGroup {
	id: string;
	name: string;
	devices: string[];
}

const TOKEN_STORAGE_KEY = "thermoworks-session";

export class ThermoworksWebClient {
	private token: TokenState | null = null;
	private projectId: string | null = null;
	private accountId: string | null = null;
	private refreshPromise: Promise<TokenState> | null = null;

	constructor() {
		// Restore session from sessionStorage on creation
		try {
			const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as { token: TokenState; projectId: string };
				if (parsed.token && parsed.token.expiresAt > Date.now()) {
					this.token = parsed.token;
					this.projectId = parsed.projectId;
				} else if (parsed.token?.refreshToken) {
					// Token expired but we have a refresh token — store it and refresh on next request
					this.token = parsed.token;
					this.projectId = parsed.projectId;
				} else {
					sessionStorage.removeItem(TOKEN_STORAGE_KEY);
				}
			}
		} catch {
			// Storage unavailable or corrupted — start fresh
		}
	}

	private persistSession(): void {
		try {
			if (this.token && this.projectId) {
				sessionStorage.setItem(
					TOKEN_STORAGE_KEY,
					JSON.stringify({
						token: this.token,
						projectId: this.projectId,
					}),
				);
			}
		} catch {
			// Storage unavailable — session won't persist across refresh
		}
	}

	async login(email: string, password: string): Promise<void> {
		const [token, projectId] = await Promise.all([
			login(email, password),
			this.projectId ? Promise.resolve(this.projectId) : fetchProjectId(),
		]);
		this.token = token;
		this.projectId = projectId;
		this.persistSession();
	}

	get isAuthenticated(): boolean {
		return this.token !== null;
	}

	logout(): void {
		this.token = null;
		this.accountId = null;
		this.refreshPromise = null;
		try {
			sessionStorage.removeItem(TOKEN_STORAGE_KEY);
		} catch {}
	}

	private async ensureToken(): Promise<string> {
		if (!this.token) throw new AuthError("Not authenticated", "NOT_AUTHENTICATED");
		if (Date.now() >= this.token.expiresAt - EXPIRY_BUFFER_MS) {
			if (!this.refreshPromise) {
				this.refreshPromise = refreshAccessToken(this.token.refreshToken).finally(() => {
					this.refreshPromise = null;
				});
			}
			const refreshed = await this.refreshPromise;
			// If logout() was called while refresh was in flight, discard the refreshed token
			if (!this.token) throw new AuthError("Not authenticated", "NOT_AUTHENTICATED");
			this.token = refreshed;
			this.persistSession();
		}
		return this.token.accessToken;
	}

	private async getAccountId(): Promise<string> {
		if (!this.accountId) {
			const user = await this.getUser();
			if (!user.accountId) throw new Error("User has no associated account");
			this.accountId = user.accountId;
		}
		if (!this.accountId) throw new Error("User has no associated account");
		return this.accountId;
	}

	private get baseUrl(): string {
		return `${FIRESTORE_HOST}/v1/projects/${this.projectId}/databases/(default)`;
	}

	private async firestoreRequest(method: string, path: string, body?: unknown): Promise<Response> {
		const accessToken = await this.ensureToken();
		const separator = path.includes("?") ? "&" : "?";
		const url = `${this.baseUrl}/${path}${separator}key=${DEFAULT_API_KEY}`;
		const headers: Record<string, string> = {
			authorization: `Bearer ${accessToken}`,
		};
		if (body !== undefined) {
			headers["content-type"] = "application/json";
		}
		return fetch(url, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});
	}

	private async callFunction(name: string, data: unknown): Promise<unknown> {
		if (!name || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
			throw new Error(`Invalid function name: ${name}`);
		}

		const accessToken = await this.ensureToken();
		const response = await fetch(`${FUNCTIONS_HOST}/${name}`, {
			method: "POST",
			headers: {
				authorization: `Bearer ${accessToken}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ data }),
		});

		if (!response.ok) {
			throw new Error(`Cloud function call failed: HTTP ${response.status}`);
		}

		const result = (await response.json()) as { result?: unknown };
		return result.result ?? result;
	}

	private async fetchDocFields(path: string): Promise<FirestoreFields | null> {
		const response = await this.firestoreRequest("GET", path);
		if (response.status === 404 || response.status === 403) return null;
		if (!response.ok) {
			throw new Error(`Firestore request failed: HTTP ${response.status}`);
		}
		const doc = (await response.json()) as { fields?: FirestoreFields };
		return doc.fields ?? null;
	}

	async getUser(): Promise<User> {
		if (!this.token) throw new AuthError("Not authenticated", "NOT_AUTHENTICATED");
		const fields = await this.fetchDocFields(`documents/users/${this.token.userId}`);
		if (!fields) throw new Error("User not found");
		return {
			userId: this.token.userId,
			accountId: getString(fields, "accountId"),
			email: getString(fields, "email"),
			displayName: getString(fields, "displayName"),
			timeZone: getString(fields, "timeZone"),
			preferredUnits: getString(fields, "preferredUnits"),
			locale: getString(fields, "locale"),
			photoUrl: getString(fields, "photoURL"),
			use24Time: getBoolean(fields, "use24Time"),
			lastLogin: getTimestamp(fields, "lastLogin"),
			appVersion: getString(fields, "appVersion"),
			accountRoles: parseBooleanMap(getMapFields(fields, "accountRoles")),
			roles: parseBooleanMap(getMapFields(fields, "roles")),
			notificationSettings: parseNotificationSettings(getMapFields(fields, "notificationSettings")),
		};
	}

	async getAccount(): Promise<AccountInfo> {
		const accountId = await this.getAccountId();
		const fields = await this.fetchDocFields(`documents/accounts/${accountId}`);
		if (!fields) {
			return { id: accountId, name: null, plan: null, devicesUsed: 0, devicesLimit: 0 };
		}

		// Try to fetch billing plan name via billingPlanId reference
		let planName: string | null = null;
		let deviceLimit = getNumber(fields, "devicesLimit") ?? 0;
		const planId = getString(fields, "billingPlanId");
		if (planId) {
			try {
				const planFields = await this.fetchDocFields(
					`documents/system/billingPlans/plans/${encodeURIComponent(planId)}`,
				);
				if (planFields) {
					planName = getString(planFields, "name");
					const planDeviceCount = getNumber(planFields, "deviceCount");
					if (planDeviceCount != null) deviceLimit = planDeviceCount;
				}
			} catch {
				// Plan lookup failed — continue with null plan name
			}
		}

		return {
			id: accountId,
			name: getString(fields, "name") ?? getString(fields, "accountName"),
			plan: planName ?? getString(fields, "planName") ?? getString(fields, "plan"),
			devicesUsed: getNumber(fields, "devicesUsed") ?? getNumber(fields, "deviceCount") ?? 0,
			devicesLimit: deviceLimit,
		};
	}

	async getDataUsage(): Promise<DataUsage> {
		const accountId = await this.getAccountId();
		let usageResult: unknown = null;
		const accountFields = await this.fetchDocFields(
			`documents/accounts/${encodeURIComponent(accountId)}`,
		);

		try {
			usageResult = await this.callFunction("accountDataStorageSize", { accountId });
		} catch {
			// Cloud function may not exist — fall back to zero usage
		}

		const accountUsage = usageResult as { totalBytes?: number } | null;
		let planFields: FirestoreFields | null = null;
		const billingPlanId = accountFields ? getString(accountFields, "billingPlanId") : null;
		if (billingPlanId) {
			planFields = await this.fetchDocFields(
				`documents/system/billingPlans/plans/${encodeURIComponent(billingPlanId)}`,
			);
		}

		return {
			totalBytes: accountUsage?.totalBytes ?? 0,
			limitBytes: resolveStorageLimitBytes(planFields, accountFields),
			periodStart: getFirstTimestamp(
				accountFields,
				"periodStart",
				"billingPeriodStart",
				"currentPeriodStart",
				"currentBillingPeriodStart",
			),
			periodEnd: getFirstTimestamp(
				accountFields,
				"periodEnd",
				"billingPeriodEnd",
				"currentPeriodEnd",
				"currentBillingPeriodEnd",
				"renewalDate",
			),
			deviceCount:
				getFirstNumber(accountFields, "devicesUsed", "deviceCount", "deviceCounter") ?? 0,
		};
	}

	async getDataUsageByDevice(): Promise<DeviceDataUsage[]> {
		const accountId = await this.getAccountId();
		let usageResult: unknown = null;
		const devices = await this.getDevices();

		try {
			usageResult = await this.callFunction("accountDataStorageSizeByTable", { accountId });
		} catch {
			// Cloud function may not exist — return empty
		}

		const entries = Array.isArray(usageResult)
			? (usageResult as Array<{
					deviceId?: string;
					serial?: string;
					label?: string;
					bytes?: number;
					percentage?: number;
					lastSync?: Date | string | number | null;
				}>)
			: [];

		const deviceLookup = new Map<string, Device>();
		for (const device of devices) {
			deviceLookup.set(device.serial, device);
			if (device.deviceId) {
				deviceLookup.set(device.deviceId, device);
			}
		}

		const totalBytes = entries.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);

		return entries
			.map((entry) => {
				const bytes = entry.bytes ?? 0;
				const rawSerial = entry.serial ?? entry.deviceId ?? "";
				const matchedDevice = deviceLookup.get(rawSerial);
				const serial = matchedDevice?.serial ?? rawSerial;
				const label = entry.label ?? matchedDevice?.label ?? serial ?? "Unknown device";
				const percentage = Number.isFinite(entry.percentage)
					? Math.max(0, Math.min(100, entry.percentage ?? 0))
					: totalBytes > 0
						? Math.round((bytes / totalBytes) * 100)
						: 0;

				return {
					serial,
					label,
					bytes,
					percentage,
					lastSync:
						parseDateValue(entry.lastSync) ??
						matchedDevice?.lastTelemetrySaved ??
						matchedDevice?.lastSeen ??
						null,
				};
			})
			.sort((a, b) => b.bytes - a.bytes);
	}

	async getBillingPlan(): Promise<BillingPlan | null> {
		const accountId = await this.getAccountId();
		const accountFields = await this.fetchDocFields(
			`documents/accounts/${encodeURIComponent(accountId)}`,
		);
		if (!accountFields) return null;

		const billingPlanId = getString(accountFields, "billingPlanId");
		if (!billingPlanId) return null;

		const planFields = await this.fetchDocFields(
			`documents/system/billingPlans/plans/${encodeURIComponent(billingPlanId)}`,
		);
		if (!planFields) return null;

		return {
			name: getFirstString(planFields, "label", "name", "description") ?? billingPlanId,
			tier: getFirstString(planFields, "tier", "id") ?? billingPlanId,
			storageLimitBytes: resolveStorageLimitBytes(planFields, accountFields),
			deviceLimit:
				getFirstNumber(planFields, "deviceCount") ??
				getFirstNumber(accountFields, "devicesLimit", "deviceCount") ??
				0,
			retentionDays: resolveRetentionDays(planFields, accountFields),
			price: getFirstNumber(planFields, "price", "monthlyAmount") ?? 0,
			currency: getFirstString(planFields, "currency") ?? "USD",
			renewalDate: getFirstTimestamp(
				accountFields,
				"renewalDate",
				"periodEnd",
				"billingPeriodEnd",
				"currentPeriodEnd",
				"currentBillingPeriodEnd",
			),
		};
	}

	async getDevices(): Promise<Device[]> {
		const accountId = await this.getAccountId();

		const queryBody = {
			structuredQuery: {
				from: [{ collectionId: "devices" }],
				where: {
					fieldFilter: {
						field: { fieldPath: "accountId" },
						op: "EQUAL",
						value: { stringValue: accountId },
					},
				},
				orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
			},
		};

		const response = await this.firestoreRequest("POST", "documents:runQuery", queryBody);
		const rawResults = await response.json();
		if (!Array.isArray(rawResults)) return [];

		const results = rawResults as Array<{ document?: { fields?: FirestoreFields } }>;
		const devices: Device[] = [];
		for (const result of results) {
			if (result.document?.fields) {
				devices.push(parseDevice(result.document.fields));
			}
		}
		return devices;
	}

	async getDeviceChannel(serial: string, channel: number): Promise<DeviceChannel | null> {
		const path = `documents/devices/${encodeURIComponent(serial)}/channels/${channel}`;
		const fields = await this.fetchDocFields(path);
		if (!fields) return null;
		return parseDeviceChannel(fields);
	}

	async getAllDeviceChannels(serial: string): Promise<DeviceChannel[]> {
		// Use a collection list query instead of 9 individual GETs to avoid 404 noise
		const path = `documents/devices/${encodeURIComponent(serial)}/channels?pageSize=9`;
		const response = await this.firestoreRequest("GET", path);
		if (!response.ok) return [];
		const data = (await response.json()) as {
			documents?: Array<{ fields?: FirestoreFields }>;
		};
		if (!data.documents) return [];
		return data.documents
			.map((doc) => (doc.fields ? parseDeviceChannel(doc.fields) : null))
			.filter((ch): ch is DeviceChannel => ch !== null);
	}

	async getDevicesWithChannels(): Promise<DeviceWithChannels[]> {
		const devices = await this.getDevices();
		const results = await Promise.all(
			devices.map(async (device) => {
				const channels = await this.getAllDeviceChannels(device.serial);
				return { device, channels };
			}),
		);
		return results;
	}

	async getArchives(serial: string, limit = 20): Promise<Archive[]> {
		const safeLim = Math.min(Math.max(1, limit), 500);
		const path = `documents/devices/${encodeURIComponent(serial)}/archive?pageSize=${safeLim}&orderBy=createdOn%20desc`;
		const response = await this.firestoreRequest("GET", path);

		if (!response.ok) {
			throw new Error(`Failed to list archives: HTTP ${response.status}`);
		}

		const data = (await response.json()) as {
			documents?: Array<{ fields?: FirestoreFields; name?: string }>;
			error?: { message?: string };
		};
		if (data.error) {
			throw new Error(data.error.message ?? "Failed to list archives");
		}
		if (!data.documents) return [];

		const archives = data.documents.map((doc) =>
			parseArchive(doc.fields ?? {}, extractDocId(doc.name)),
		);
		if (isDev) {
			console.log("[getArchives] Found:", archives.length, "archives");
			for (const a of archives.slice(0, 3)) {
				console.log(
					`  - ${a.id}: channels=${a.channels?.length ?? 0}, readings=${a.channels?.[0]?.recentReadings?.length ?? 0}`,
				);
			}
		}
		return archives;
	}

	async getTemperatureGuide(): Promise<TemperatureGuide> {
		const fields = await this.fetchDocFields("documents/content/temperatureGuide");
		if (!fields) return { categories: [] };

		const categoriesRaw = getArray(fields, "categories") ?? [];
		const categories: TemperatureCategory[] = categoriesRaw.map((cat) => {
			if (!("mapValue" in cat)) return { name: "", items: [] };
			const catFields = cat.mapValue.fields ?? {};
			const name = getString(catFields, "name") ?? "";
			const itemsRaw = getArray(catFields, "items") ?? [];
			const items: TemperatureGuideItem[] = itemsRaw.map((item) => {
				if (!("mapValue" in item)) return { name: "", temp: 0, units: "F" };
				const itemFields = item.mapValue.fields ?? {};
				return {
					name: getString(itemFields, "name") ?? "",
					temp: getNumber(itemFields, "temp") ?? 0,
					units: getString(itemFields, "units") ?? "F",
					doneness: getString(itemFields, "doneness") ?? undefined,
				};
			});
			return { name, items };
		});

		return { categories };
	}

	/** Fetch firmware info for a device type. Returns null if not found. */
	async getFirmwareInfo(deviceType: string): Promise<FirmwareInfo | null> {
		const fields = await this.fetchDocFields(
			`documents/firmware/${encodeURIComponent(deviceType)}`,
		);
		if (!fields) return null;
		return {
			name: getString(fields, "name") ?? deviceType,
			version: getString(fields, "version") ?? "",
			location: getString(fields, "location") ?? "",
			md5: getString(fields, "md5") ?? "",
		};
	}

	async startSession(serial: string, label?: string): Promise<{ success: boolean }> {
		const body = {
			fields: {
				sessionActive: { booleanValue: true },
				sessionLabel: { stringValue: label ?? "" },
				sessionStart: { timestampValue: new Date().toISOString() },
			},
		};
		const path = `documents/devices/${encodeURIComponent(serial)}?updateMask.fieldPaths=sessionActive&updateMask.fieldPaths=sessionLabel&updateMask.fieldPaths=sessionStart`;
		const response = await this.firestoreRequest("PATCH", path, body);
		return { success: response.ok };
	}

	async endSession(serial: string): Promise<{ success: boolean }> {
		const body = {
			fields: {
				sessionActive: { booleanValue: false },
			},
		};
		const path = `documents/devices/${encodeURIComponent(serial)}?updateMask.fieldPaths=sessionActive`;
		const response = await this.firestoreRequest("PATCH", path, body);
		return { success: response.ok };
	}

	async renameDevice(serial: string, name: string): Promise<{ success: boolean }> {
		const body = { fields: { label: { stringValue: name } } };
		const path = `documents/devices/${encodeURIComponent(serial)}?updateMask.fieldPaths=label`;
		const response = await this.firestoreRequest("PATCH", path, body);
		return { success: response.ok };
	}

	async updateDeviceState(
		serial: string,
		updates: Record<string, string | number | boolean>,
	): Promise<{ success: boolean }> {
		const fields: Record<string, unknown> = {};
		const fieldPaths: string[] = [];
		for (const [key, value] of Object.entries(updates)) {
			fieldPaths.push(key);
			if (typeof value === "string") {
				fields[key] = { stringValue: value };
			} else if (typeof value === "number") {
				fields[key] = { doubleValue: value };
			} else if (typeof value === "boolean") {
				fields[key] = { booleanValue: value };
			}
		}
		const mask = fieldPaths.map((f) => `updateMask.fieldPaths=${f}`).join("&");
		const path = `documents/devices/${encodeURIComponent(serial)}?${mask}`;
		const response = await this.firestoreRequest("PATCH", path, { fields });
		return { success: response.ok };
	}

	async factoryReset(serial: string): Promise<{ success: boolean }> {
		const body = { fields: { factoryReset: { booleanValue: true } } };
		const path = `documents/devices/${encodeURIComponent(serial)}?updateMask.fieldPaths=factoryReset`;
		const response = await this.firestoreRequest("PATCH", path, body);
		return { success: response.ok };
	}

	async setFanTarget(serial: string, temperature: number): Promise<{ success: boolean }> {
		const body = {
			fields: { fan: { mapValue: { fields: { setTemp: { doubleValue: temperature } } } } },
		};
		const path = `documents/devices/${encodeURIComponent(serial)}?updateMask.fieldPaths=fan.setTemp`;
		const response = await this.firestoreRequest("PATCH", path, body);
		return { success: response.ok };
	}

	async setFanEnabled(serial: string, enabled: boolean): Promise<{ success: boolean }> {
		const body = {
			fields: { fan: { mapValue: { fields: { connection: { booleanValue: enabled } } } } },
		};
		const path = `documents/devices/${encodeURIComponent(serial)}?updateMask.fieldPaths=fan.connection`;
		const response = await this.firestoreRequest("PATCH", path, body);
		return { success: response.ok };
	}

	async shareDevice(serial: string): Promise<{ shareUrl: string }> {
		const body = { fields: { shared: { booleanValue: true } } };
		const path = `documents/devices/${encodeURIComponent(serial)}?updateMask.fieldPaths=shared`;
		const response = await this.firestoreRequest("PATCH", path, body);
		if (!response.ok) throw new Error("Failed to share device");
		const baseUrl = `${window.location.origin}${window.location.pathname}`;
		return { shareUrl: `${baseUrl}#/share/device/${serial}` };
	}

	async shareArchive(serial: string, archiveId: string): Promise<{ shareUrl: string }> {
		const baseUrl = `${window.location.origin}${window.location.pathname}`;
		return { shareUrl: `${baseUrl}#/share/archive/${serial}/${archiveId}` };
	}

	async getInvites(): Promise<AccountInvite[]> {
		const accountId = await this.getAccountId();

		const queryBody = {
			structuredQuery: {
				from: [{ collectionId: "usersInvites" }],
				where: {
					fieldFilter: {
						field: { fieldPath: "accountId" },
						op: "EQUAL",
						value: { stringValue: accountId },
					},
				},
				orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
			},
		};

		const response = await this.firestoreRequest("POST", "documents:runQuery", queryBody);
		const rawResults = await response.json();
		if (!Array.isArray(rawResults)) return [];

		const results = rawResults as Array<{
			document?: { fields?: FirestoreFields; name?: string };
		}>;
		const invites: AccountInvite[] = [];
		for (const result of results) {
			if (result.document?.fields) {
				const f = result.document.fields;
				invites.push({
					id: extractDocId(result.document.name),
					accountId: getString(f, "accountId") ?? accountId,
					email: getString(f, "email") ?? undefined,
					status: getString(f, "status") ?? undefined,
					createdAt: getString(f, "createdAt") ?? undefined,
				});
			}
		}
		return invites;
	}

	async removeUser(userId: string): Promise<{ success: boolean }> {
		const accountId = await this.getAccountId();
		const path = `documents/accounts/${encodeURIComponent(accountId)}/users/${encodeURIComponent(userId)}`;
		const response = await this.firestoreRequest("DELETE", path);
		return { success: response.ok };
	}

	async getEvents(filter?: EventFilter): Promise<DeviceEvent[]> {
		const accountId = await this.getAccountId();

		const limit = Math.min(Math.max(1, filter?.limit ?? 50), 500);

		const filters: Array<{
			fieldFilter: {
				field: { fieldPath: string };
				op: string;
				value: { stringValue: string } | { timestampValue: string };
			};
		}> = [
			{
				fieldFilter: {
					field: { fieldPath: "accountId" },
					op: "EQUAL",
					value: { stringValue: accountId },
				},
			},
		];

		if (filter?.deviceId) {
			filters.push({
				fieldFilter: {
					field: { fieldPath: "deviceId" },
					op: "EQUAL",
					value: { stringValue: filter.deviceId },
				},
			});
		}

		if (filter?.eventType) {
			filters.push({
				fieldFilter: {
					field: { fieldPath: "EventType" },
					op: "EQUAL",
					value: { stringValue: filter.eventType },
				},
			});
		}

		if (filter?.startTime) {
			filters.push({
				fieldFilter: {
					field: { fieldPath: "EventTime" },
					op: "GREATER_THAN_OR_EQUAL",
					value: { timestampValue: filter.startTime.toISOString() },
				},
			});
		}

		if (filter?.endTime) {
			filters.push({
				fieldFilter: {
					field: { fieldPath: "EventTime" },
					op: "LESS_THAN_OR_EQUAL",
					value: { timestampValue: filter.endTime.toISOString() },
				},
			});
		}

		const where = filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters } };

		const queryBody = {
			structuredQuery: {
				from: [{ collectionId: "events" }],
				where,
				orderBy: [{ field: { fieldPath: "EventTime" }, direction: "DESCENDING" }],
				limit,
			},
		};

		const response = await this.firestoreRequest("POST", "documents:runQuery", queryBody);
		const rawResults = await response.json();
		if (!Array.isArray(rawResults)) return [];

		const results = rawResults as Array<{ document?: { fields?: FirestoreFields; name?: string } }>;
		const events: DeviceEvent[] = [];
		for (const result of results) {
			if (result.document?.fields) {
				events.push(parseDeviceEvent(result.document.fields, extractDocId(result.document.name)));
			}
		}
		return events;
	}

	async getDeviceGroups(): Promise<DeviceGroup[]> {
		const accountId = await this.getAccountId();
		const path = `documents/accounts/${accountId}/groups`;
		const response = await this.firestoreRequest("GET", path);
		if (!response.ok) return [];
		const data = (await response.json()) as {
			documents?: Array<{ fields?: FirestoreFields; name?: string }>;
		};
		if (!data.documents) return [];
		return data.documents.map((doc) => ({
			id: extractDocId(doc.name),
			name: getString(doc.fields ?? {}, "name") ?? "Unnamed",
			devices: getStringArray(doc.fields ?? {}, "devices") ?? [],
		}));
	}

	async createDeviceGroup(name: string, devices: string[]): Promise<DeviceGroup> {
		const accountId = await this.getAccountId();
		const body = {
			fields: {
				name: { stringValue: name },
				devices: {
					arrayValue: {
						values: devices.map((d) => ({ stringValue: d })),
					},
				},
			},
		};
		const response = await this.firestoreRequest(
			"POST",
			`documents/accounts/${accountId}/groups`,
			body,
		);
		if (!response.ok) {
			throw new Error(`Failed to create device group: HTTP ${response.status}`);
		}
		const doc = (await response.json()) as { fields?: FirestoreFields; name?: string };
		return {
			id: extractDocId(doc.name),
			name,
			devices,
		};
	}

	async deleteDeviceGroup(groupId: string): Promise<void> {
		const accountId = await this.getAccountId();
		const response = await this.firestoreRequest(
			"DELETE",
			`documents/accounts/${accountId}/groups/${encodeURIComponent(groupId)}`,
		);
		if (!response.ok) {
			throw new Error(`Failed to delete device group: HTTP ${response.status}`);
		}
	}

	async setAlarm(serial: string, channel: number, config: AlarmSetOptions): Promise<void> {
		if (!config.high && !config.low) {
			throw new Error("At least one of 'high' or 'low' must be provided");
		}

		const fieldPaths: string[] = [];
		const fields: Record<string, FirestoreValue> = {};

		if (config.high) {
			fieldPaths.push("alarmHigh");
			fields.alarmHigh = buildAlarmMapValue(config.high);
		}

		if (config.low) {
			fieldPaths.push("alarmLow");
			fields.alarmLow = buildAlarmMapValue(config.low);
		}

		const updateMask = fieldPaths.map((fp) => `updateMask.fieldPaths=${fp}`).join("&");
		const path = `documents/devices/${encodeURIComponent(serial)}/channels/${channel}?${updateMask}`;
		const response = await this.firestoreRequest("PATCH", path, { fields });

		if (!response.ok) {
			throw new Error(`Failed to set alarm: HTTP ${response.status}`);
		}
	}

	async getCalibration(serial: string): Promise<CalibrationRecord[]> {
		const path = `documents/devices/${encodeURIComponent(serial)}/calibration`;
		const response = await this.firestoreRequest("GET", path);
		if (!response.ok) return [];

		const data = (await response.json()) as {
			documents?: Array<{ fields?: FirestoreFields; name?: string }>;
		};
		if (!data.documents) return [];

		return data.documents.map((doc) =>
			parseCalibrationRecord(doc.fields ?? {}, extractDocId(doc.name)),
		);
	}

	async getHistory(serial: string): Promise<DeviceHistory> {
		try {
			const result = await this.callFunction("requestRetrieveInstrumentHistory", {
				deviceId: serial,
			});
			if (isDev) {
				console.log("[getHistory] Cloud Function result:", JSON.stringify(result).slice(0, 500));
			}
			const readings: HistoricalReading[] = [];
			if (result && typeof result === "object") {
				// Try multiple response shapes the function may return
				let raw: unknown[] | undefined;
				if ("readings" in result) {
					raw = (result as { readings?: unknown }).readings as unknown[];
				} else if (Array.isArray(result)) {
					raw = result;
				}
				if (Array.isArray(raw)) {
					for (const entry of raw) {
						if (entry && typeof entry === "object") {
							const r = entry as Record<string, unknown>;
							// Support { v, ts, u } format (SDK format)
							const value =
								r.v != null ? Number(r.v) : r.value != null ? Number(r.value) : Number.NaN;
							const timestamp = (r.ts ?? r.timestamp ?? "") as string;
							const units = (r.u ?? r.units ?? "") as string;
							if (!Number.isNaN(value) && timestamp && units) {
								readings.push({ value, timestamp: String(timestamp), units: String(units) });
							}
						}
					}
				}
			}
			if (isDev) {
				console.log("[getHistory] Parsed readings:", readings.length);
			}
			return { readings };
		} catch (err) {
			if (isDev) {
				console.warn("[getHistory] Cloud Function error:", err);
			}
			return { readings: [] };
		}
	}

	async resetMinMax(serial: string, channel: number): Promise<{ success: boolean }> {
		const body = {
			fields: {
				[`ch${channel}Min`]: { nullValue: null as unknown },
				[`ch${channel}Max`]: { nullValue: null as unknown },
			},
		};
		const maskPaths = `updateMask.fieldPaths=ch${channel}Min&updateMask.fieldPaths=ch${channel}Max`;
		const path = `documents/devices/${encodeURIComponent(serial)}?${maskPaths}`;
		const response = await this.firestoreRequest(
			"PATCH",
			path,
			body as unknown as Record<string, unknown>,
		);
		return { success: response.ok };
	}

	async getNotificationSettings(): Promise<NotificationSettings> {
		const user = await this.getUser();
		return (
			user.notificationSettings ?? {
				enabled: false,
				continuousAlerts: false,
				emailNotification: false,
				smsNotification: false,
				deviceNotification: false,
			}
		);
	}

	async updateNotificationSettings(
		settings: Partial<NotificationSettings>,
	): Promise<{ success: boolean }> {
		if (!this.token) throw new AuthError("Not authenticated", "NOT_AUTHENTICATED");
		const current = await this.getNotificationSettings();
		const merged: NotificationSettings = { ...current, ...settings };
		const path = `documents/users/${this.token.userId}?updateMask.fieldPaths=notificationSettings`;
		const body = {
			fields: {
				notificationSettings: {
					mapValue: {
						fields: {
							enabled: { booleanValue: merged.enabled },
							continuousAlerts: { booleanValue: merged.continuousAlerts },
							emailNotification: { booleanValue: merged.emailNotification },
							smsNotification: { booleanValue: merged.smsNotification },
							deviceNotification: { booleanValue: merged.deviceNotification },
						},
					},
				},
			},
		};
		const response = await this.firestoreRequest("PATCH", path, body);
		return { success: response.ok };
	}
}

function parseCalibrationRecord(fields: FirestoreFields, id: string): CalibrationRecord {
	const pointsRaw = getArray(fields, "points") ?? [];
	const points: CalibrationPoint[] = pointsRaw.map((p) => {
		if (!("mapValue" in p)) return { referenceTemp: 0, measuredTemp: 0, units: "F" };
		const pf = p.mapValue.fields ?? {};
		return {
			referenceTemp: getNumber(pf, "referenceTemp") ?? 0,
			measuredTemp: getNumber(pf, "measuredTemp") ?? 0,
			units: getString(pf, "units") ?? "F",
		};
	});
	return {
		id,
		date: getTimestamp(fields, "calibratedAt"),
		source: getString(fields, "source") ?? "manual",
		result: getString(fields, "result") ?? "unknown",
		ambientTemp: getNumber(fields, "ambientTemp"),
		ambientUnits: getString(fields, "ambientUnits"),
		points,
	};
}

function parseDeviceEvent(fields: FirestoreFields, id: string): DeviceEvent {
	return {
		id,
		eventType: getString(fields, "eventType") ?? getString(fields, "EventType") ?? "",
		severity: getNumber(fields, "severity") ?? 0,
		eventTime:
			getTimestamp(fields, "EventTime") ?? getTimestamp(fields, "eventTime") ?? new Date(0),
		deviceId: getString(fields, "deviceId") ?? getString(fields, "DeviceId") ?? "",
		channelId: getString(fields, "channelId") ?? getString(fields, "ChannelId"),
		accountId: getString(fields, "accountId") ?? getString(fields, "AccountId") ?? "",
		valueBefore: getString(fields, "valueBefore") ?? getString(fields, "ValueBefore"),
		valueAfter: getString(fields, "valueAfter") ?? getString(fields, "ValueAfter"),
		groups: getStringArray(fields, "groups"),
	};
}

function buildAlarmMapValue(opts: AlarmThresholdOptions): FirestoreValue {
	const mapFields: Record<string, FirestoreValue> = {
		value: { doubleValue: opts.value },
	};
	if (opts.units !== undefined) {
		mapFields.units = { stringValue: opts.units };
	}
	if (opts.enabled !== undefined) {
		mapFields.enabled = { booleanValue: opts.enabled };
	}
	if (opts.muted !== undefined) {
		mapFields.muted = { booleanValue: opts.muted };
	}
	return { mapValue: { fields: mapFields } };
}

async function publicFirestoreGet(path: string): Promise<FirestoreFields | null> {
	const projectId = await getProjectId();
	const url = `${FIRESTORE_HOST}/v1/projects/${projectId}/databases/(default)/${path}?key=${DEFAULT_API_KEY}`;
	const response = await fetch(url, {
		headers: { referer: REFERER },
	});
	if (response.status === 404) return null;
	if (response.status === 403) return null;
	if (!response.ok) {
		throw new Error(`Public Firestore request failed: HTTP ${response.status}`);
	}
	const doc = (await response.json()) as { fields?: FirestoreFields };
	return doc.fields ?? null;
}

// ─── Public share helpers ────────────────────────────────────────────────────

const SERIAL_PATTERN = /^[A-Za-z0-9:_-]+$/;

let cachedProjectId: string | null = null;

async function getProjectId(): Promise<string> {
	if (!cachedProjectId) {
		const url = `${FIREBASE_HOST}/v1alpha/projects/-/apps/${DEFAULT_APP_ID}/webConfig`;
		const response = await fetch(url, {
			headers: {
				accept: "application/json",
				"x-goog-api-key": DEFAULT_API_KEY,
				referer: REFERER,
			},
		});
		if (!response.ok) throw new Error("Failed to resolve Firebase project ID");
		const data = (await response.json()) as { projectId: string };
		cachedProjectId = data.projectId;
	}
	return cachedProjectId;
}

/** Fetch a publicly shared device (no auth required). */
export async function getPublicDevice(serial: string): Promise<Device | null> {
	if (!SERIAL_PATTERN.test(serial)) return null;
	const fields = await publicFirestoreGet(`documents/devices/${encodeURIComponent(serial)}`);
	if (!fields) return null;
	if (!getBoolean(fields, "public")) return null;
	return parseDevice(fields);
}

/** Fetch all channels for a publicly shared device (no auth required). */
export async function getPublicDeviceChannels(serial: string): Promise<DeviceChannel[]> {
	if (!SERIAL_PATTERN.test(serial)) return [];
	const channels: DeviceChannel[] = [];
	const results = await Promise.allSettled(
		Array.from({ length: 9 }, (_, i) => {
			const path = `documents/devices/${encodeURIComponent(serial)}/channels/${i + 1}`;
			return publicFirestoreGet(path);
		}),
	);
	for (const result of results) {
		if (result.status === "fulfilled" && result.value !== null) {
			channels.push(parseDeviceChannel(result.value));
		}
	}
	return channels;
}

/** Fetch a publicly shared archive (no auth required). */
export async function getPublicArchive(serial: string, archiveId: string): Promise<Archive | null> {
	if (!SERIAL_PATTERN.test(serial)) return null;
	if (!archiveId) return null;
	const path = `documents/devices/${encodeURIComponent(serial)}/archive/${encodeURIComponent(archiveId)}`;
	const fields = await publicFirestoreGet(path);
	if (!fields) return null;
	if (!getBoolean(fields, "public")) return null;
	return parseArchive(fields, archiveId);
}
