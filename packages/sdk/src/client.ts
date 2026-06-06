import { type AuthSession, createAuthSession } from "./auth.js";
import {
	type FirestoreFields,
	getBoolean,
	getMapFields,
	getNumber,
	getString,
	getTimestamp,
} from "./firestore.js";
import {
	type Alarm,
	type Device,
	type DeviceChannel,
	type DeviceFilter,
	type MinMaxReading,
	NetworkError,
	NotFoundError,
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
		};
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
		const session = await this.ensureSession();
		const response = await session.request(
			"GET",
			`documents/devices/${encodeURIComponent(serial)}`,
		);

		if (response.status === 404) {
			await response.text().catch(() => {});
			throw new NotFoundError(`Device with serial '${serial}' not found`);
		}

		const doc = (await response.json()) as { fields?: FirestoreFields };
		if (!doc.fields) {
			throw new NetworkError("Invalid response: missing fields");
		}

		return parseDevice(doc.fields);
	}

	/** Get a channel reading for a device. Channels are 1-indexed. */
	async getDeviceChannel(serial: string, channel: number): Promise<DeviceChannel> {
		validateSerial(serial);
		validateChannel(channel);
		const session = await this.ensureSession();
		const response = await session.request(
			"GET",
			`documents/devices/${encodeURIComponent(serial)}/channels/${channel}`,
		);

		if (response.status === 404) {
			await response.text().catch(() => {});
			throw new NotFoundError(`Channel ${channel} not found for device '${serial}'`);
		}

		const doc = (await response.json()) as { fields?: FirestoreFields };
		return parseDeviceChannel(doc.fields ?? {});
	}

	/**
	 * Get all channels for a device. Probes all channels 1-9, skipping any gaps.
	 */
	async getAllDeviceChannels(serial: string): Promise<DeviceChannel[]> {
		const channels: DeviceChannel[] = [];
		for (let i = 1; i <= 9; i++) {
			try {
				const channel = await this.getDeviceChannel(serial, i);
				channels.push(channel);
			} catch (error) {
				if (error instanceof NotFoundError) continue;
				throw error;
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

		const sum = temps.reduce((acc, ch) => acc + ch.value, 0);
		return {
			value: Math.round((sum / temps.length) * 10) / 10,
			units: first.units,
		};
	}

	/** Close the client and release resources. */
	close(): void {
		this.closed = true;
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
			this.sessionPromise = createAuthSession(
				this.config.email,
				this.config.password,
				this.config.apiKey,
				this.config.appId,
			)
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
}

function parseDevice(fields: FirestoreFields): Device {
	return {
		serial: getString(fields, "serial") ?? "",
		deviceId: getString(fields, "deviceId"),
		label: sanitizeLabel(getString(fields, "label")),
		type: getString(fields, "type"),
		status: getString(fields, "status"),
		battery: getNumber(fields, "battery"),
		batteryState: getString(fields, "battery_state") ?? getString(fields, "batteryState"),
		wifiStrength: getNumber(fields, "wifi_stength") ?? getNumber(fields, "wifiStrength"),
		firmware: getString(fields, "firmware"),
		color: getString(fields, "color"),
		thumbnail: getString(fields, "thumbnail"),
		deviceDisplayUnits: getString(fields, "deviceDisplayUnits"),
		iotDeviceId: getString(fields, "iotDeviceId"),
		recordingIntervalInSeconds: getNumber(fields, "recordingIntervalInSeconds"),
		transmitIntervalInSeconds: getNumber(fields, "transmitIntervalInSeconds"),
		pendingLoad: getBoolean(fields, "pendingLoad"),
		batteryAlertSent: getBoolean(fields, "batteryAlertSent"),
		lastSeen: getTimestamp(fields, "last_seen") ?? getTimestamp(fields, "lastSeen"),
		lastTelemetrySaved: getTimestamp(fields, "lastTelemetrySaved"),
		lastWifiConnection: getTimestamp(fields, "lastWifiConnection"),
		lastBluetoothConnection: getTimestamp(fields, "lastBluetoothConnection"),
		sessionStart: getTimestamp(fields, "sessionStart"),
		accountId: getString(fields, "accountId"),
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
		lastSeen: getTimestamp(fields, "last_seen") ?? getTimestamp(fields, "lastSeen"),
		lastTelemetrySaved: getTimestamp(fields, "lastTelemetrySaved"),
		showAvgTemp: getBoolean(fields, "showAvgTemp"),
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
		value: getNumber(fields, "value"),
		units: getString(fields, "units"),
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
