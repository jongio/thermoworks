/**
 * Fake but realistic data for demo/screenshot mode.
 * Inspired by real ThermoWorks device types but uses no real user information.
 */
import type { Device, DeviceChannel, User } from "thermoworks-sdk";

/** Simulated latest firmware versions per device type. */
export const DEMO_LATEST_FIRMWARE: Record<string, string> = {
	signals: "2.4.1",
	smoke: "1.8.3", // Kitchen Smoke has 1.5.0 → outdated
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
		label: "Kitchen Smoke",
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
		sessionLabel: "Oven Roast",
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
							? { enabled: true, alarming: true, muted: false, value: 275, units: "F", lastNotified: now }
							: { enabled: true, alarming: false, muted: false, value: 275, units: "F", lastNotified: null },
					alarmLow:
						mode === "low"
							? { enabled: true, alarming: true, muted: false, value: 200, units: "F", lastNotified: now }
							: { enabled: true, alarming: false, muted: false, value: 200, units: "F", lastNotified: null },
				}),
				makeChannel({
					label: "Brisket",
					value: mode === "high" ? 205 : mode === "low" ? 120 : 168,
					units: "F",
					number: "2",
					color: "#4ECDC4",
					alarmHigh:
						mode === "high"
							? { enabled: true, alarming: true, muted: false, value: 203, units: "F", lastNotified: now }
							: { enabled: true, alarming: false, muted: false, value: 203, units: "F", lastNotified: null },
					alarmLow: { enabled: false, alarming: false, muted: false, value: null, units: null, lastNotified: null },
				}),
				makeChannel({
					label: "Ribs",
					value: mode === "high" ? 198 : 175,
					units: "F",
					number: "3",
					color: "#FFE66D",
					alarmHigh: { enabled: true, alarming: false, muted: false, value: 200, units: "F", lastNotified: null },
					alarmLow: { enabled: false, alarming: false, muted: false, value: null, units: null, lastNotified: null },
				}),
				makeChannel({
					label: "Ambient",
					value: 72,
					units: "F",
					number: "4",
					color: "#95E1D3",
					alarmHigh: { enabled: false, alarming: false, muted: false, value: null, units: null, lastNotified: null },
					alarmLow: { enabled: false, alarming: false, muted: false, value: null, units: null, lastNotified: null },
				}),
			];

		case "DEMO-SMOKE-2CH":
			return [
				makeChannel({
					label: "Oven",
					value: mode === "high" ? 475 : 350,
					units: "F",
					number: "1",
					color: "#4ECDC4",
					alarmHigh:
						mode === "high"
							? { enabled: true, alarming: true, muted: false, value: 425, units: "F", lastNotified: now }
							: { enabled: true, alarming: false, muted: false, value: 425, units: "F", lastNotified: null },
					alarmLow: { enabled: false, alarming: false, muted: false, value: null, units: null, lastNotified: null },
				}),
				makeChannel({
					label: "Roast",
					value: mode === "high" ? 165 : 138,
					units: "F",
					number: "2",
					color: "#FFE66D",
					alarmHigh: { enabled: true, alarming: false, muted: false, value: 160, units: "F", lastNotified: null },
					alarmLow: { enabled: false, alarming: false, muted: false, value: null, units: null, lastNotified: null },
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
					alarmHigh: { enabled: true, alarming: false, muted: false, value: 45, units: "F", lastNotified: null },
					alarmLow:
						mode === "low"
							? { enabled: true, alarming: true, muted: false, value: 32, units: "F", lastNotified: now }
							: { enabled: true, alarming: false, muted: false, value: 32, units: "F", lastNotified: null },
				}),
			];

		default:
			return [];
	}
}
