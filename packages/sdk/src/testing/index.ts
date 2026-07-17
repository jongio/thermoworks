import { getChannelAlarmState } from "../alarm.js";
import type {
	ActionResult,
	Alarm,
	Archive,
	ArchiveChannel,
	ArchiveListOptions,
	Device,
	DeviceChannel,
	DeviceEvent,
	DeviceFilter,
	DeviceHistory,
	FirmwareInfo,
	HistoricalReading,
	MinMaxReading,
	TemperatureReading,
	ThermoworksConfig,
} from "../types.js";
import { NotFoundError } from "../types.js";

export type FixtureDemoMode = "normal" | "high" | "low";
type FixtureDeviceType = "node" | "signals" | "smoke";
export type FixtureFirmwareState = "up-to-date" | "update-available";
type FixtureSerial = "DEMO-NODE-1CH" | "DEMO-OFFLINE-NODE" | "DEMO-SIGNALS-4CH" | "DEMO-SMOKE-2CH";

export interface FixtureFirmwareScenario {
	readonly state: FixtureFirmwareState;
	readonly deviceType: string;
	readonly installedVersion: string;
	readonly latest: FirmwareInfo;
}

export interface FakeThermoworksCloudOptions {
	readonly devices?: readonly Device[];
	readonly channels?: Readonly<Record<string, readonly DeviceChannel[]>>;
	readonly archives?: Readonly<Record<string, readonly Archive[]>>;
	readonly events?: readonly DeviceEvent[];
	readonly firmware?: Readonly<Record<string, FirmwareInfo>>;
}

const FIXTURE_ACCOUNT_ID = "demo-account-001";
const NOW = new Date("2026-06-01T12:00:00Z");
const FIVE_MIN_AGO = new Date("2026-06-01T11:55:00Z");
const TEN_MIN_AGO = new Date("2026-06-01T11:50:00Z");
const THIRTY_MIN_AGO = new Date("2026-06-01T11:30:00Z");
const TWO_HOURS_AGO = new Date("2026-06-01T10:00:00Z");
const ONE_DAY_AGO = new Date("2026-05-31T12:00:00Z");

export const FIXTURE_LATEST_FIRMWARE: Record<FixtureDeviceType, string> = {
	node: "3.1.0",
	signals: "2.4.1",
	smoke: "1.8.3",
};

export const FIXTURE_FIRMWARE: Record<FixtureDeviceType, FirmwareInfo> = {
	node: {
		name: "ThermoWorks Node",
		version: FIXTURE_LATEST_FIRMWARE.node,
		location: "https://fixtures.thermoworks.example/firmware/node-3.1.0.bin",
		md5: "7f3f5f9f9b97c6b4f2d25a31dbf8f001",
	},
	signals: {
		name: "Signals 4-Channel",
		version: FIXTURE_LATEST_FIRMWARE.signals,
		location: "https://fixtures.thermoworks.example/firmware/signals-2.4.1.bin",
		md5: "09f7e02f1290be211da707a266f153b3",
	},
	smoke: {
		name: "Smoke 2-Channel",
		version: FIXTURE_LATEST_FIRMWARE.smoke,
		location: "https://fixtures.thermoworks.example/firmware/smoke-1.8.3.bin",
		md5: "cf9bbf5167f12a4d2b0c88f3a9330004",
	},
};

export const FIXTURE_FIRMWARE_SCENARIOS: Record<FixtureFirmwareState, FixtureFirmwareScenario> = {
	"up-to-date": {
		state: "up-to-date",
		deviceType: "signals",
		installedVersion: FIXTURE_LATEST_FIRMWARE.signals,
		latest: FIXTURE_FIRMWARE.signals,
	},
	"update-available": {
		state: "update-available",
		deviceType: "smoke",
		installedVersion: "1.5.0",
		latest: FIXTURE_FIRMWARE.smoke,
	},
};

export function makeAlarm(overrides: Partial<Alarm> = {}): Alarm {
	return {
		enabled: overrides.enabled ?? true,
		alarming: overrides.alarming ?? false,
		muted: overrides.muted ?? false,
		value: overrides.value ?? null,
		units: overrides.units ?? "F",
		lastNotified: overrides.lastNotified ?? null,
	};
}

export function makeMinMaxReading(overrides: Partial<MinMaxReading> = {}): MinMaxReading {
	return {
		value: overrides.value ?? null,
		units: overrides.units ?? "F",
		date: overrides.date ?? null,
	};
}

export function makeChannel(overrides: Partial<DeviceChannel> = {}): DeviceChannel {
	return {
		value: overrides.value ?? null,
		units: overrides.units ?? "F",
		label: overrides.label ?? null,
		status: withDefault(overrides, "status", "normal"),
		type: withDefault(overrides, "type", "temperature"),
		number: withDefault(overrides, "number", "1"),
		enabled: withDefault(overrides, "enabled", true),
		color: overrides.color ?? null,
		lastSeen: withDefault(overrides, "lastSeen", FIVE_MIN_AGO),
		lastTelemetrySaved: withDefault(overrides, "lastTelemetrySaved", FIVE_MIN_AGO),
		lastEventId: overrides.lastEventId ?? null,
		showAvgTemp: overrides.showAvgTemp ?? false,
		estimatedAlarmStatus: overrides.estimatedAlarmStatus ?? null,
		rateOfChange: overrides.rateOfChange ?? null,
		rateOfChangeUnit: overrides.rateOfChangeUnit ?? null,
		alarmHigh: overrides.alarmHigh ?? null,
		alarmLow: overrides.alarmLow ?? null,
		minimum: overrides.minimum ?? null,
		maximum: overrides.maximum ?? null,
	};
}

export function makeDevice(overrides: Partial<Device> & { serial: string }): Device {
	return {
		serial: overrides.serial,
		deviceId: overrides.deviceId ?? overrides.serial.toLowerCase(),
		label: overrides.label ?? null,
		type: overrides.type ?? null,
		device: overrides.device ?? null,
		status: withDefault(overrides, "status", "online"),
		battery: overrides.battery ?? null,
		batteryState: overrides.batteryState ?? null,
		wifiStrength: overrides.wifiStrength ?? null,
		firmware: overrides.firmware ?? null,
		color: overrides.color ?? null,
		thumbnail: overrides.thumbnail ?? null,
		deviceDisplayUnits: overrides.deviceDisplayUnits ?? "F",
		iotDeviceId: overrides.iotDeviceId ?? null,
		iotCoreDeviceBlocked: withDefault(overrides, "iotCoreDeviceBlocked", false),
		recordingIntervalInSeconds: overrides.recordingIntervalInSeconds ?? null,
		transmitIntervalInSeconds: overrides.transmitIntervalInSeconds ?? null,
		readInterval: overrides.readInterval ?? null,
		heartbeatInterval: overrides.heartbeatInterval ?? null,
		temperatureDeltaTrigger: overrides.temperatureDeltaTrigger ?? null,
		pendingLoad: withDefault(overrides, "pendingLoad", false),
		batteryAlertSent: withDefault(overrides, "batteryAlertSent", false),
		lastSeen: withDefault(overrides, "lastSeen", FIVE_MIN_AGO),
		lastTelemetrySaved: withDefault(overrides, "lastTelemetrySaved", FIVE_MIN_AGO),
		latestReading: withDefault(overrides, "latestReading", FIVE_MIN_AGO),
		lastWifiConnection: withDefault(overrides, "lastWifiConnection", FIVE_MIN_AGO),
		lastBluetoothConnection: overrides.lastBluetoothConnection ?? null,
		sessionStart: overrides.sessionStart ?? null,
		sessionLabel: overrides.sessionLabel ?? null,
		lastArchive: overrides.lastArchive ?? null,
		lastPurged: overrides.lastPurged ?? null,
		assignedToAccountOn: overrides.assignedToAccountOn ?? new Date("2024-01-01T00:00:00Z"),
		accountId: overrides.accountId ?? FIXTURE_ACCOUNT_ID,
		notes: overrides.notes ?? null,
		public: withDefault(overrides, "public", false),
		publicLink: overrides.publicLink ?? null,
		searModeEnabled: withDefault(overrides, "searModeEnabled", false),
		showSensorChannels: withDefault(overrides, "showSensorChannels", true),
		ringColors: overrides.ringColors ?? null,
		gateway: overrides.gateway ?? null,
		fan: overrides.fan ?? null,
		bigQuery: overrides.bigQuery ?? null,
	};
}

export function makeArchiveChannel(overrides: Partial<ArchiveChannel> = {}): ArchiveChannel {
	const readings =
		overrides.recentReadings ??
		makeTemperatureReadings(overrides.value ?? 225, overrides.units ?? "F");
	const values = readings.map((reading) => reading.value);
	return {
		number: overrides.number ?? "1",
		label: overrides.label ?? "Pit",
		units: overrides.units ?? "F",
		value: overrides.value ?? values.at(-1) ?? null,
		status: overrides.status ?? "normal",
		enabled: overrides.enabled ?? true,
		color: overrides.color ?? null,
		type: overrides.type ?? "temperature",
		alarmHigh: overrides.alarmHigh ?? null,
		alarmLow: overrides.alarmLow ?? null,
		minimum:
			overrides.minimum ??
			makeMinMaxReading({
				value: Math.min(...values),
				units: overrides.units ?? "F",
				date: ONE_DAY_AGO,
			}),
		maximum:
			overrides.maximum ??
			makeMinMaxReading({ value: Math.max(...values), units: overrides.units ?? "F", date: NOW }),
		recentReadings: readings,
	};
}

export function makeArchive(overrides: Partial<Archive> & { id?: string } = {}): Archive {
	return {
		id: overrides.id ?? "fixture-archive-001",
		start: overrides.start ?? TWO_HOURS_AGO,
		end: overrides.end ?? NOW,
		count: overrides.count ?? 5,
		type: overrides.type ?? "session",
		label: overrides.label ?? "Sunday Brisket",
		deviceLabel: overrides.deviceLabel ?? "Backyard Smoker",
		notes: overrides.notes ?? "Synthetic offline fixture session",
		createdOn: overrides.createdOn ?? NOW,
		public: overrides.public ?? false,
		publicLink: overrides.publicLink ?? null,
		filename: overrides.filename ?? null,
		channels: overrides.channels ?? [makeArchiveChannel()],
	};
}

function makeTemperatureReadings(finalValue: number, units: string): TemperatureReading[] {
	return [
		{ value: finalValue - 8, timestamp: new Date("2026-06-01T10:00:00Z"), units },
		{ value: finalValue - 3, timestamp: new Date("2026-06-01T11:00:00Z"), units },
		{ value: finalValue, timestamp: NOW, units },
	];
}

export const FIXTURE_DEVICES: Device[] = [
	makeDevice({
		serial: "DEMO-SIGNALS-4CH",
		deviceId: "signals-001",
		label: "Backyard Smoker",
		type: "signals",
		device: "Signals 4-Channel",
		status: "online",
		battery: 87,
		batteryState: "normal",
		wifiStrength: -42,
		firmware: FIXTURE_LATEST_FIRMWARE.signals,
		color: "#FF6B35",
		iotDeviceId: "iot-signals-001",
		recordingIntervalInSeconds: 2,
		transmitIntervalInSeconds: 10,
		readInterval: 2,
		heartbeatInterval: 60,
		temperatureDeltaTrigger: 1,
		sessionStart: TWO_HOURS_AGO,
		sessionLabel: "Sunday Brisket",
		assignedToAccountOn: new Date("2024-03-15T00:00:00Z"),
		ringColors: ["#FF6B35", "#4ECDC4", "#FFE66D", "#95E1D3"],
	}),
	makeDevice({
		serial: "DEMO-SMOKE-2CH",
		deviceId: "smoke-001",
		label: "Easter Brisket",
		type: "smoke",
		device: "Smoke 2-Channel",
		status: "online",
		battery: 62,
		batteryState: "normal",
		wifiStrength: -55,
		firmware: FIXTURE_FIRMWARE_SCENARIOS["update-available"].installedVersion,
		color: "#4ECDC4",
		iotDeviceId: "iot-smoke-001",
		recordingIntervalInSeconds: 3,
		transmitIntervalInSeconds: 15,
		readInterval: 3,
		heartbeatInterval: 60,
		temperatureDeltaTrigger: 1,
		lastSeen: TEN_MIN_AGO,
		lastTelemetrySaved: TEN_MIN_AGO,
		latestReading: TEN_MIN_AGO,
		lastWifiConnection: TEN_MIN_AGO,
		sessionStart: TWO_HOURS_AGO,
		sessionLabel: "Easter Brisket",
		assignedToAccountOn: new Date("2023-11-20T00:00:00Z"),
		ringColors: ["#4ECDC4", "#FFE66D"],
	}),
	makeDevice({
		serial: "DEMO-NODE-1CH",
		deviceId: "node-001",
		label: "Garage Fridge",
		type: "node",
		device: "ThermoWorks Node",
		status: "online",
		battery: 94,
		batteryState: "normal",
		wifiStrength: -38,
		firmware: FIXTURE_LATEST_FIRMWARE.node,
		color: "#6C5CE7",
		iotDeviceId: "iot-node-001",
		recordingIntervalInSeconds: 30,
		transmitIntervalInSeconds: 60,
		readInterval: 30,
		heartbeatInterval: 300,
		temperatureDeltaTrigger: 2,
		assignedToAccountOn: new Date("2024-06-01T00:00:00Z"),
		notes: "Monitoring garage fridge temp",
		showSensorChannels: false,
	}),
	makeDevice({
		serial: "DEMO-OFFLINE-NODE",
		deviceId: "node-offline-001",
		label: "Basement Freezer",
		type: "node",
		device: "ThermoWorks Node",
		status: "offline",
		battery: 18,
		batteryState: "low",
		wifiStrength: -85,
		firmware: "3.0.0",
		color: "#A29BFE",
		lastSeen: ONE_DAY_AGO,
		lastTelemetrySaved: ONE_DAY_AGO,
		latestReading: ONE_DAY_AGO,
		lastWifiConnection: ONE_DAY_AGO,
		assignedToAccountOn: new Date("2024-07-01T00:00:00Z"),
		notes: "Offline fixture for stale device states",
		showSensorChannels: false,
	}),
];

function activeAlarm(value: number): Alarm {
	return makeAlarm({ alarming: true, value, lastNotified: NOW });
}

const inactiveAlarm = (value: number): Alarm => makeAlarm({ alarming: false, value });

export function getFixtureChannels(
	serial: string,
	mode: FixtureDemoMode = "normal",
): DeviceChannel[] {
	const channels =
		serial in FIXTURE_CHANNELS ? FIXTURE_CHANNELS[serial as FixtureSerial][mode] : [];
	return clone(channels);
}

export const FIXTURE_CHANNELS: Record<FixtureSerial, Record<FixtureDemoMode, DeviceChannel[]>> = {
	"DEMO-NODE-1CH": {
		high: [
			makeChannel({
				label: "Internal",
				value: 48,
				number: "1",
				color: "#6C5CE7",
				alarmHigh: activeAlarm(45),
				alarmLow: inactiveAlarm(32),
			}),
		],
		low: [
			makeChannel({
				label: "Internal",
				value: 28,
				number: "1",
				color: "#6C5CE7",
				alarmHigh: inactiveAlarm(45),
				alarmLow: activeAlarm(32),
			}),
		],
		normal: [
			makeChannel({
				label: "Internal",
				value: 38,
				number: "1",
				color: "#6C5CE7",
				alarmHigh: inactiveAlarm(45),
				alarmLow: inactiveAlarm(32),
			}),
		],
	},
	"DEMO-OFFLINE-NODE": {
		high: [
			makeChannel({
				label: "Internal",
				value: null,
				number: "1",
				status: "offline",
				color: "#A29BFE",
				lastSeen: ONE_DAY_AGO,
				lastTelemetrySaved: ONE_DAY_AGO,
				alarmHigh: inactiveAlarm(45),
				alarmLow: inactiveAlarm(0),
			}),
		],
		low: [
			makeChannel({
				label: "Internal",
				value: null,
				number: "1",
				status: "offline",
				color: "#A29BFE",
				lastSeen: ONE_DAY_AGO,
				lastTelemetrySaved: ONE_DAY_AGO,
				alarmHigh: inactiveAlarm(45),
				alarmLow: inactiveAlarm(0),
			}),
		],
		normal: [
			makeChannel({
				label: "Internal",
				value: null,
				number: "1",
				status: "offline",
				color: "#A29BFE",
				lastSeen: ONE_DAY_AGO,
				lastTelemetrySaved: ONE_DAY_AGO,
				alarmHigh: inactiveAlarm(45),
				alarmLow: inactiveAlarm(0),
			}),
		],
	},
	"DEMO-SIGNALS-4CH": {
		high: [
			makeChannel({
				label: "Pit",
				value: 285,
				number: "1",
				color: "#FF6B35",
				alarmHigh: activeAlarm(275),
				alarmLow: inactiveAlarm(200),
			}),
			makeChannel({
				label: "Brisket",
				value: 205,
				number: "2",
				color: "#4ECDC4",
				alarmHigh: activeAlarm(203),
				alarmLow: makeAlarm({ enabled: false, value: null, units: null }),
			}),
			makeChannel({
				label: "Ribs",
				value: 198,
				number: "3",
				color: "#FFE66D",
				alarmHigh: inactiveAlarm(200),
				alarmLow: makeAlarm({ enabled: false, value: null, units: null }),
			}),
			makeChannel({
				label: "Ambient",
				value: 72,
				number: "4",
				color: "#95E1D3",
				alarmHigh: makeAlarm({ enabled: false, value: null, units: null }),
				alarmLow: makeAlarm({ enabled: false, value: null, units: null }),
			}),
		],
		low: [
			makeChannel({
				label: "Pit",
				value: 180,
				number: "1",
				color: "#FF6B35",
				alarmHigh: inactiveAlarm(275),
				alarmLow: activeAlarm(200),
			}),
			makeChannel({
				label: "Brisket",
				value: 120,
				number: "2",
				color: "#4ECDC4",
				alarmHigh: inactiveAlarm(203),
				alarmLow: makeAlarm({ enabled: false, value: null, units: null }),
			}),
			makeChannel({
				label: "Ribs",
				value: 175,
				number: "3",
				color: "#FFE66D",
				alarmHigh: inactiveAlarm(200),
				alarmLow: makeAlarm({ enabled: false, value: null, units: null }),
			}),
			makeChannel({
				label: "Ambient",
				value: 72,
				number: "4",
				color: "#95E1D3",
				alarmHigh: makeAlarm({ enabled: false, value: null, units: null }),
				alarmLow: makeAlarm({ enabled: false, value: null, units: null }),
			}),
		],
		normal: [
			makeChannel({
				label: "Pit",
				value: 225,
				number: "1",
				color: "#FF6B35",
				alarmHigh: inactiveAlarm(275),
				alarmLow: inactiveAlarm(200),
				minimum: makeMinMaxReading({ value: 220, date: THIRTY_MIN_AGO }),
				maximum: makeMinMaxReading({ value: 235, date: TEN_MIN_AGO }),
				rateOfChange: 1.2,
				rateOfChangeUnit: "F/min",
			}),
			makeChannel({
				label: "Brisket",
				value: 168,
				number: "2",
				color: "#4ECDC4",
				alarmHigh: inactiveAlarm(203),
				alarmLow: makeAlarm({ enabled: false, value: null, units: null }),
			}),
			makeChannel({
				label: "Ribs",
				value: 175,
				number: "3",
				color: "#FFE66D",
				alarmHigh: inactiveAlarm(200),
				alarmLow: makeAlarm({ enabled: false, value: null, units: null }),
			}),
			makeChannel({
				label: "Ambient",
				value: 72,
				number: "4",
				color: "#95E1D3",
				alarmHigh: makeAlarm({ enabled: false, value: null, units: null }),
				alarmLow: makeAlarm({ enabled: false, value: null, units: null }),
			}),
		],
	},
	"DEMO-SMOKE-2CH": {
		high: [
			makeChannel({
				label: "Pit",
				value: 292,
				number: "1",
				color: "#4ECDC4",
				alarmHigh: activeAlarm(285),
				alarmLow: inactiveAlarm(220),
			}),
			makeChannel({
				label: "Brisket",
				value: 207,
				number: "2",
				color: "#FFE66D",
				alarmHigh: activeAlarm(203),
				alarmLow: makeAlarm({ enabled: false, value: null, units: null }),
			}),
		],
		low: [
			makeChannel({
				label: "Pit",
				value: 208,
				number: "1",
				color: "#4ECDC4",
				alarmHigh: inactiveAlarm(285),
				alarmLow: activeAlarm(220),
			}),
			makeChannel({
				label: "Brisket",
				value: 168,
				number: "2",
				color: "#FFE66D",
				alarmHigh: inactiveAlarm(203),
				alarmLow: makeAlarm({ enabled: false, value: null, units: null }),
			}),
		],
		normal: [
			makeChannel({
				label: "Pit",
				value: 250,
				number: "1",
				color: "#4ECDC4",
				alarmHigh: inactiveAlarm(285),
				alarmLow: inactiveAlarm(220),
			}),
			makeChannel({
				label: "Brisket",
				value: 168,
				number: "2",
				color: "#FFE66D",
				alarmHigh: inactiveAlarm(203),
				alarmLow: makeAlarm({ enabled: false, value: null, units: null }),
			}),
		],
	},
};

export const FIXTURE_ARCHIVES: Record<FixtureSerial, Archive[]> = {
	"DEMO-NODE-1CH": [
		makeArchive({
			id: "demo-DEMO-NODE-1CH-0",
			label: "Garage Fridge",
			deviceLabel: "Garage Fridge",
			channels: [
				makeArchiveChannel({
					label: "Internal",
					number: "1",
					value: 38,
					color: "#6C5CE7",
					alarmHigh: inactiveAlarm(45),
					alarmLow: inactiveAlarm(32),
				}),
			],
		}),
	],
	"DEMO-OFFLINE-NODE": [
		makeArchive({
			id: "demo-DEMO-OFFLINE-NODE-0",
			label: "Freezer Check",
			deviceLabel: "Basement Freezer",
			channels: [
				makeArchiveChannel({
					label: "Internal",
					number: "1",
					value: 2,
					color: "#A29BFE",
					alarmHigh: inactiveAlarm(45),
					alarmLow: inactiveAlarm(0),
				}),
			],
		}),
	],
	"DEMO-SIGNALS-4CH": [
		makeArchive({
			id: "demo-DEMO-SIGNALS-4CH-0",
			label: "Sunday Brisket",
			deviceLabel: "Backyard Smoker",
			channels: FIXTURE_CHANNELS["DEMO-SIGNALS-4CH"].normal.slice(0, 3).map((channel) =>
				makeArchiveChannel({
					alarmHigh: channel.alarmHigh,
					alarmLow: channel.alarmLow,
					color: channel.color,
					label: channel.label,
					number: channel.number,
					value: channel.value,
				}),
			),
		}),
		makeArchive({
			id: "demo-DEMO-SIGNALS-4CH-1",
			label: "Grilled Steak",
			deviceLabel: "Backyard Smoker",
			start: new Date("2026-05-30T18:00:00Z"),
			end: new Date("2026-05-30T18:24:00Z"),
			channels: [
				makeArchiveChannel({
					label: "Grill",
					number: "1",
					value: 515,
					color: "#FF6B35",
					alarmHigh: inactiveAlarm(525),
				}),
				makeArchiveChannel({
					label: "Steak",
					number: "2",
					value: 125,
					color: "#E84855",
					alarmHigh: inactiveAlarm(125),
				}),
			],
		}),
	],
	"DEMO-SMOKE-2CH": [
		makeArchive({
			id: "demo-DEMO-SMOKE-2CH-0",
			label: "Easter Brisket",
			deviceLabel: "Easter Brisket",
			channels: FIXTURE_CHANNELS["DEMO-SMOKE-2CH"].normal.map((channel) =>
				makeArchiveChannel({
					alarmHigh: channel.alarmHigh,
					alarmLow: channel.alarmLow,
					color: channel.color,
					label: channel.label,
					number: channel.number,
					value: channel.value,
				}),
			),
		}),
	],
};

export const HIGH_ALARM_CHANNEL = firstChannel(FIXTURE_CHANNELS["DEMO-SIGNALS-4CH"].high);
export const LOW_ALARM_CHANNEL = firstChannel(FIXTURE_CHANNELS["DEMO-NODE-1CH"].low);
export const OFFLINE_DEVICE = FIXTURE_DEVICES.find(
	(device) => device.status === "offline",
) as Device;

export class FakeThermoworksCloud {
	private readonly devices: Device[];
	private readonly channels: Record<string, DeviceChannel[]>;
	private readonly archives: Record<string, Archive[]>;
	private readonly events: DeviceEvent[];
	private readonly firmware: Record<string, FirmwareInfo>;
	readonly config: ThermoworksConfig | null;
	closed = false;

	constructor(config: ThermoworksConfig | null = null, options: FakeThermoworksCloudOptions = {}) {
		this.config = config;
		this.devices = clone([...(options.devices ?? FIXTURE_DEVICES)]);
		this.channels = clone(
			toMutableRecord(
				options.channels ??
					Object.fromEntries(
						Object.entries(FIXTURE_CHANNELS).map(([serial, modes]) => [serial, modes.normal]),
					),
			),
		);
		this.archives = clone(toMutableRecord(options.archives ?? FIXTURE_ARCHIVES));
		this.events = clone([...(options.events ?? makeFixtureEvents())]);
		this.firmware = clone({ ...(options.firmware ?? FIXTURE_FIRMWARE) });
	}

	async getDevices(filter?: DeviceFilter): Promise<Device[]> {
		return applyFilter(clone(this.devices), filter);
	}

	async getDevice(serial: string): Promise<Device> {
		const device = this.devices.find((candidate) => candidate.serial === serial);
		if (!device) throw new NotFoundError(`Device with serial '${serial}' not found`);
		return clone(device);
	}

	async getAllDeviceChannels(serial: string): Promise<DeviceChannel[]> {
		return clone(this.channels[serial] ?? []);
	}

	async getDeviceChannel(serial: string, channel: number): Promise<DeviceChannel> {
		const found = this.channels[serial]?.find((candidate) => candidate.number === String(channel));
		if (!found) throw new NotFoundError(`Channel ${channel} for device '${serial}' not found`);
		return clone(found);
	}

	async getAverageTemperature(serial: string): Promise<{ value: number; units: string } | null> {
		const readings = (this.channels[serial] ?? []).filter(
			(channel) => channel.enabled !== false && channel.units === "F" && channel.value != null,
		);
		if (readings.length === 0) return null;
		const total = readings.reduce((sum, channel) => sum + (channel.value ?? 0), 0);
		return { value: Math.round((total / readings.length) * 10) / 10, units: "F" };
	}

	async getArchives(serial: string, options: ArchiveListOptions = {}): Promise<Archive[]> {
		return clone((this.archives[serial] ?? []).slice(0, options.limit ?? undefined));
	}

	async getArchive(serial: string, archiveId: string): Promise<Archive> {
		const archive = this.archives[serial]?.find((candidate) => candidate.id === archiveId);
		if (!archive)
			throw new NotFoundError(`Archive '${archiveId}' for device '${serial}' not found`);
		return clone(archive);
	}

	async getEvents(filter: { deviceId?: string; limit?: number } = {}): Promise<DeviceEvent[]> {
		const events = filter.deviceId
			? this.events.filter((event) => event.deviceId === filter.deviceId)
			: this.events;
		return clone(events.slice(0, filter.limit ?? undefined));
	}

	async getFirmwareInfo(deviceType: string): Promise<FirmwareInfo> {
		const info = this.firmware[deviceType];
		if (!info) throw new NotFoundError(`Firmware for device type '${deviceType}' not found`);
		return clone(info);
	}

	async getHistory(serial: string): Promise<DeviceHistory> {
		const readings: HistoricalReading[] = (this.archives[serial]?.[0]?.channels ?? []).flatMap(
			(channel) =>
				channel.recentReadings.map((reading) => ({
					timestamp: reading.timestamp.toISOString(),
					units: reading.units,
					value: reading.value,
				})),
		);
		return { deviceId: serial, readings };
	}

	async startSession(serial: string, label = "Fixture Session"): Promise<ActionResult> {
		const device = this.devices.find((candidate) => candidate.serial === serial);
		if (device) {
			Object.assign(device, { sessionLabel: label, sessionStart: NOW });
		}
		return { success: true, data: { serial, label }, error: null };
	}

	async endSession(serial: string): Promise<ActionResult> {
		const device = this.devices.find((candidate) => candidate.serial === serial);
		if (device) {
			Object.assign(device, { sessionLabel: null, sessionStart: null });
		}
		return { success: true, data: { serial }, error: null };
	}

	async setAlarm(
		serial: string,
		channelNumber: number,
		config: {
			high?: { value: number; units?: string; enabled?: boolean; muted?: boolean };
			low?: { value: number; units?: string; enabled?: boolean; muted?: boolean };
		},
	): Promise<void> {
		const channel = this.channels[serial]?.find(
			(candidate) => candidate.number === String(channelNumber),
		);
		if (!channel)
			throw new NotFoundError(`Channel ${channelNumber} for device '${serial}' not found`);
		if (config.high) {
			Object.assign(channel, { alarmHigh: makeAlarm({ ...config.high, alarming: false }) });
		}
		if (config.low) {
			Object.assign(channel, { alarmLow: makeAlarm({ ...config.low, alarming: false }) });
		}
	}

	close(): void {
		this.closed = true;
	}
}

function makeFixtureEvents(): DeviceEvent[] {
	return [
		{
			id: "fixture-event-high",
			eventType: "High Alarm",
			severity: 2,
			eventTime: NOW,
			deviceId: "DEMO-SIGNALS-4CH",
			channelId: "1",
			accountId: FIXTURE_ACCOUNT_ID,
			valueBefore: "270",
			valueAfter: "285",
			groups: ["bbq"],
		},
		{
			id: "fixture-event-low",
			eventType: "Low Alarm",
			severity: 2,
			eventTime: NOW,
			deviceId: "DEMO-NODE-1CH",
			channelId: "1",
			accountId: FIXTURE_ACCOUNT_ID,
			valueBefore: "34",
			valueAfter: "28",
			groups: ["storage"],
		},
	];
}

function applyFilter(devices: Device[], filter?: DeviceFilter): Device[] {
	if (!filter) return devices;
	return devices.filter((device) => {
		if (filter.serial && !matches(device.serial, filter.serial)) return false;
		if (filter.type && !matches(device.type, filter.type)) return false;
		if (filter.label && !matches(device.label, filter.label)) return false;
		if (filter.status && !matches(device.status, filter.status)) return false;
		if (filter.activeWithinMinutes != null) {
			if (!device.lastSeen) return false;
			const ageMinutes = (NOW.getTime() - device.lastSeen.getTime()) / 60_000;
			if (ageMinutes > filter.activeWithinMinutes) return false;
		}
		return true;
	});
}

function matches(value: string | null, expected: string | string[]): boolean {
	const values = Array.isArray(expected) ? expected : [expected];
	return value != null && values.includes(value);
}

function withDefault<T, K extends keyof T>(
	overrides: Partial<T>,
	key: K,
	fallback: NonNullable<T[K]>,
): T[K] {
	return Object.hasOwn(overrides, key) ? (overrides[key] as T[K]) : fallback;
}

function firstChannel(channels: DeviceChannel[]): DeviceChannel {
	const [channel] = channels;
	if (!channel) {
		throw new Error("Fixture channel list is empty");
	}
	return channel;
}

function clone<T>(value: T): T {
	return structuredClone(value);
}

function toMutableRecord<T>(record: Readonly<Record<string, readonly T[]>>): Record<string, T[]> {
	return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, [...value]]));
}

export function getFixtureAlarmState(channel: DeviceChannel): "none" | "high" | "low" {
	return getChannelAlarmState(channel);
}
