/** Configuration for automatic retry with exponential backoff. */
export interface RetryConfig {
	/** Maximum number of retry attempts (default 3). */
	maxRetries?: number;
	/** Base delay in milliseconds before exponential increase (default 1000). */
	baseDelayMs?: number;
	/** Maximum delay in milliseconds between retries (default 30000). */
	maxDelayMs?: number;
}

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
	/** Retry configuration for transient failures (429, 503, network errors). */
	retry?: RetryConfig;
}

// ─── Device ──────────────────────────────────────────────────────────────────

/** A ThermoWorks device (Node, Smoke, Signals, RFX Gateway, etc). */
export interface Device {
	readonly serial: string;
	readonly deviceId: string | null;
	readonly label: string | null;
	readonly type: string | null;
	readonly device: string | null;
	readonly status: string | null;
	readonly battery: number | null;
	readonly batteryState: string | null;
	readonly wifiStrength: number | null;
	readonly firmware: string | null;
	readonly color: string | null;
	readonly thumbnail: string | null;
	readonly deviceDisplayUnits: string | null;
	readonly iotDeviceId: string | null;
	readonly iotCoreDeviceBlocked: boolean | null;
	readonly recordingIntervalInSeconds: number | null;
	readonly transmitIntervalInSeconds: number | null;
	readonly readInterval: number | null;
	readonly heartbeatInterval: number | null;
	readonly temperatureDeltaTrigger: number | null;
	readonly pendingLoad: boolean | null;
	readonly batteryAlertSent: boolean | null;
	readonly lastSeen: Date | null;
	readonly lastTelemetrySaved: Date | null;
	readonly latestReading: Date | null;
	readonly lastWifiConnection: Date | null;
	readonly lastBluetoothConnection: Date | null;
	readonly sessionStart: Date | null;
	readonly sessionLabel: string | null;
	readonly lastArchive: Date | null;
	readonly lastPurged: Date | null;
	readonly assignedToAccountOn: Date | null;
	readonly accountId: string | null;
	readonly notes: string | null;
	readonly public: boolean | null;
	readonly publicLink: string | null;
	readonly searModeEnabled: boolean | null;
	readonly showSensorChannels: boolean | null;
	readonly ringColors: string[] | null;
	readonly gateway: GatewayInfo | null;
	readonly fan: FanSettings | null;
	readonly bigQuery: BigQueryRef | null;
}

/** Gateway connection info for RFX wireless devices. */
export interface GatewayInfo {
	readonly gatewayId: string | null;
	readonly rssi: number | null;
	readonly lastSeen: Date | null;
	readonly switchedAt: Date | null;
	readonly lastPacketId: number | null;
}

/** BBQ fan/blower controller settings. */
export interface FanSettings {
	readonly connected: boolean;
	readonly connection: boolean;
	readonly setTemp: number | null;
	readonly fanChannel: string | null;
	readonly state: number | null;
}

/** Reference to historical data in BigQuery. */
export interface BigQueryRef {
	readonly datasetId: string;
	readonly tableId: string;
}

// ─── Channel ─────────────────────────────────────────────────────────────────

/** A channel reading from a device (temperature or humidity sensor). */
export interface DeviceChannel {
	readonly value: number | null;
	readonly units: string | null;
	readonly label: string | null;
	readonly status: string | null;
	readonly type: string | null;
	readonly number: string | null;
	readonly enabled: boolean | null;
	readonly color: string | null;
	readonly lastSeen: Date | null;
	readonly lastTelemetrySaved: Date | null;
	readonly lastEventId: string | null;
	readonly showAvgTemp: boolean | null;
	readonly estimatedAlarmStatus: string | null;
	readonly rateOfChange: number | null;
	readonly rateOfChangeUnit: string | null;
	readonly alarmHigh: Alarm | null;
	readonly alarmLow: Alarm | null;
	readonly minimum: MinMaxReading | null;
	readonly maximum: MinMaxReading | null;
}

/** An alarm threshold on a device channel. */
export interface Alarm {
	readonly enabled: boolean;
	readonly alarming: boolean;
	readonly muted: boolean | null;
	readonly value: number | null;
	readonly units: string | null;
	readonly lastNotified: Date | null;
}

/** A minimum or maximum reading record. */
export interface MinMaxReading {
	readonly value: number | null;
	readonly units: string | null;
	readonly date: Date | null;
}

// ─── User ────────────────────────────────────────────────────────────────────

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
	readonly appVersion: string | null;
	readonly accountRoles: Record<string, boolean> | null;
	readonly roles: Record<string, boolean> | null;
	readonly notificationSettings: NotificationSettings | null;
}

/** User notification preferences. */
export interface NotificationSettings {
	readonly enabled: boolean;
	readonly continuousAlerts: boolean;
	readonly emailNotification: boolean;
	readonly smsNotification: boolean;
	readonly deviceNotification: boolean;
}

// ─── Account ─────────────────────────────────────────────────────────────────

/** Account metadata. */
export interface Account {
	readonly accountId: string;
	readonly name: string | null;
	readonly type: string | null;
	readonly createdOn: Date | null;
	readonly exportVersion: number | null;
}

// ─── Events ──────────────────────────────────────────────────────────────────

/** A device event (alarm, status change, alert). */
export interface DeviceEvent {
	readonly id: string;
	readonly eventType: string;
	readonly severity: number;
	readonly eventTime: Date;
	readonly deviceId: string;
	readonly channelId: string | null;
	readonly accountId: string;
	readonly valueBefore: string | null;
	readonly valueAfter: string | null;
	readonly groups: string[] | null;
}

/** Options for filtering events. */
export interface EventFilter {
	/** Filter by device serial. */
	deviceId?: string;
	/** Filter by event type (e.g., "Low Battery Alert"). */
	eventType?: string;
	/** Maximum number of events to return (default 50). */
	limit?: number;
}

// ─── Archives ────────────────────────────────────────────────────────────────

/** A historical session archive. */
export interface Archive {
	readonly id: string;
	readonly start: Date | null;
	readonly end: Date | null;
	readonly count: number | null;
	readonly type: string | null;
	readonly label: string | null;
	readonly deviceLabel: string | null;
	readonly notes: string | null;
	readonly createdOn: Date | null;
	readonly public: boolean | null;
	readonly publicLink: string | null;
	readonly filename: string | null;
	readonly channels: ArchiveChannel[] | null;
}

/** A channel snapshot within an archive. */
export interface ArchiveChannel {
	readonly number: string | null;
	readonly label: string | null;
	readonly units: string | null;
	readonly value: number | null;
	readonly status: string | null;
	readonly enabled: boolean | null;
	readonly color: string | null;
	readonly type: string | null;
	readonly alarmHigh: Alarm | null;
	readonly alarmLow: Alarm | null;
	readonly minimum: MinMaxReading | null;
	readonly maximum: MinMaxReading | null;
	readonly recentReadings: TemperatureReading[];
}

/** A single temperature reading from an archive. */
export interface TemperatureReading {
	readonly value: number;
	readonly timestamp: Date;
	readonly units: string;
}

/** Options for listing archives. */
export interface ArchiveListOptions {
	/** Maximum number of archives to return (default 20). */
	limit?: number;
	/** Cursor for pagination (archive document ID to start after). */
	startAfter?: string;
}

// ─── Calibration ─────────────────────────────────────────────────────────────

/** A factory calibration record. */
export interface CalibrationRecord {
	readonly calibrationId: string;
	readonly calibrationDate: Date | null;
	readonly deviceId: string;
	readonly sessionId: string | null;
	readonly performedBy: string | null;
	readonly manager: string | null;
	readonly referenceDetail: string | null;
	readonly statedAccuracy: string | null;
	readonly ambientTemperature: string | null;
	readonly ambientHumidity: string | null;
	readonly result: string | null;
	readonly lowPointAdjustments: CalibrationPoint[];
	readonly highPointReference: CalibrationPoint[];
}

/** A single calibration measurement point. */
export interface CalibrationPoint {
	readonly channel: number;
	readonly value: number;
	readonly units: string;
	readonly referenceValue: number;
	readonly deviation: number;
	readonly trimValue: number | null;
	readonly result: string;
}

// ─── Firmware ────────────────────────────────────────────────────────────────

/** Firmware information for a device type. */
export interface FirmwareInfo {
	readonly name: string;
	readonly version: string;
	readonly location: string;
	readonly md5: string;
}

// ─── Content ─────────────────────────────────────────────────────────────────

/** Cooking temperature guide. */
export interface TemperatureGuide {
	readonly categories: TemperatureCategory[];
}

/** A category in the temperature guide (e.g., Beef, Pork). */
export interface TemperatureCategory {
	readonly label: string;
	readonly icon: string;
	readonly pullWarning: string | null;
	readonly warning: string | null;
}

// ─── Search ──────────────────────────────────────────────────────────────────

/** Search result from Typesense. */
export interface SearchResult {
	readonly hits: SearchHit[];
	readonly totalHits: number;
	readonly page: number;
}

/** A single search hit. */
export interface SearchHit {
	readonly id: string;
	readonly score: number;
	readonly document: Record<string, unknown>;
}

/** Options for search queries. */
export interface SearchOptions {
	/** Search collection: "device", "accounts", or "users". */
	collection: "device" | "accounts" | "users";
	/** Page number (1-indexed). */
	page?: number;
	/** Results per page. */
	pageSize?: number;
}

// ─── Actions (Callable Functions) ────────────────────────────────────────────

/** Result from a callable function invocation. */
export interface ActionResult<T = unknown> {
	readonly success: boolean;
	readonly data: T | null;
	readonly error: string | null;
}

// ─── Filters ─────────────────────────────────────────────────────────────────

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
