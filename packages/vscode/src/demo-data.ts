/**
 * Fake but realistic data for demo/screenshot mode.
 * Inspired by real ThermoWorks device types but uses no real user information.
 */
import type {
	Alarm,
	Archive,
	ArchiveChannel,
	Device,
	DeviceChannel,
	TemperatureReading,
	User,
} from "thermoworks-sdk";
import type { ChartPayload, ChartPoint, ChartSeries } from "./chart-protocol";

/** Simulated latest firmware versions per device type. */
export const DEMO_LATEST_FIRMWARE: Record<string, string> = {
	signals: "2.4.1",
	smoke: "1.8.3", // Easter Brisket has 1.5.0 → outdated
	node: "3.1.0",
};

export const DEMO_USER: User = {
	userId: "demo-user-001",
	accountId: "demo-account-001",
	email: "pitmaster@example.com",
	displayName: "Demo User",
	timeZone: "America/Denver",
	preferredUnits: "F",
	locale: "en-US",
	photoUrl: null,
	use24Time: false,
	lastLogin: new Date(),
	appVersion: "3.5.0",
	accountRoles: { owner: true },
	roles: { admin: true },
	notificationSettings: {
		enabled: true,
		continuousAlerts: true,
		emailNotification: true,
		smsNotification: false,
		deviceNotification: true,
	},
};

const now = new Date();
const fiveMinAgo = new Date(now.getTime() - 5 * 60_000);
const tenMinAgo = new Date(now.getTime() - 10 * 60_000);
const twoHoursAgo = new Date(now.getTime() - 2 * 3600_000);

export const DEMO_DEVICES: Device[] = [
	{
		serial: "DEMO-SIGNALS-4CH",
		deviceId: "signals-001",
		label: "Backyard Smoker",
		type: "signals",
		device: "Signals 4-Channel",
		status: "online",
		battery: 87,
		batteryState: "normal",
		wifiStrength: -42,
		firmware: "2.4.1",
		color: "#FF6B35",
		thumbnail: null,
		deviceDisplayUnits: "F",
		iotDeviceId: "iot-signals-001",
		iotCoreDeviceBlocked: false,
		recordingIntervalInSeconds: 2,
		transmitIntervalInSeconds: 10,
		readInterval: 2,
		heartbeatInterval: 60,
		temperatureDeltaTrigger: 1,
		pendingLoad: false,
		batteryAlertSent: false,
		lastSeen: fiveMinAgo,
		lastTelemetrySaved: fiveMinAgo,
		latestReading: fiveMinAgo,
		lastWifiConnection: fiveMinAgo,
		lastBluetoothConnection: null,
		sessionStart: twoHoursAgo,
		sessionLabel: "Sunday Brisket",
		lastArchive: null,
		lastPurged: null,
		assignedToAccountOn: new Date("2024-03-15"),
		accountId: "demo-account-001",
		notes: null,
		public: false,
		publicLink: null,
		searModeEnabled: false,
		showSensorChannels: true,
		ringColors: ["#FF6B35", "#4ECDC4", "#FFE66D", "#95E1D3"],
		gateway: null,
		fan: null,
		bigQuery: null,
	},
	{
		serial: "DEMO-SMOKE-2CH",
		deviceId: "smoke-001",
		label: "Easter Brisket",
		type: "smoke",
		device: "Smoke 2-Channel",
		status: "online",
		battery: 62,
		batteryState: "normal",
		wifiStrength: -55,
		firmware: "1.5.0",
		color: "#4ECDC4",
		thumbnail: null,
		deviceDisplayUnits: "F",
		iotDeviceId: "iot-smoke-001",
		iotCoreDeviceBlocked: false,
		recordingIntervalInSeconds: 3,
		transmitIntervalInSeconds: 15,
		readInterval: 3,
		heartbeatInterval: 60,
		temperatureDeltaTrigger: 1,
		pendingLoad: false,
		batteryAlertSent: false,
		lastSeen: tenMinAgo,
		lastTelemetrySaved: tenMinAgo,
		latestReading: tenMinAgo,
		lastWifiConnection: tenMinAgo,
		lastBluetoothConnection: null,
		sessionStart: twoHoursAgo,
		sessionLabel: "Easter Brisket",
		lastArchive: null,
		lastPurged: null,
		assignedToAccountOn: new Date("2023-11-20"),
		accountId: "demo-account-001",
		notes: null,
		public: false,
		publicLink: null,
		searModeEnabled: false,
		showSensorChannels: true,
		ringColors: ["#4ECDC4", "#FFE66D"],
		gateway: null,
		fan: null,
		bigQuery: null,
	},
	{
		serial: "DEMO-NODE-1CH",
		deviceId: "node-001",
		label: "Garage Fridge",
		type: "node",
		device: "ThermoWorks Node",
		status: "online",
		battery: 94,
		batteryState: "normal",
		wifiStrength: -38,
		firmware: "3.1.0",
		color: "#6C5CE7",
		thumbnail: null,
		deviceDisplayUnits: "F",
		iotDeviceId: "iot-node-001",
		iotCoreDeviceBlocked: false,
		recordingIntervalInSeconds: 30,
		transmitIntervalInSeconds: 60,
		readInterval: 30,
		heartbeatInterval: 300,
		temperatureDeltaTrigger: 2,
		pendingLoad: false,
		batteryAlertSent: false,
		lastSeen: fiveMinAgo,
		lastTelemetrySaved: fiveMinAgo,
		latestReading: fiveMinAgo,
		lastWifiConnection: fiveMinAgo,
		lastBluetoothConnection: null,
		sessionStart: null,
		sessionLabel: null,
		lastArchive: null,
		lastPurged: null,
		assignedToAccountOn: new Date("2024-06-01"),
		accountId: "demo-account-001",
		notes: "Monitoring garage fridge temp",
		public: false,
		publicLink: null,
		searModeEnabled: false,
		showSensorChannels: false,
		ringColors: null,
		gateway: null,
		fan: null,
		bigQuery: null,
	},
];

function makeChannel(
	overrides: Partial<DeviceChannel> & { value: number; units: string; label: string },
): DeviceChannel {
	return {
		value: overrides.value,
		units: overrides.units,
		label: overrides.label,
		status: "normal",
		type: "temperature",
		number: overrides.number ?? "1",
		enabled: true,
		color: overrides.color ?? null,
		lastSeen: fiveMinAgo,
		lastTelemetrySaved: fiveMinAgo,
		lastEventId: null,
		showAvgTemp: false,
		estimatedAlarmStatus: overrides.estimatedAlarmStatus ?? null,
		rateOfChange: overrides.rateOfChange ?? null,
		rateOfChangeUnit: overrides.rateOfChangeUnit ?? null,
		alarmHigh: overrides.alarmHigh ?? null,
		alarmLow: overrides.alarmLow ?? null,
		minimum: overrides.minimum ?? null,
		maximum: overrides.maximum ?? null,
	};
}

type DemoMode = "normal" | "high" | "low";

export function getDemoChannels(serial: string, mode: DemoMode): DeviceChannel[] {
	switch (serial) {
		case "DEMO-SIGNALS-4CH":
			return [
				makeChannel({
					label: "Pit",
					value: mode === "high" ? 285 : mode === "low" ? 180 : 225,
					units: "F",
					number: "1",
					color: "#FF6B35",
					alarmHigh:
						mode === "high"
							? {
									enabled: true,
									alarming: true,
									muted: false,
									value: 275,
									units: "F",
									lastNotified: now,
								}
							: {
									enabled: true,
									alarming: false,
									muted: false,
									value: 275,
									units: "F",
									lastNotified: null,
								},
					alarmLow:
						mode === "low"
							? {
									enabled: true,
									alarming: true,
									muted: false,
									value: 200,
									units: "F",
									lastNotified: now,
								}
							: {
									enabled: true,
									alarming: false,
									muted: false,
									value: 200,
									units: "F",
									lastNotified: null,
								},
				}),
				makeChannel({
					label: "Brisket",
					value: mode === "high" ? 205 : mode === "low" ? 120 : 168,
					units: "F",
					number: "2",
					color: "#4ECDC4",
					alarmHigh:
						mode === "high"
							? {
									enabled: true,
									alarming: true,
									muted: false,
									value: 203,
									units: "F",
									lastNotified: now,
								}
							: {
									enabled: true,
									alarming: false,
									muted: false,
									value: 203,
									units: "F",
									lastNotified: null,
								},
					alarmLow: {
						enabled: false,
						alarming: false,
						muted: false,
						value: null,
						units: null,
						lastNotified: null,
					},
				}),
				makeChannel({
					label: "Ribs",
					value: mode === "high" ? 198 : 175,
					units: "F",
					number: "3",
					color: "#FFE66D",
					alarmHigh: {
						enabled: true,
						alarming: false,
						muted: false,
						value: 200,
						units: "F",
						lastNotified: null,
					},
					alarmLow: {
						enabled: false,
						alarming: false,
						muted: false,
						value: null,
						units: null,
						lastNotified: null,
					},
				}),
				makeChannel({
					label: "Ambient",
					value: 72,
					units: "F",
					number: "4",
					color: "#95E1D3",
					alarmHigh: {
						enabled: false,
						alarming: false,
						muted: false,
						value: null,
						units: null,
						lastNotified: null,
					},
					alarmLow: {
						enabled: false,
						alarming: false,
						muted: false,
						value: null,
						units: null,
						lastNotified: null,
					},
				}),
			];

		case "DEMO-SMOKE-2CH":
			return [
				makeChannel({
					label: "Pit",
					value: mode === "high" ? 292 : mode === "low" ? 208 : 250,
					units: "F",
					number: "1",
					color: "#4ECDC4",
					alarmHigh:
						mode === "high"
							? {
									enabled: true,
									alarming: true,
									muted: false,
									value: 285,
									units: "F",
									lastNotified: now,
								}
							: {
									enabled: true,
									alarming: false,
									muted: false,
									value: 285,
									units: "F",
									lastNotified: null,
								},
					alarmLow:
						mode === "low"
							? {
									enabled: true,
									alarming: true,
									muted: false,
									value: 220,
									units: "F",
									lastNotified: now,
								}
							: {
									enabled: true,
									alarming: false,
									muted: false,
									value: 220,
									units: "F",
									lastNotified: null,
								},
				}),
				makeChannel({
					label: "Brisket",
					value: mode === "high" ? 207 : 168,
					units: "F",
					number: "2",
					color: "#FFE66D",
					alarmHigh:
						mode === "high"
							? {
									enabled: true,
									alarming: true,
									muted: false,
									value: 203,
									units: "F",
									lastNotified: now,
								}
							: {
									enabled: true,
									alarming: false,
									muted: false,
									value: 203,
									units: "F",
									lastNotified: null,
								},
					alarmLow: {
						enabled: false,
						alarming: false,
						muted: false,
						value: null,
						units: null,
						lastNotified: null,
					},
				}),
			];

		case "DEMO-NODE-1CH":
			return [
				makeChannel({
					label: "Internal",
					value: mode === "low" ? 28 : 38,
					units: "F",
					number: "1",
					color: "#6C5CE7",
					alarmHigh: {
						enabled: true,
						alarming: false,
						muted: false,
						value: 45,
						units: "F",
						lastNotified: null,
					},
					alarmLow:
						mode === "low"
							? {
									enabled: true,
									alarming: true,
									muted: false,
									value: 32,
									units: "F",
									lastNotified: now,
								}
							: {
									enabled: true,
									alarming: false,
									muted: false,
									value: 32,
									units: "F",
									lastNotified: null,
								},
				}),
			];

		default:
			return [];
	}
}

// ─── Demo sessions, archives + chart data ────────────────────────────────────

interface DemoChannelSpec {
	id: string;
	label: string;
	color: string;
	from: number;
	to: number;
	units?: string;
	high?: number;
	low?: number;
	wobble?: number;
}

interface DemoSessionSpec {
	label: string;
	/** How long the cook lasted, in minutes. */
	durationMin: number;
	/** How long ago the cook ended, in minutes (0 = ends "now"). */
	endedMinAgo: number;
	/** Chart reference lines (e.g. pit target or pull temperature). */
	high: number | null;
	low: number | null;
	channels: DemoChannelSpec[];
}

/** Sessions per device; the first entry is the active / most-recent cook. */
const DEMO_SESSIONS: Record<string, DemoSessionSpec[]> = {
	"DEMO-SIGNALS-4CH": [
		{
			label: "Sunday Brisket",
			durationMin: 180,
			endedMinAgo: 0,
			high: 275,
			low: 200,
			channels: [
				{
					id: "pit",
					label: "Pit",
					color: "#FF6B35",
					from: 78,
					to: 232,
					high: 275,
					low: 200,
					wobble: 4,
				},
				{
					id: "brisket",
					label: "Brisket",
					color: "#4ECDC4",
					from: 41,
					to: 168,
					high: 203,
					wobble: 1,
				},
				{ id: "ambient", label: "Ambient", color: "#95E1D3", from: 69, to: 73, wobble: 1 },
			],
		},
		{
			// Reverse-seared steak: hot grate, meat pulled at 125°F (medium-rare).
			label: "Grilled Steak",
			durationMin: 24,
			endedMinAgo: 2 * 24 * 60,
			high: 125,
			low: null,
			channels: [
				{ id: "grill", label: "Grill", color: "#FF6B35", from: 455, to: 515, wobble: 12 },
				{
					id: "steak",
					label: "Steak",
					color: "#E84855",
					from: 52,
					to: 125,
					high: 125,
					wobble: 0.6,
				},
			],
		},
	],
	"DEMO-SMOKE-2CH": [
		{
			label: "Easter Brisket",
			durationMin: 200,
			endedMinAgo: 0,
			high: 285,
			low: 220,
			channels: [
				{
					id: "pit",
					label: "Pit",
					color: "#4ECDC4",
					from: 84,
					to: 250,
					high: 285,
					low: 220,
					wobble: 5,
				},
				{
					id: "brisket",
					label: "Brisket",
					color: "#FFE66D",
					from: 44,
					to: 198,
					high: 203,
					wobble: 1,
				},
			],
		},
	],
	"DEMO-NODE-1CH": [
		{
			label: "Garage Fridge",
			durationMin: 180,
			endedMinAgo: 0,
			high: 45,
			low: 32,
			channels: [
				{
					id: "internal",
					label: "Internal",
					color: "#6C5CE7",
					from: 39,
					to: 37,
					high: 45,
					low: 32,
					wobble: 1,
				},
			],
		},
	],
};

const DEMO_SESSION_POINTS = 70;

/** Stable archive id for a demo session. */
function demoArchiveId(serial: string, index: number): string {
	return `demo-${serial}-${index}`;
}

interface SessionTiming {
	points: number;
	stepMs: number;
	endTime: number;
	startTime: number;
}

function sessionTiming(spec: DemoSessionSpec): SessionTiming {
	const points = DEMO_SESSION_POINTS;
	const endTime = now.getTime() - spec.endedMinAgo * 60_000;
	const durationMs = spec.durationMin * 60_000;
	return { points, stepMs: durationMs / (points - 1), endTime, startTime: endTime - durationMs };
}

/** Generate a smooth temperature curve (ease-out) ending near `spec.to`. */
function genCurve(spec: DemoChannelSpec, timing: SessionTiming): ChartPoint[] {
	const { points, stepMs, endTime } = timing;
	const result: ChartPoint[] = [];
	for (let i = 0; i < points; i++) {
		const progress = i / (points - 1);
		const eased = 1 - (1 - progress) ** 2;
		const base = spec.from + (spec.to - spec.from) * eased;
		const noise = (spec.wobble ?? 0) * Math.sin(i * 1.27);
		const y = Math.round((base + noise) * 10) / 10;
		const t = endTime - (points - 1 - i) * stepMs;
		result.push({ t, y });
	}
	return result;
}

function sessionSeries(spec: DemoSessionSpec): ChartSeries[] {
	const timing = sessionTiming(spec);
	return spec.channels.map((ch) => ({
		id: ch.id,
		label: ch.label,
		color: ch.color,
		units: ch.units ?? "F",
		points: genCurve(ch, timing),
	}));
}

/** True for synthetic demo device serials. */
export function isDemoSerial(serial: string): boolean {
	return serial.startsWith("DEMO-");
}

/** Find a demo session by archive id, or the current session when none is given. */
function findDemoSession(serial: string, archiveId?: string): DemoSessionSpec | null {
	const sessions = DEMO_SESSIONS[serial];
	if (!sessions || sessions.length === 0) return null;
	if (!archiveId) return sessions[0] ?? null;
	const idx = sessions.findIndex((_, i) => demoArchiveId(serial, i) === archiveId);
	return sessions[idx >= 0 ? idx : 0] ?? null;
}

/** Build a chart payload for a demo device's current session, or a specific past session. */
export function getDemoChartPayload(serial: string, archiveId?: string): ChartPayload | null {
	const session = findDemoSession(serial, archiveId);
	if (!session) return null;
	const device = DEMO_DEVICES.find((d) => d.serial === serial);
	return {
		deviceLabel: device?.label ?? serial,
		units: "F",
		source: "history",
		series: sessionSeries(session),
		thresholds: { high: session.high, low: session.low },
	};
}

/** The series id whose tail is animated live in a demo (current-session) chart. */
export function getDemoLiveSeriesId(serial: string): string | null {
	return DEMO_SESSIONS[serial]?.[0]?.channels[0]?.id ?? null;
}

function makeAlarm(value: number): Alarm {
	return { enabled: true, alarming: false, muted: false, value, units: "F", lastNotified: null };
}

function makeArchiveChannel(
	ch: DemoChannelSpec,
	points: ChartPoint[],
	timing: SessionTiming,
): ArchiveChannel {
	const values = points.map((p) => p.y);
	const units = ch.units ?? "F";
	const readings: TemperatureReading[] = points.map((p) => ({
		value: p.y,
		timestamp: new Date(p.t),
		units,
	}));
	return {
		number: ch.id,
		label: ch.label,
		units,
		value: values.at(-1) ?? null,
		status: "normal",
		enabled: true,
		color: ch.color,
		type: "temperature",
		alarmHigh: ch.high != null ? makeAlarm(ch.high) : null,
		alarmLow: ch.low != null ? makeAlarm(ch.low) : null,
		minimum: { value: Math.min(...values), units, date: new Date(timing.startTime) },
		maximum: { value: Math.max(...values), units, date: new Date(timing.endTime) },
		recentReadings: readings,
	};
}

function buildArchive(serial: string, index: number, spec: DemoSessionSpec): Archive {
	const device = DEMO_DEVICES.find((d) => d.serial === serial);
	const timing = sessionTiming(spec);
	return {
		id: demoArchiveId(serial, index),
		start: new Date(timing.startTime),
		end: new Date(timing.endTime),
		count: timing.points,
		type: "session",
		label: spec.label,
		deviceLabel: device?.label ?? serial,
		notes: "Synthetic demo session",
		createdOn: new Date(timing.endTime),
		public: false,
		publicLink: null,
		filename: null,
		channels: spec.channels.map((ch) => makeArchiveChannel(ch, genCurve(ch, timing), timing)),
	};
}

/** Archived sessions per demo device, available while in demo mode (newest first). */
export const DEMO_ARCHIVES: Record<string, Archive[]> = Object.fromEntries(
	Object.entries(DEMO_SESSIONS).map(([serial, sessions]) => [
		serial,
		sessions.map((spec, i) => buildArchive(serial, i, spec)),
	]),
);
