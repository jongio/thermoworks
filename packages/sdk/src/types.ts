/** Configuration for the ThermoWorks Cloud client. */
export interface ThermoworksConfig {
	/** ThermoWorks Cloud account email address. */
	email: string;
	/** ThermoWorks Cloud account password. */
	password: string;
	/** Override the default Firebase API key. */
	apiKey?: string;
	/** Override the default Firebase app ID. */
	appId?: string;
}

/** A ThermoWorks device (Node, Smoke, Signals, etc). */
export interface Device {
	readonly serial: string;
	readonly deviceId: string | null;
	readonly label: string | null;
	readonly type: string | null;
	readonly status: string | null;
	readonly battery: number | null;
	readonly batteryState: string | null;
	readonly wifiStrength: number | null;
	readonly firmware: string | null;
	readonly color: string | null;
	readonly thumbnail: string | null;
	readonly deviceDisplayUnits: string | null;
	readonly iotDeviceId: string | null;
	readonly recordingIntervalInSeconds: number | null;
	readonly transmitIntervalInSeconds: number | null;
	readonly pendingLoad: boolean | null;
	readonly batteryAlertSent: boolean | null;
	readonly lastSeen: Date | null;
	readonly lastTelemetrySaved: Date | null;
	readonly lastWifiConnection: Date | null;
	readonly lastBluetoothConnection: Date | null;
	readonly sessionStart: Date | null;
	readonly accountId: string | null;
}

/** A channel reading from a device (temperature or humidity sensor). */
export interface DeviceChannel {
	readonly value: number | null;
	readonly units: string | null;
	readonly label: string | null;
	readonly status: string | null;
	readonly type: string | null;
	readonly number: string | null;
	readonly lastSeen: Date | null;
	readonly lastTelemetrySaved: Date | null;
	readonly showAvgTemp: boolean | null;
	readonly alarmHigh: Alarm | null;
	readonly alarmLow: Alarm | null;
	readonly minimum: MinMaxReading | null;
	readonly maximum: MinMaxReading | null;
}

/** An alarm threshold on a device channel. */
export interface Alarm {
	readonly enabled: boolean;
	readonly alarming: boolean;
	readonly value: number | null;
	readonly units: string | null;
}

/** A minimum or maximum reading record. */
export interface MinMaxReading {
	readonly value: number | null;
	readonly units: string | null;
	readonly date: Date | null;
}

/** User account information. */
export interface User {
	readonly userId: string;
	readonly accountId: string | null;
	readonly email: string | null;
	readonly displayName: string | null;
	readonly timeZone: string | null;
	readonly preferredUnits: string | null;
	readonly locale: string | null;
	readonly photoUrl: string | null;
	readonly use24Time: boolean | null;
	readonly lastLogin: Date | null;
}

/** Options for filtering devices. */
export interface DeviceFilter {
	/** Filter by device serial number(s). */
	serial?: string | string[];
	/** Filter by device type (e.g., "node", "smoke", "signals"). */
	type?: string | string[];
	/** Filter by device label (exact match). */
	label?: string | string[];
	/** Filter by device status (e.g., "online", "offline"). */
	status?: string | string[];
	/** Only include devices seen within this many minutes. */
	activeWithinMinutes?: number;
}

/** Error thrown when authentication fails. */
export class AuthError extends Error {
	readonly reason: string;

	constructor(message: string, reason: string) {
		super(message);
		this.name = "AuthError";
		this.reason = reason;
	}
}

/** Error thrown when a requested resource is not found. */
export class NotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NotFoundError";
	}
}

/** Error thrown on network/HTTP failures. */
export class NetworkError extends Error {
	readonly statusCode: number | null;

	constructor(message: string, statusCode: number | null = null) {
		super(message);
		this.name = "NetworkError";
		this.statusCode = statusCode;
	}
}
