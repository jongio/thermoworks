import type { Device, DeviceChannel, User } from "thermoworks-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── VS Code mock ────────────────────────────────────────────────────────────

const { MockThemeColor, MockThemeIcon, treeItemsConfigValues } = vi.hoisted(() => {
	const configValues: Record<string, unknown> = {};
	function MockThemeColor(this: { id: string }, id: string) {
		this.id = id;
	}
	function MockThemeIcon(this: { id: string; color?: unknown }, id: string, color?: unknown) {
		this.id = id;
		this.color = color;
	}
	return { MockThemeColor, MockThemeIcon, treeItemsConfigValues: configValues };
});

const mockTreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };

vi.mock("vscode", () => ({
	ThemeColor: MockThemeColor,
	ThemeIcon: MockThemeIcon,
	TreeItem: class {
		label?: string;
		id?: string;
		description?: string;
		tooltip?: string | object;
		iconPath?: unknown;
		collapsibleState?: number;
		contextValue?: string;
		command?: unknown;
		constructor(label: string, collapsibleState?: number) {
			this.label = label;
			this.collapsibleState = collapsibleState;
		}
	},
	TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
	Uri: { parse: vi.fn((s: string) => ({ toString: () => s })) },
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn(
				(key: string, defaultValue: unknown) => treeItemsConfigValues[key] ?? defaultValue,
			),
		})),
	},
}));

// ─── Imports (after mock) ────────────────────────────────────────────────────

import {
	AccountDetailNode,
	AccountNode,
	ActionNode,
	ArchivesFolderNode,
	buildDeviceChildren,
	CalibrationFolderNode,
	CalibrationRecordNode,
	ChannelNode,
	DeviceDetailNode,
	DeviceNode,
	DevicesFolderNode,
	ErrorNode,
	formatElapsed,
	LoadingNode,
} from "../src/tree/tree-items";

// ─── Test fixtures ───────────────────────────────────────────────────────────

const mockUser: User = {
	userId: "user-1",
	accountId: "account-1",
	email: "test@example.com",
	displayName: "Test User",
	timeZone: "America/Denver",
	preferredUnits: "F",
	locale: "en-US",
	photoUrl: null,
	use24Time: false,
	lastLogin: new Date("2026-01-01"),
	appVersion: "1.0.0",
	accountRoles: null,
	roles: null,
	notificationSettings: null,
};

const mockDevice: Device = {
	serial: "ABC123",
	deviceId: "dev-1",
	label: "Smoker",
	type: "signals",
	device: null,
	status: "online",
	battery: 85,
	batteryState: "good",
	wifiStrength: -45,
	firmware: "1.2.3",
	color: null,
	thumbnail: null,
	deviceDisplayUnits: "F",
	iotDeviceId: null,
	iotCoreDeviceBlocked: null,
	recordingIntervalInSeconds: null,
	transmitIntervalInSeconds: null,
	readInterval: null,
	heartbeatInterval: null,
	temperatureDeltaTrigger: null,
	pendingLoad: null,
	batteryAlertSent: null,
	lastSeen: new Date(Date.now() - 2 * 60_000), // 2 min ago
	lastTelemetrySaved: null,
	latestReading: null,
	lastWifiConnection: null,
	lastBluetoothConnection: null,
	sessionStart: null,
	sessionLabel: null,
	lastArchive: null,
	lastPurged: null,
	assignedToAccountOn: null,
	accountId: "account-1",
	notes: null,
	public: null,
	publicLink: null,
	searModeEnabled: null,
	showSensorChannels: null,
	ringColors: null,
	gateway: null,
	fan: null,
	bigQuery: null,
};

const mockOfflineDevice: Device = {
	...mockDevice,
	serial: "DEF456",
	label: "Fridge",
	status: "offline",
	battery: null,
	lastSeen: null,
	firmware: null,
};

function makeChannel(overrides: Partial<DeviceChannel> = {}): DeviceChannel {
	return {
		value: 225,
		units: "F",
		label: "Pit",
		status: "ok",
		type: "temperature",
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
		alarmHigh: null,
		alarmLow: null,
		minimum: null,
		maximum: null,
		...overrides,
	};
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("tree-items", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("AccountNode", () => {
		it("creates with expanded state and user email as description", () => {
			const node = new AccountNode(mockUser);
			expect(node.label).toBe("Account");
			expect(node.collapsibleState).toBe(mockTreeItemCollapsibleState.Expanded);
			expect(node.description).toBe("test@example.com");
			expect(node.id).toBe("thermoworks-account");
			expect(node.contextValue).toBe("account");
		});
	});

	describe("AccountDetailNode", () => {
		it("creates with label:value format", () => {
			const node = new AccountDetailNode("Email", "test@example.com", "mail");
			expect(node.label).toBe("Email: test@example.com");
			expect(node.collapsibleState).toBe(mockTreeItemCollapsibleState.None);
			expect(node.id).toBe("thermoworks-account-email");
		});

		it("generates stable id from label", () => {
			const node = new AccountDetailNode("Display Name", "Jon", "person");
			expect(node.id).toBe("thermoworks-account-display-name");
		});
	});

	describe("ActionNode", () => {
		it("creates with command binding", () => {
			const node = new ActionNode(
				"Open Cloud",
				"thermoworks.openCloud",
				"link-external",
				"action-cloud",
			);
			expect(node.label).toBe("Open Cloud");
			expect(node.command).toEqual({ command: "thermoworks.openCloud", title: "Open Cloud" });
			expect(node.id).toBe("action-cloud");
		});
	});

	describe("DevicesFolderNode", () => {
		it("shows device count as description", () => {
			const node = new DevicesFolderNode(3);
			expect(node.label).toBe("Devices");
			expect(node.description).toBe("3");
			expect(node.collapsibleState).toBe(mockTreeItemCollapsibleState.Expanded);
			expect(node.contextValue).toBe("devicesFolder");
		});
	});

	describe("DeviceNode", () => {
		it("creates online device with green pulse icon", () => {
			const node = new DeviceNode(mockDevice, false);
			expect(node.label).toBe("Smoker");
			expect(node.serial).toBe("ABC123");
			expect(node.description).toBe("signals");
			expect(node.collapsibleState).toBe(mockTreeItemCollapsibleState.Collapsed);
			expect((node.iconPath as { id: string }).id).toBe("pulse");
		});

		it("creates offline device with circle-outline icon", () => {
			const node = new DeviceNode(mockOfflineDevice, false);
			expect(node.description).toBe("signals (Offline)");
			expect((node.iconPath as { id: string }).id).toBe("circle-outline");
		});

		it("creates alarming device with warning icon", () => {
			const node = new DeviceNode(mockDevice, true);
			expect((node.iconPath as { id: string }).id).toBe("warning");
		});

		it("uses serial as label when device label is null", () => {
			const device = { ...mockDevice, label: null };
			const node = new DeviceNode(device, false);
			expect(node.label).toBe("ABC123");
		});

		it("shows session label and elapsed time for active session", () => {
			const now = new Date("2026-06-07T09:23:00Z");
			const start = new Date("2026-06-07T08:00:00Z");
			// Mock Date.now for elapsed calculation
			vi.setSystemTime(now);
			const device = {
				...mockDevice,
				sessionStart: start,
				sessionLabel: "Sunday Brisket",
			};
			const node = new DeviceNode(device, false);
			expect(node.description).toContain("\uD83D\uDD34 Sunday Brisket 1h 23m");
			expect((node.iconPath as { id: string }).id).toBe("record");
			vi.useRealTimers();
		});

		it("shows Recording as fallback when sessionLabel is null", () => {
			const now = new Date("2026-06-07T08:45:00Z");
			const start = new Date("2026-06-07T08:00:00Z");
			vi.setSystemTime(now);
			const device = {
				...mockDevice,
				sessionStart: start,
				sessionLabel: null,
			};
			const node = new DeviceNode(device, false);
			expect(node.description).toContain("\uD83D\uDD34 Recording 45m");
			vi.useRealTimers();
		});

		it("alarm icon takes priority over session icon", () => {
			const device = { ...mockDevice, sessionStart: new Date("2026-06-07T08:00:00Z") };
			const node = new DeviceNode(device, true);
			expect((node.iconPath as { id: string }).id).toBe("warning");
			expect(node.description).toContain("\uD83D\uDD34");
		});
	});

	describe("ChannelNode", () => {
		it("shows temperature value as description", () => {
			const ch = makeChannel({ value: 225, units: "F", label: "Pit" });
			const node = new ChannelNode(ch, "ABC123", 0);
			expect(node.label).toBe("Pit");
			expect(node.description).toBe("225\u00B0F");
			expect(node.id).toBe("thermoworks-channel-ABC123-0");
		});

		it("shows green icon for normal channel", () => {
			const ch = makeChannel();
			const node = new ChannelNode(ch, "ABC123", 0);
			expect((node.iconPath as { id: string }).id).toBe("circle-filled");
			expect((node.iconPath as { color: { id: string } }).color.id).toBe("charts.green");
		});

		it("shows red icon for high alarm", () => {
			const ch = makeChannel({
				alarmHigh: {
					enabled: true,
					alarming: true,
					muted: false,
					value: 250,
					units: "F",
					lastNotified: null,
				},
			});
			const node = new ChannelNode(ch, "ABC123", 0);
			expect((node.iconPath as { color: { id: string } }).color.id).toBe("charts.red");
			expect(node.tooltip).toContain("HIGH ALARM");
		});

		it("shows blue icon for low alarm", () => {
			const ch = makeChannel({
				alarmLow: {
					enabled: true,
					alarming: true,
					muted: false,
					value: 30,
					units: "F",
					lastNotified: null,
				},
			});
			const node = new ChannelNode(ch, "ABC123", 0);
			expect((node.iconPath as { color: { id: string } }).color.id).toBe("charts.blue");
			expect(node.tooltip).toContain("LOW ALARM");
		});

		it("shows -- when value is null", () => {
			const ch = makeChannel({ value: null, units: null });
			const node = new ChannelNode(ch, "ABC123", 0);
			expect(node.description).toBe("--");
		});

		it("uses fallback label when channel label is null", () => {
			const ch = makeChannel({ label: null });
			const node = new ChannelNode(ch, "ABC123", 2);
			expect(node.label).toBe("Channel 3");
		});

		it("converts temperature when units preference is C and native is F", () => {
			treeItemsConfigValues.units = "C";
			const ch = makeChannel({ value: 212, units: "F", label: "Boiling" });
			const node = new ChannelNode(ch, "ABC123", 0);
			expect(node.description).toBe("100\u00B0C");
			delete treeItemsConfigValues.units;
		});

		it("keeps native units when preference is auto", () => {
			treeItemsConfigValues.units = "auto";
			const ch = makeChannel({ value: 225, units: "F", label: "Pit" });
			const node = new ChannelNode(ch, "ABC123", 0);
			expect(node.description).toBe("225\u00B0F");
			delete treeItemsConfigValues.units;
		});
	});

	describe("DeviceDetailNode", () => {
		it("creates with label:value and stable id", () => {
			const node = new DeviceDetailNode("Battery", "85%", "ABC123");
			expect(node.label).toBe("Battery: 85%");
			expect(node.id).toBe("thermoworks-detail-ABC123-battery");
		});
	});

	describe("formatElapsed", () => {
		it("returns hours and minutes for long durations", () => {
			const start = new Date("2026-06-07T08:00:00Z");
			const now = new Date("2026-06-07T10:05:00Z");
			expect(formatElapsed(start, now)).toBe("2h 5m");
		});

		it("returns minutes only when under one hour", () => {
			const start = new Date("2026-06-07T08:00:00Z");
			const now = new Date("2026-06-07T08:45:00Z");
			expect(formatElapsed(start, now)).toBe("45m");
		});

		it("returns seconds only when under one minute", () => {
			const start = new Date("2026-06-07T08:00:00Z");
			const now = new Date("2026-06-07T08:00:30Z");
			expect(formatElapsed(start, now)).toBe("30s");
		});

		it("returns 0s for zero elapsed", () => {
			const time = new Date("2026-06-07T08:00:00Z");
			expect(formatElapsed(time, time)).toBe("0s");
		});

		it("returns empty string for negative elapsed (future start)", () => {
			const start = new Date("2026-06-07T10:00:00Z");
			const now = new Date("2026-06-07T08:00:00Z");
			expect(formatElapsed(start, now)).toBe("");
		});

		it("handles exactly one hour", () => {
			const start = new Date("2026-06-07T08:00:00Z");
			const now = new Date("2026-06-07T09:00:00Z");
			expect(formatElapsed(start, now)).toBe("1h 0m");
		});

		it("handles large durations (24+ hours)", () => {
			const start = new Date("2026-06-06T08:00:00Z");
			const now = new Date("2026-06-07T10:30:00Z");
			expect(formatElapsed(start, now)).toBe("26h 30m");
		});
	});

	describe("ErrorNode", () => {
		it("shows error message", () => {
			const node = new ErrorNode("Something went wrong");
			expect(node.label).toBe("Something went wrong");
			expect(node.id).toBe("thermoworks-error");
		});
	});

	describe("LoadingNode", () => {
		it("shows loading state", () => {
			const node = new LoadingNode();
			expect(node.label).toBe("Loading...");
			expect((node.iconPath as { id: string }).id).toBe("loading~spin");
		});
	});

	describe("buildDeviceChildren", () => {
		it("builds channel nodes and metadata for a device", () => {
			const channels = [
				makeChannel({ label: "Pit", value: 225, units: "F" }),
				makeChannel({ label: "Meat", value: 165, units: "F" }),
			];
			const children = buildDeviceChildren(mockDevice, channels);

			// 2 channels + battery + last seen + firmware + calibration folder + archives folder = 7
			expect(children.length).toBe(7);
			expect(children[0]).toBeInstanceOf(ChannelNode);
			expect(children[1]).toBeInstanceOf(ChannelNode);
			expect(children[2]).toBeInstanceOf(DeviceDetailNode);
			expect((children[2] as DeviceDetailNode).label).toBe("Battery: 85%");
			expect(children[5]).toBeInstanceOf(CalibrationFolderNode);
			expect(children[6]).toBeInstanceOf(ArchivesFolderNode);
		});

		it("filters out disabled channels", () => {
			const channels = [
				makeChannel({ label: "Pit", enabled: true }),
				makeChannel({ label: "Disabled", enabled: false }),
			];
			const children = buildDeviceChildren(mockDevice, channels);
			const channelNodes = children.filter((c) => c instanceof ChannelNode);
			expect(channelNodes.length).toBe(1);
		});

		it("filters out humidity channels", () => {
			const channels = [
				makeChannel({ label: "Temp", units: "F" }),
				makeChannel({ label: "Humidity", units: "H" }),
			];
			const children = buildDeviceChildren(mockDevice, channels);
			const channelNodes = children.filter((c) => c instanceof ChannelNode);
			expect(channelNodes.length).toBe(1);
		});

		it("omits metadata when not available", () => {
			const channels = [makeChannel()];
			const children = buildDeviceChildren(mockOfflineDevice, channels);
			// 1 channel + calibration folder + archives folder, no battery, no lastSeen, no firmware
			const detailNodes = children.filter((c) => c instanceof DeviceDetailNode);
			expect(detailNodes.length).toBe(0);
			expect(children[children.length - 1]).toBeInstanceOf(ArchivesFolderNode);
			expect(children[children.length - 2]).toBeInstanceOf(CalibrationFolderNode);
		});

		it("includes average temp node when provided", () => {
			const channels = [makeChannel({ label: "Pit", value: 225, units: "F" })];
			const avgTemp = { value: 218.5, units: "F" };
			const children = buildDeviceChildren(mockDevice, channels, false, avgTemp);
			const detailNodes = children.filter((c) => c instanceof DeviceDetailNode);
			const avgNode = detailNodes.find(
				(n) => (n as DeviceDetailNode).label === "Avg Temp: 219\u00B0F",
			);
			expect(avgNode).toBeDefined();
		});

		it("omits average temp node when null", () => {
			const channels = [makeChannel({ label: "Pit", value: 225, units: "F" })];
			const children = buildDeviceChildren(mockDevice, channels, false, null);
			const detailNodes = children.filter((c) => c instanceof DeviceDetailNode);
			const avgNode = detailNodes.find((n) =>
				((n as DeviceDetailNode).label as string).startsWith("Avg Temp"),
			);
			expect(avgNode).toBeUndefined();
		});

		it("includes calibration folder for every device", () => {
			const channels = [makeChannel()];
			const children = buildDeviceChildren(mockDevice, channels);
			const calFolder = children.find((c) => c instanceof CalibrationFolderNode);
			expect(calFolder).toBeDefined();
			expect((calFolder as CalibrationFolderNode).serial).toBe("ABC123");
		});
	});

	describe("CalibrationFolderNode", () => {
		it("creates with collapsed state and beaker icon", () => {
			const node = new CalibrationFolderNode("ABC123");
			expect(node.label).toBe("Calibration");
			expect(node.serial).toBe("ABC123");
			expect(node.collapsibleState).toBe(mockTreeItemCollapsibleState.Collapsed);
			expect(node.id).toBe("thermoworks-calibration-ABC123");
			expect((node.iconPath as { id: string }).id).toBe("beaker");
			expect(node.contextValue).toBe("calibrationFolder");
		});
	});

	describe("CalibrationRecordNode", () => {
		it("renders date and result", () => {
			const record = {
				calibrationId: "cal-001",
				calibrationDate: new Date(2025, 2, 15), // March 15, 2025 local time
				deviceId: "ABC123",
				sessionId: null,
				performedBy: "Technician A",
				manager: null,
				referenceDetail: null,
				statedAccuracy: null,
				ambientTemperature: null,
				ambientHumidity: null,
				result: "Pass",
				lowPointAdjustments: [
					{
						channel: 1,
						value: 32.1,
						units: "F",
						referenceValue: 32.0,
						deviation: 0.1,
						trimValue: null,
						result: "Pass",
					},
				],
				highPointReference: [],
			};
			const node = new CalibrationRecordNode(record, 0);
			// Date formatting is locale-dependent; just verify it's not the fallback
			expect(node.label).not.toBe("Unknown date");
			expect(node.description).toBe("Pass");
			expect(node.id).toBe("thermoworks-calibration-record-cal-001-0");
			expect((node.iconPath as { id: string }).id).toBe("check");
			expect(node.tooltip).toContain("Result: Pass");
			expect(node.tooltip).toContain("Performed by: Technician A");
			expect(node.tooltip).toContain("Low points: 1");
		});

		it("handles null date and result gracefully", () => {
			const record = {
				calibrationId: "cal-002",
				calibrationDate: null,
				deviceId: "DEF456",
				sessionId: null,
				performedBy: null,
				manager: null,
				referenceDetail: null,
				statedAccuracy: null,
				ambientTemperature: null,
				ambientHumidity: null,
				result: null,
				lowPointAdjustments: [],
				highPointReference: [],
			};
			const node = new CalibrationRecordNode(record, 1);
			expect(node.label).toBe("Unknown date");
			expect(node.description).toBe("No result");
			expect(node.tooltip).toContain("Date: Unknown date");
			expect(node.tooltip).toContain("Result: No result");
			// Should NOT contain performer or points lines
			expect(node.tooltip).not.toContain("Performed by");
			expect(node.tooltip).not.toContain("Low points");
		});
	});
});
