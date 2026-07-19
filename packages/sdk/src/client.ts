import { type AuthSession, createAuthSession } from "./auth.js";
import { toFahrenheit } from "./convert.js";
import {
	type FirestoreFields,
	type FirestoreValue,
	getArray,
	getBoolean,
	getMapFields,
	getNumber,
	getString,
	getStringArray,
	getTimestamp,
} from "./firestore.js";
import {
	type ChannelUpdateCallback,
	createSubscription,
	type ErrorCallback,
	type Subscription,
	type SubscriptionOptions,
} from "./subscribe.js";
import {
	type Account,
	type AccountInvite,
	type ActionResult,
	type Alarm,
	type AlarmSetOptions,
	type AlarmThresholdOptions,
	type Archive,
	type ArchiveChannel,
	type ArchiveListOptions,
	type BillingPlan,
	type CalibrationPoint,
	type CalibrationRecord,
	type DataUsage,
	type Device,
	type DeviceChannel,
	type DeviceDataUsage,
	type DeviceEvent,
	type DeviceFilter,
	type DeviceGroup,
	type DeviceHistory,
	type EventFilter,
	type FanSettings,
	type FirmwareInfo,
	type HistoricalReading,
	type MinMaxReading,
	NetworkError,
	NotFoundError,
	type NotificationSettings,
	type SearchHit,
	type SearchOptions,
	type SearchResult,
	type ShareResult,
	type TemperatureCategory,
	type TemperatureGuide,
	type TemperatureReading,
	type ThermoworksConfig,
	type User,
} from "./types.js";

const SERIAL_PATTERN = /^[A-Za-z0-9:_-]+$/;

function validateSerial(serial: string): void {
	if (!serial || !SERIAL_PATTERN.test(serial)) {
		throw new Error(`Invalid device serial: ${serial}`);
	}
}

function validateChannel(channel: number): void {
	if (!Number.isInteger(channel) || channel < 1 || channel > 9) {
		throw new Error(`Invalid channel number: ${channel} (must be integer 1-9)`);
	}
}

/** Strip ANSI escape sequences and control characters from a string. */
function sanitizeLabel(value: string | null | undefined): string | null {
	if (value == null) return null;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional - stripping control chars
	return value.replace(/[\x00-\x1f\x7f\x1b](\[[0-9;]*[A-Za-z])?/g, "");
}

/**
 * Client for the ThermoWorks Cloud service.
 *
 * @example
 * ```ts
 * const client = new ThermoworksCloud({
 *   email: process.env.THERMOWORKS_EMAIL!,
 *   password: process.env.THERMOWORKS_PASSWORD!,
 * });
 *
 * const devices = await client.getDevices();
 * for (const device of devices) {
 *   const channel = await client.getDeviceChannel(device.serial, 1);
 *   console.log(`${device.label}: ${channel.value}°${channel.units}`);
 * }
 *
 * client.close();
 * ```
 */
export class ThermoworksCloud {
	private readonly config: ThermoworksConfig;
	private session: AuthSession | null = null;
	private sessionPromise: Promise<AuthSession> | null = null;
	private cachedAccountId: string | null = null;
	private closed = false;
	private readonly activeSubscriptions = new Set<Subscription>();

	constructor(config: ThermoworksConfig) {
		this.config = config;
	}

	/** Get the authenticated user's information. */
	async getUser(): Promise<User> {
		const session = await this.ensureSession();
		const userId = session.getUserId();
		const response = await session.request("GET", `documents/users/${userId}`);

		if (response.status === 404) {
			await response.text().catch(() => {});
			throw new NotFoundError("User not found");
		}

		const doc = (await response.json()) as { fields?: FirestoreFields };
		const fields = doc.fields ?? {};

		return {
			userId,
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
			accountRoles: parseStringBooleanMap(getMapFields(fields, "accountRoles")),
			roles: parseStringBooleanMap(getMapFields(fields, "roles")),
			notificationSettings: parseNotificationSettings(getMapFields(fields, "notificationSettings")),
		};
	}

	/** Get the authenticated user's notification preferences. */
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

	/**
	 * Update the authenticated user's notification preferences.
	 *
	 * Performs a read-merge-write to ensure unspecified fields retain
	 * their current values (Firestore updateMask replaces the entire map).
	 */
	async updateNotificationSettings(settings: Partial<NotificationSettings>): Promise<void> {
		const current = await this.getNotificationSettings();
		const merged: NotificationSettings = { ...current, ...settings };

		const session = await this.ensureSession();
		const userId = session.getUserId();
		const path = `documents/users/${userId}?updateMask.fieldPaths=notificationSettings`;
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

		const response = await session.request("PATCH", path, body);
		if (!response.ok) {
			throw new NetworkError(
				`Failed to update notification settings: HTTP ${response.status}`,
				response.status,
			);
		}
		// Consume the response body to release the connection
		await response.text().catch(() => {});
	}

	/** Get all devices for the authenticated user, with optional filtering. */
	async getDevices(filter?: DeviceFilter): Promise<Device[]> {
		let accountId = this.cachedAccountId;
		if (!accountId) {
			const user = await this.getUser();
			if (!user.accountId) {
				return [];
			}
			accountId = user.accountId;
			this.cachedAccountId = accountId;
		}

		const session = await this.ensureSession();
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

		const response = await session.request("POST", "documents:runQuery", queryBody);
		const rawResults = await response.json();
		if (!Array.isArray(rawResults)) {
			const maybeError = rawResults as { error?: { message?: string } } | null;
			if (maybeError?.error) {
				throw new NetworkError(maybeError.error.message ?? "Query failed");
			}
			return [];
		}
		const results = rawResults as Array<{ document?: { fields?: FirestoreFields } }>;

		let devices: Device[] = [];
		for (const result of results) {
			if (result.document?.fields) {
				devices.push(parseDevice(result.document.fields));
			}
		}

		if (filter) {
			devices = applyDeviceFilter(devices, filter);
		}

		return devices;
	}

	/** Get a single device by serial number. */
	async getDevice(serial: string): Promise<Device> {
		validateSerial(serial);
		const fields = await this.fetchDocFields(
			`documents/devices/${encodeURIComponent(serial)}`,
			`Device with serial '${serial}' not found`,
		);
		if (!fields || Object.keys(fields).length === 0) {
			throw new NetworkError("Invalid response: missing fields");
		}
		return parseDevice(fields);
	}

	/** Get a channel reading for a device. Channels are 1-indexed. */
	async getDeviceChannel(serial: string, channel: number): Promise<DeviceChannel> {
		validateSerial(serial);
		validateChannel(channel);
		const fields = await this.fetchDocFields(
			`documents/devices/${encodeURIComponent(serial)}/channels/${channel}`,
			`Channel ${channel} not found for device '${serial}'`,
		);
		return parseDeviceChannel(fields);
	}

	/**
	 * Get all channels for a device. Probes all channels 1-9, skipping any gaps.
	 */
	async getAllDeviceChannels(serial: string): Promise<DeviceChannel[]> {
		const results = await Promise.allSettled(
			Array.from({ length: 9 }, (_, i) => this.getDeviceChannel(serial, i + 1)),
		);
		const channels: DeviceChannel[] = [];
		for (const result of results) {
			if (result.status === "fulfilled") {
				channels.push(result.value);
			} else if (!(result.reason instanceof NotFoundError)) {
				throw result.reason;
			}
		}
		return channels;
	}

	/**
	 * Compute the average temperature across all temperature channels for a device.
	 * Excludes humidity channels (units "H") and channels with no reading.
	 * Returns null if no temperature channels have readings.
	 */
	async getAverageTemperature(serial: string): Promise<{ value: number; units: string } | null> {
		const channels = await this.getAllDeviceChannels(serial);
		const temps = channels.filter(
			(ch): ch is DeviceChannel & { value: number; units: string } =>
				ch.value != null && ch.units != null && ch.units !== "H",
		);

		const first = temps[0];
		if (!first) return null;

		// Normalize all values to the first channel's unit system before averaging
		const targetUnits = first.units;
		const normalized = temps.map((ch) => {
			if (ch.units === targetUnits) return ch.value;
			// Convert between F and C as needed
			return targetUnits === "F" ? toFahrenheit(ch.value) : (ch.value - 32) * (5 / 9);
		});

		const sum = normalized.reduce((acc, v) => acc + v, 0);
		return {
			value: Math.round((sum / normalized.length) * 10) / 10,
			units: targetUnits,
		};
	}

	/**
	 * Set alarm thresholds on a device channel.
	 *
	 * Performs a partial update - only the provided fields are modified.
	 * At least one of `high` or `low` must be specified.
	 *
	 * @example
	 * ```ts
	 * // Set a high alarm at 275°F
	 * await client.setAlarm("ABC123", 1, {
	 *   high: { value: 275, units: "F", enabled: true },
	 * });
	 *
	 * // Set both high and low alarms
	 * await client.setAlarm("ABC123", 1, {
	 *   high: { value: 275, units: "F", enabled: true },
	 *   low: { value: 32, units: "F", enabled: true },
	 * });
	 * ```
	 */
	async setAlarm(serial: string, channel: number, config: AlarmSetOptions): Promise<void> {
		validateSerial(serial);
		validateChannel(channel);

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
		const body = { fields };

		const session = await this.ensureSession();
		await session.request("PATCH", path, body);
	}

	/** Get account metadata. */
	async getAccount(): Promise<Account> {
		const accountId = await this.resolveAccountId();
		const fields = await this.fetchDocFields(
			`documents/accounts/${encodeURIComponent(accountId)}`,
			"Account not found",
		);

		return {
			accountId,
			name: getString(fields, "name"),
			type: getString(fields, "type"),
			createdOn: getTimestamp(fields, "createdOn"),
			exportVersion: getNumber(fields, "exportVersion"),
		};
	}

	/** Get total data storage usage for the authenticated user's account. */
	async getDataUsage(): Promise<DataUsage> {
		const accountId = await this.resolveAccountId();
		const session = await this.ensureSession();
		const result = await session.callFunction("accountDataStorageSize", { accountId });
		const data = result as { totalBytes?: number } | null;
		const totalBytes = data?.totalBytes ?? 0;
		return {
			totalBytes,
			formattedSize: formatBytes(totalBytes),
		};
	}

	/** Get per-device data storage usage for the authenticated user's account. */
	async getDataUsageByDevice(): Promise<DeviceDataUsage[]> {
		const accountId = await this.resolveAccountId();
		const session = await this.ensureSession();
		const result = await session.callFunction("accountDataStorageSizeByTable", { accountId });
		const data = result as Array<{ deviceId?: string; bytes?: number }> | null;
		if (!Array.isArray(data)) return [];
		return data.map((entry) => {
			const bytes = entry.bytes ?? 0;
			return {
				deviceId: entry.deviceId ?? "",
				bytes,
				formattedSize: formatBytes(bytes),
			};
		});
	}

	/** Get the billing plan for the authenticated user's account. */
	async getBillingPlan(): Promise<BillingPlan | null> {
		const accountId = await this.resolveAccountId();
		const session = await this.ensureSession();
		const accountResponse = await session.request(
			"GET",
			`documents/accounts/${encodeURIComponent(accountId)}`,
		);

		if (accountResponse.status === 404) {
			await accountResponse.text().catch(() => {});
			return null;
		}

		const accountDoc = (await accountResponse.json()) as { fields?: FirestoreFields };
		const accountFields = accountDoc.fields ?? {};
		const planId = getString(accountFields, "billingPlanId");
		if (!planId) return null;

		const planResponse = await session.request(
			"GET",
			`documents/system/billingPlans/plans/${encodeURIComponent(planId)}`,
		);

		if (planResponse.status === 404) {
			await planResponse.text().catch(() => {});
			return null;
		}

		const planDoc = (await planResponse.json()) as { fields?: FirestoreFields };
		const fields = planDoc.fields ?? {};
		return {
			id: planId,
			name: getString(fields, "name") ?? "",
			description: getString(fields, "description") ?? "",
			monthlyAmount: getNumber(fields, "monthlyAmount") ?? 0,
			deviceCount: getNumber(fields, "deviceCount") ?? 0,
			isDefault: getBoolean(fields, "isDefault") ?? false,
		};
	}

	/** Get pending invitations for the authenticated user's account. */
	async getInvites(): Promise<AccountInvite[]> {
		const accountId = await this.resolveAccountId();
		const session = await this.ensureSession();

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

		const response = await session.request("POST", "documents:runQuery", queryBody);
		const rawResults = await response.json();
		if (!Array.isArray(rawResults)) {
			const maybeError = rawResults as { error?: { message?: string } } | null;
			if (maybeError?.error) {
				throw new NetworkError(maybeError.error.message ?? "Invites query failed");
			}
			return [];
		}

		const results = rawResults as Array<{ document?: { fields?: FirestoreFields; name?: string } }>;
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

	/** Remove a user from the authenticated user's account. */
	async removeUser(userId: string): Promise<ActionResult> {
		if (!userId) {
			throw new Error("userId is required");
		}
		const accountId = await this.resolveAccountId();
		return this.callAction("userRemoteFromAccount", { userId, accountId });
	}

	/** Get events for the authenticated user's account. */
	async getEvents(filter?: EventFilter): Promise<DeviceEvent[]> {
		const accountId = await this.resolveAccountId();
		const session = await this.ensureSession();
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

		const where =
			filters.length === 1 ? filters[0] : { compositeFilter: { op: "AND", filters: filters } };

		const queryBody = {
			structuredQuery: {
				from: [{ collectionId: "events" }],
				where,
				orderBy: [{ field: { fieldPath: "EventTime" }, direction: "DESCENDING" }],
				limit,
			},
		};

		const response = await session.request("POST", "documents:runQuery", queryBody);
		const rawResults = await response.json();
		if (!Array.isArray(rawResults)) {
			const maybeError = rawResults as { error?: { message?: string } } | null;
			if (maybeError?.error) {
				throw new NetworkError(maybeError.error.message ?? "Event query failed");
			}
			return [];
		}

		const results = rawResults as Array<{ document?: { fields?: FirestoreFields; name?: string } }>;
		const events: DeviceEvent[] = [];
		for (const result of results) {
			if (result.document?.fields) {
				events.push(parseDeviceEvent(result.document.fields, extractDocId(result.document.name)));
			}
		}
		return events;
	}

	/** Get events for a specific device. */
	async getDeviceEvents(serial: string, limit?: number): Promise<DeviceEvent[]> {
		validateSerial(serial);
		return this.getEvents({ deviceId: serial, limit: limit ?? 50 });
	}

	/** Get archived sessions for a device. */
	async getArchives(serial: string, options?: ArchiveListOptions): Promise<Archive[]> {
		validateSerial(serial);
		const session = await this.ensureSession();
		const limit = Math.min(Math.max(1, options?.limit ?? 20), 500);
		let path = `documents/devices/${encodeURIComponent(serial)}/archive?pageSize=${limit}&orderBy=createdOn%20desc`;
		if (options?.startAfter) {
			path += `&pageToken=${encodeURIComponent(options.startAfter)}`;
		}

		const response = await session.request("GET", path);
		const data = (await response.json()) as {
			documents?: Array<{ fields?: FirestoreFields; name?: string }>;
			error?: { message?: string };
		};
		if (data.error) {
			throw new NetworkError(data.error.message ?? "Failed to list archives");
		}
		if (!data.documents) return [];

		return data.documents.map((doc) => parseArchive(doc.fields ?? {}, extractDocId(doc.name)));
	}

	/** Get a specific archive by ID. */
	async getArchive(serial: string, archiveId: string): Promise<Archive> {
		validateSerial(serial);
		const session = await this.ensureSession();
		const response = await session.request(
			"GET",
			`documents/devices/${encodeURIComponent(serial)}/archive/${encodeURIComponent(archiveId)}`,
		);

		if (response.status === 404) {
			await response.text().catch(() => {});
			throw new NotFoundError(`Archive '${archiveId}' not found for device '${serial}'`);
		}

		const doc = (await response.json()) as { fields?: FirestoreFields; name?: string };
		return parseArchive(doc.fields ?? {}, archiveId);
	}

	/** Get calibration records for a device. */
	async getCalibration(serial: string): Promise<CalibrationRecord[]> {
		validateSerial(serial);
		const session = await this.ensureSession();
		const response = await session.request(
			"GET",
			`documents/devices/${encodeURIComponent(serial)}/calibration`,
		);

		const data = (await response.json()) as {
			documents?: Array<{ fields?: FirestoreFields; name?: string }>;
		};
		if (!data.documents) return [];

		return data.documents.map((doc) =>
			parseCalibrationRecord(doc.fields ?? {}, extractDocId(doc.name)),
		);
	}

	/** Get firmware info for a device type. */
	async getFirmwareInfo(deviceType: string): Promise<FirmwareInfo> {
		const fields = await this.fetchDocFields(
			`documents/firmware/${encodeURIComponent(deviceType)}`,
			`Firmware info not found for type '${deviceType}'`,
		);

		return {
			name: getString(fields, "name") ?? deviceType,
			version: getString(fields, "version") ?? "",
			location: getString(fields, "location") ?? "",
			md5: getString(fields, "md5") ?? "",
		};
	}

	/** Get the cooking temperature guide. */
	async getTemperatureGuide(): Promise<TemperatureGuide> {
		const session = await this.ensureSession();
		const response = await session.request("GET", "documents/content/temperatureGuide");

		if (response.status === 404) {
			await response.text().catch(() => {});
			throw new NotFoundError("Temperature guide not found");
		}

		const doc = (await response.json()) as { fields?: FirestoreFields };
		const fields = doc.fields ?? {};
		const categoriesRaw = getArray(fields, "categories");
		const categories: TemperatureCategory[] = [];

		if (categoriesRaw) {
			for (const item of categoriesRaw) {
				if ("mapValue" in item && item.mapValue.fields) {
					const f = item.mapValue.fields;
					categories.push({
						label: getString(f, "label") ?? "",
						icon: getString(f, "icon") ?? "",
						pullWarning: getString(f, "pullWarning"),
						warning: getString(f, "warning"),
					});
				}
			}
		}

		return { categories };
	}

	/** Search across devices, accounts, or users via Typesense. */
	async search(query: string, options: SearchOptions): Promise<SearchResult> {
		const allowedCollections = new Set(["device", "accounts", "users"]);
		if (!allowedCollections.has(options.collection)) {
			throw new Error(`Invalid search collection: ${options.collection}`);
		}
		if (query.length > 500) {
			throw new Error("Search query exceeds maximum length of 500 characters");
		}
		const session = await this.ensureSession();
		const result = await session.callFunction("typesense_search", {
			query,
			collection: options.collection,
			page: Math.max(1, options.page ?? 1),
			pageSize: Math.min(Math.max(1, options.pageSize ?? 20), 100),
		});

		const data = result as {
			hits?: Array<{ id?: string; score?: number; document?: Record<string, unknown> }>;
			totalHits?: number;
			page?: number;
		} | null;
		const hits: SearchHit[] = [];
		if (data?.hits) {
			for (const hit of data.hits) {
				hits.push({
					id: hit.id ?? "",
					score: hit.score ?? 0,
					document: hit.document ?? {},
				});
			}
		}

		return {
			hits,
			totalHits: data?.totalHits ?? 0,
			page: data?.page ?? 1,
		};
	}

	/** Start a monitoring session for the given device. */
	async startSession(serial: string, label?: string): Promise<ActionResult> {
		validateSerial(serial);
		if (label != null && label.length > 200) {
			throw new Error("label exceeds maximum length of 200 characters");
		}
		const data: Record<string, unknown> = { deviceId: serial };
		if (label != null) data.label = sanitizeLabel(label) ?? label;
		return this.callAction("newSessionRequest", data);
	}

	/** End an active monitoring session for the given device. */
	async endSession(serial: string): Promise<ActionResult> {
		validateSerial(serial);
		return this.callAction("endSessionRequest", { deviceId: serial });
	}

	/** Clear session data for the given device. */
	async clearSession(serial: string): Promise<ActionResult> {
		validateSerial(serial);
		return this.callAction("clearSessionRequest", { deviceId: serial });
	}

	/** Reset the min/max readings for a specific device channel. */
	async resetMinMax(serial: string, channel: number): Promise<ActionResult> {
		validateSerial(serial);
		validateChannel(channel);
		return this.callAction("telemetryDeviceChannelResetMinMax", {
			deviceId: serial,
			channelId: channel,
		});
	}

	/** Clear all events for the given device. */
	async clearEvents(serial: string): Promise<ActionResult> {
		validateSerial(serial);
		return this.callAction("deviceClearEvents", { deviceId: serial });
	}

	/** Update device state/settings via a Cloud Function. */
	async updateDeviceState(serial: string, state: Record<string, unknown>): Promise<ActionResult> {
		validateSerial(serial);
		if (!state || typeof state !== "object" || Array.isArray(state)) {
			throw new Error("state must be a non-null object");
		}
		return this.callAction("deviceStateUpdate", { deviceId: serial, state });
	}

	/** Rename a device. */
	async renameDevice(serial: string, name: string): Promise<ActionResult> {
		validateSerial(serial);
		if (typeof name !== "string" || name.trim().length === 0) {
			throw new Error("name must be a non-empty string");
		}
		if (name.length > 200) {
			throw new Error("name exceeds maximum length of 200 characters");
		}
		return this.callAction("setInstrumentName", { deviceId: serial, name });
	}

	/** Factory reset a device. */
	async factoryReset(serial: string): Promise<ActionResult> {
		validateSerial(serial);
		return this.callAction("deviceFactoryReset", { deviceId: serial });
	}

	/** Share a device's live state publicly via a shareable link. */
	async shareDevice(serial: string): Promise<ShareResult> {
		validateSerial(serial);
		const session = await this.ensureSession();
		const result = await session.callFunction("publicShareDeviceState", { deviceId: serial });
		return toShareResult(result);
	}

	/** Share an archive publicly via a shareable link. */
	async shareArchive(serial: string, archiveId: string): Promise<ShareResult> {
		validateSerial(serial);
		if (!archiveId) {
			throw new Error("archiveId is required");
		}
		const session = await this.ensureSession();
		const result = await session.callFunction("publicShareArchive", {
			archiveId,
			deviceId: serial,
		});
		return toShareResult(result);
	}

	/** Retrieve full historical temperature time-series data from BigQuery. */
	async getHistory(serial: string): Promise<DeviceHistory> {
		validateSerial(serial);
		const session = await this.ensureSession();
		const result = await session.callFunction("requestRetrieveInstrumentHistory", {
			deviceId: serial,
		});
		return parseDeviceHistory(serial, result);
	}

	// ─── Device Groups ─────────────────────────────────────────────────────────

	/**
	 * Get device groups for the authenticated user.
	 *
	 * Reads the user profile's `deviceGroupOrDeviceOrder` field to identify
	 * group references, then fetches each group's details from the account's
	 * `deviceGroups` subcollection.
	 */
	async getDeviceGroups(): Promise<DeviceGroup[]> {
		const session = await this.ensureSession();
		const userId = session.getUserId();
		const response = await session.request("GET", `documents/users/${userId}`);

		if (response.status === 404) {
			await response.text().catch(() => {});
			throw new NotFoundError("User not found");
		}

		const doc = (await response.json()) as { fields?: FirestoreFields };
		const fields = doc.fields ?? {};

		const accountId = getString(fields, "accountId");
		if (!accountId) return [];

		// Parse deviceGroupOrDeviceOrder: { accountId: { "0": { id, type }, ... } }
		const orderMap = getMapFields(fields, "deviceGroupOrDeviceOrder");
		if (!orderMap) return [];

		const accountOrderMap = getMapFields(orderMap, accountId);
		if (!accountOrderMap) return [];

		// Collect group IDs from entries with type "deviceGroup"
		const groupIds: string[] = [];
		for (const entry of Object.values(accountOrderMap)) {
			if ("mapValue" in entry) {
				const entryFields = entry.mapValue.fields ?? {};
				const id =
					entryFields.id && "stringValue" in entryFields.id ? entryFields.id.stringValue : null;
				const type =
					entryFields.type && "stringValue" in entryFields.type
						? entryFields.type.stringValue
						: null;
				if (id && type === "deviceGroup") {
					groupIds.push(id);
				}
			}
		}

		if (groupIds.length === 0) return [];

		// Fetch each group document from the account's deviceGroups subcollection.
		// The requests are independent, so run them in parallel to avoid N sequential
		// round trips; Promise.all preserves groupIds order in the result.
		const groups: DeviceGroup[] = await Promise.all(
			groupIds.map(async (groupId): Promise<DeviceGroup> => {
				const groupPath = `documents/accounts/${encodeURIComponent(accountId)}/deviceGroups/${encodeURIComponent(groupId)}`;
				const groupResponse = await session.request("GET", groupPath);

				if (groupResponse.status === 404) {
					await groupResponse.text().catch(() => {});
					// Group referenced but document missing - include with minimal info
					return { id: groupId, name: "", devices: [] };
				}

				const groupDoc = (await groupResponse.json()) as { fields?: FirestoreFields };
				const groupFields = groupDoc.fields ?? {};
				return {
					id: groupId,
					name: getString(groupFields, "name") ?? "",
					devices: getStringArray(groupFields, "devices") ?? [],
				};
			}),
		);

		return groups;
	}

	/**
	 * Create a new device group in the account's deviceGroups subcollection.
	 */
	async createDeviceGroup(name: string, devices: string[]): Promise<DeviceGroup> {
		if (typeof name !== "string" || name.trim().length === 0) {
			throw new Error("Group name must be a non-empty string");
		}
		if (name.length > 200) {
			throw new Error("Group name exceeds maximum length of 200 characters");
		}
		for (const d of devices) {
			validateSerial(d);
		}

		const accountId = await this.resolveAccountId();
		const session = await this.ensureSession();
		const path = `documents/accounts/${encodeURIComponent(accountId)}/deviceGroups`;
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
		const response = await session.request("POST", path, body);
		if (!response.ok) {
			await response.text().catch(() => {});
			throw new Error(`Failed to create group: ${response.status}`);
		}
		const doc = (await response.json()) as { name?: string; fields?: FirestoreFields };
		const docName = doc.name ?? "";
		const id = docName.split("/").pop() ?? "";
		return { id, name, devices };
	}

	/**
	 * Delete a device group.
	 *
	 * @throws Error - This method is not yet supported as the full device group
	 * API is not documented.
	 */
	async deleteDeviceGroup(_groupId: string): Promise<void> {
		throw new Error(
			"deleteDeviceGroup is not yet supported: the device group write API is not fully documented",
		);
	}

	/**
	 * Add a device to an existing group by updating the group's devices array.
	 */
	async addDeviceToGroup(groupId: string, serial: string): Promise<void> {
		if (!groupId || typeof groupId !== "string") {
			throw new Error("groupId is required");
		}
		validateSerial(serial);

		const groups = await this.getDeviceGroups();
		const group = groups.find((g) => g.id === groupId);
		if (!group) throw new NotFoundError(`Group ${groupId} not found`);
		if (group.devices.includes(serial)) return;

		const accountId = await this.resolveAccountId();
		const session = await this.ensureSession();
		const newDevices = [...group.devices, serial];
		const path = `documents/accounts/${encodeURIComponent(accountId)}/deviceGroups/${encodeURIComponent(groupId)}?updateMask.fieldPaths=devices`;
		const body = {
			fields: {
				devices: {
					arrayValue: {
						values: newDevices.map((d) => ({ stringValue: d })),
					},
				},
			},
		};
		const response = await session.request("PATCH", path, body);
		await response.text().catch(() => {});
	}

	/**
	 * Remove a device from a group by updating the group's devices array.
	 */
	async removeDeviceFromGroup(groupId: string, serial: string): Promise<void> {
		if (!groupId || typeof groupId !== "string") {
			throw new Error("groupId is required");
		}
		validateSerial(serial);

		const groups = await this.getDeviceGroups();
		const group = groups.find((g) => g.id === groupId);
		if (!group) throw new NotFoundError(`Group ${groupId} not found`);
		if (!group.devices.includes(serial)) return;

		const accountId = await this.resolveAccountId();
		const session = await this.ensureSession();
		const newDevices = group.devices.filter((d) => d !== serial);
		const path = `documents/accounts/${encodeURIComponent(accountId)}/deviceGroups/${encodeURIComponent(groupId)}?updateMask.fieldPaths=devices`;
		const body = {
			fields: {
				devices: {
					arrayValue: {
						values: newDevices.map((d) => ({ stringValue: d })),
					},
				},
			},
		};
		const response = await session.request("PATCH", path, body);
		await response.text().catch(() => {});
	}

	// ─── Fan Controller ──────────────────────────────────────────────────────────

	/** Get the current fan/blower controller state for a device. Returns `null` if the device has no fan. */
	async getFanState(serial: string): Promise<FanSettings | null> {
		const device = await this.getDevice(serial);
		return device.fan;
	}

	/** Set the fan controller target temperature. */
	async setFanTarget(serial: string, targetTemp: number): Promise<ActionResult> {
		validateSerial(serial);
		if (!Number.isFinite(targetTemp)) {
			throw new Error("targetTemp must be a finite number");
		}
		return this.callAction("deviceStateUpdate", {
			deviceId: serial,
			fan: { setTemp: targetTemp },
		});
	}

	/** Enable or disable the fan controller connection. */
	async setFanEnabled(serial: string, enabled: boolean): Promise<ActionResult> {
		validateSerial(serial);
		return this.callAction("deviceStateUpdate", {
			deviceId: serial,
			fan: { connection: enabled },
		});
	}

	/**
	 * @deprecated Use the top-level methods `startSession`, `endSession`,
	 * `clearSession`, `resetMinMax`, and `clearEvents` instead.
	 */
	readonly actions = {
		startSession: (serial: string, label?: string): Promise<ActionResult> =>
			this.startSession(serial, label),
		endSession: (serial: string): Promise<ActionResult> => this.endSession(serial),
		clearSession: (serial: string): Promise<ActionResult> => this.clearSession(serial),
		resetMinMax: (serial: string, channel: number): Promise<ActionResult> =>
			this.resetMinMax(serial, channel),
		clearEvents: (serial: string): Promise<ActionResult> => this.clearEvents(serial),
	};

	/**
	 * Subscribe to real-time channel updates for a device via polling.
	 *
	 * Immediately fetches the current state, then polls at the configured
	 * interval. The callback is only invoked when a channel's value, units,
	 * or status actually changes (deduplication).
	 *
	 * @example
	 * ```ts
	 * const sub = client.subscribe("ABC123", (update) => {
	 *   console.log(`Ch${update.channel}: ${update.value}°${update.units}`);
	 * }, { intervalMs: 5000, onError: console.error });
	 *
	 * // Later: stop polling
	 * sub.unsubscribe();
	 * ```
	 */
	subscribe(
		serial: string,
		callback: ChannelUpdateCallback,
		options?: SubscriptionOptions & { onError?: ErrorCallback },
	): Subscription {
		if (this.closed) {
			throw new Error("Client is closed");
		}
		validateSerial(serial);
		const sub = createSubscription(serial, (s) => this.getAllDeviceChannels(s), callback, options);
		const tracked: Subscription = {
			unsubscribe: () => {
				sub.unsubscribe();
				this.activeSubscriptions.delete(tracked);
			},
		};
		this.activeSubscriptions.add(tracked);
		return tracked;
	}

	/** Close the client and release resources. Stops all active subscriptions. */
	close(): void {
		this.closed = true;
		for (const sub of this.activeSubscriptions) sub.unsubscribe();
		this.activeSubscriptions.clear();
		this.session?.close();
		this.session = null;
		this.sessionPromise = null;
		this.cachedAccountId = null;
	}

	private async ensureSession(): Promise<AuthSession> {
		if (this.closed) {
			throw new Error("Client is closed");
		}
		if (this.session) return this.session;
		if (!this.sessionPromise) {
			this.sessionPromise = createAuthSession({
				email: this.config.email,
				password: this.config.password,
				apiKey: this.config.apiKey,
				appId: this.config.appId,
				tokenCachePath: this.config.tokenCachePath,
				retry: this.config.retry,
			})
				.then((s) => {
					if (this.closed) {
						s.close();
						return s;
					}
					this.session = s;
					return s;
				})
				.catch((err) => {
					this.sessionPromise = null;
					throw err;
				});
		}
		return this.sessionPromise;
	}

	private async resolveAccountId(): Promise<string> {
		if (this.cachedAccountId) return this.cachedAccountId;
		const user = await this.getUser();
		if (!user.accountId) {
			throw new NotFoundError("User has no associated account");
		}
		this.cachedAccountId = user.accountId;
		return this.cachedAccountId;
	}

	/** Fetch a Firestore document and return its fields, or throw NotFoundError. */
	private async fetchDocFields(path: string, notFoundMsg: string): Promise<FirestoreFields> {
		const session = await this.ensureSession();
		const response = await session.request("GET", path);
		if (response.status === 404) {
			await response.text().catch(() => {});
			throw new NotFoundError(notFoundMsg);
		}
		const doc = (await response.json()) as { fields?: FirestoreFields };
		return doc.fields ?? {};
	}

	/** Call a Cloud Function and return the result as an ActionResult. */
	private async callAction(
		functionName: string,
		data: Record<string, unknown>,
	): Promise<ActionResult> {
		const session = await this.ensureSession();
		const result = await session.callFunction(functionName, data);
		return toActionResult(result);
	}
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
		type: sanitizeLabel(getString(fields, "type")),
		device: getString(fields, "device"),
		status: sanitizeLabel(getString(fields, "status")),
		battery: getNumber(fields, "battery"),
		batteryState: getString(fields, "battery_state") ?? getString(fields, "batteryState"),
		wifiStrength: getNumber(fields, "wifi_stength") ?? getNumber(fields, "wifiStrength"),
		firmware: sanitizeLabel(getString(fields, "firmware")),
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
		sessionLabel: sanitizeLabel(getString(fields, "sessionLabel")),
		lastArchive: getTimestamp(fields, "lastArchive"),
		lastPurged: getTimestamp(fields, "lastPurged"),
		assignedToAccountOn: getTimestamp(fields, "assignedToAccountOn"),
		accountId: getString(fields, "accountId"),
		notes: sanitizeLabel(getString(fields, "notes")),
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
		status: sanitizeLabel(getString(fields, "status")),
		type: sanitizeLabel(getString(fields, "type")),
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

function toArray(value: string | string[] | undefined): string[] | undefined {
	if (value === undefined) return undefined;
	return Array.isArray(value) ? value : [value];
}

function applyDeviceFilter(devices: Device[], filter: DeviceFilter): Device[] {
	const serials = toArray(filter.serial);
	const types = toArray(filter.type);
	const labels = toArray(filter.label);
	const statuses = toArray(filter.status);
	const now = Date.now();

	return devices.filter((device) => {
		if (serials && !serials.includes(device.serial)) return false;
		if (types && (!device.type || !types.includes(device.type))) return false;
		if (labels && (!device.label || !labels.includes(device.label))) return false;
		if (statuses && (!device.status || !statuses.includes(device.status))) return false;
		if (filter.activeWithinMinutes != null) {
			if (!device.lastSeen) return false;
			const ageMs = now - device.lastSeen.getTime();
			if (ageMs > filter.activeWithinMinutes * 60_000) return false;
		}
		return true;
	});
}

function extractDocId(name: string | undefined): string {
	if (!name) return "";
	const parts = name.split("/");
	return parts[parts.length - 1] ?? "";
}

function parseStringBooleanMap(fields: FirestoreFields | null): Record<string, boolean> | null {
	if (!fields) return null;
	const result: Record<string, boolean> = {};
	for (const [key, value] of Object.entries(fields)) {
		if ("booleanValue" in value) {
			result[key] = value.booleanValue;
		}
	}
	return Object.keys(result).length > 0 ? result : null;
}

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

function parseDeviceEvent(fields: FirestoreFields, id: string): DeviceEvent {
	return {
		id,
		eventType: getString(fields, "EventType") ?? getString(fields, "eventType") ?? "",
		severity: getNumber(fields, "Severity") ?? getNumber(fields, "severity") ?? 0,
		eventTime:
			getTimestamp(fields, "EventTime") ??
			getTimestamp(fields, "eventTime") ??
			getTimestampFromInt(fields, "EventTime") ??
			getTimestampFromInt(fields, "eventTime") ??
			new Date(0),
		deviceId: getString(fields, "deviceId") ?? "",
		channelId: getString(fields, "channelId"),
		accountId: getString(fields, "accountId") ?? "",
		valueBefore: getString(fields, "ValueBefore") ?? getString(fields, "valueBefore"),
		valueAfter: getString(fields, "ValueAfter") ?? getString(fields, "valueAfter"),
		groups: getStringArray(fields, "groups"),
	};
}

/** Try to parse a timestamp stored as integerValue (epoch millis or seconds). */
function getTimestampFromInt(fields: FirestoreFields, key: string): Date | null {
	const n = getNumber(fields, key);
	if (n == null || n < 0) return null;
	// 1e12 ms ≈ Sep 2001; legitimate epoch-second timestamps stay below 1e10 until ~2286
	const ms = n < 1e12 ? n * 1000 : n;
	const date = new Date(ms);
	return Number.isNaN(date.getTime()) ? null : date;
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
		type: sanitizeLabel(getString(fields, "type")),
		label: sanitizeLabel(getString(fields, "label")),
		deviceLabel: sanitizeLabel(getString(fields, "deviceLabel")),
		notes: sanitizeLabel(getString(fields, "notes")),
		createdOn: getTimestamp(fields, "createdOn"),
		public: getBoolean(fields, "public"),
		publicLink: getString(fields, "publicLink"),
		filename: getString(fields, "filename"),
		channels,
	};
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
		label: sanitizeLabel(getString(fields, "label")),
		units: getString(fields, "units"),
		value: getNumber(fields, "value"),
		status: sanitizeLabel(getString(fields, "status")),
		enabled: getBoolean(fields, "enabled"),
		color: getString(fields, "color"),
		type: sanitizeLabel(getString(fields, "type")),
		alarmHigh: parseAlarm(getMapFields(fields, "alarmHigh")),
		alarmLow: parseAlarm(getMapFields(fields, "alarmLow")),
		minimum: parseMinMaxReading(getMapFields(fields, "minimum")),
		maximum: parseMinMaxReading(getMapFields(fields, "maximum")),
		recentReadings,
	};
}

function parseCalibrationRecord(fields: FirestoreFields, id: string): CalibrationRecord {
	const lowPoints = getArray(fields, "lowPointAdjustments");
	const highPoints = getArray(fields, "highPointReference");

	return {
		calibrationId: id,
		calibrationDate: getTimestamp(fields, "calibrationDate"),
		deviceId: getString(fields, "deviceId") ?? "",
		sessionId: getString(fields, "sessionId"),
		performedBy: getString(fields, "performedBy"),
		manager: getString(fields, "manager"),
		referenceDetail: getString(fields, "referenceDetail"),
		statedAccuracy: getString(fields, "statedAccuracy"),
		ambientTemperature: getString(fields, "ambientTemperature"),
		ambientHumidity: getString(fields, "ambientHumidity"),
		result: getString(fields, "result"),
		lowPointAdjustments: parseCalibrationPoints(lowPoints),
		highPointReference: parseCalibrationPoints(highPoints),
	};
}

function parseCalibrationPoints(values: FirestoreValue[] | null): CalibrationPoint[] {
	if (!values) return [];
	const points: CalibrationPoint[] = [];
	for (const item of values) {
		if ("mapValue" in item && item.mapValue.fields) {
			const f = item.mapValue.fields;
			points.push({
				channel: getNumber(f, "channel") ?? 0,
				value: getNumber(f, "value") ?? 0,
				units: getString(f, "units") ?? "",
				referenceValue: getNumber(f, "referenceValue") ?? 0,
				deviation: getNumber(f, "deviation") ?? 0,
				trimValue: getNumber(f, "trimValue"),
				result: getString(f, "result") ?? "",
			});
		}
	}
	return points;
}

function toActionResult(result: unknown): ActionResult {
	const data = result as {
		success?: boolean;
		error?: string;
		status?: string;
		message?: string;
	} | null;
	if (data && typeof data === "object") {
		// Detect error envelope: { status: "error", message: "..." }
		if (data.status === "error" || data.error) {
			return {
				success: false,
				data: null,
				error: data.error ?? data.message ?? "Action failed",
			};
		}
		return {
			success: data.success !== false,
			data: data,
			error: null,
		};
	}
	return { success: true, data: result ?? null, error: null };
}

function toShareResult(result: unknown): ShareResult {
	const data = result as {
		success?: boolean;
		publicLink?: string;
		error?: string;
		status?: string;
		message?: string;
	} | null;
	if (data && typeof data === "object") {
		if (data.status === "error" || data.error) {
			return { success: false };
		}
		return {
			success: data.success !== false,
			publicLink: data.publicLink ?? undefined,
		};
	}
	return { success: true };
}

function parseDeviceHistory(serial: string, result: unknown): DeviceHistory {
	const readings: HistoricalReading[] = [];
	if (result && typeof result === "object" && "readings" in result) {
		const raw = (result as { readings?: unknown }).readings;
		if (Array.isArray(raw)) {
			for (const entry of raw) {
				if (entry && typeof entry === "object") {
					const r = entry as { v?: string; ts?: string; u?: string };
					const value = r.v != null ? Number(r.v) : Number.NaN;
					if (!Number.isNaN(value) && r.ts && r.u) {
						readings.push({ value, timestamp: r.ts, units: r.u });
					}
				}
			}
		}
	}
	return { deviceId: serial, readings };
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

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

function formatBytes(bytes: number): string {
	if (bytes <= 0 || !Number.isFinite(bytes)) return "0 B";
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
	const value = bytes / 1024 ** exponent;
	const formatted = exponent === 0 ? value.toString() : value.toFixed(2);
	return `${formatted} ${BYTE_UNITS[exponent]}`;
}
