import type { Device, DeviceChannel } from "thermoworks-sdk";
import { describe, expect, it, vi } from "vitest";

// ─── VS Code mock ────────────────────────────────────────────────────────────

const { MockThemeColor, MockThemeIcon, treeHealthConfigValues } = vi.hoisted(() => {
	const configValues: Record<string, unknown> = {};
	function MockThemeColor(this: { id: string }, id: string) {
		this.id = id;
	}
	function MockThemeIcon(this: { id: string; color?: unknown }, id: string, color?: unknown) {
		this.id = id;
		this.color = color;
	}
	return { MockThemeColor, MockThemeIcon, treeHealthConfigValues: configValues };
});

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
				(key: string, defaultValue: unknown) => treeHealthConfigValues[key] ?? defaultValue,
			),
		})),
	},
}));

// ─── Imports (after mock) ────────────────────────────────────────────────────

import { ChannelNode, DeviceNode } from "../src/tree/tree-items";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDevice(overrides?: Partial<Device>): Device {
	return {
		serial: "TW-001",
		deviceId: "dev-1",
		label: "Test Device",
		type: "node",
		device: null,
		status: "online",
		battery: 80,
		batteryState: null,
		wifiStrength: null,
		firmware: "2.0.0",
		color: null,
		thumbnail: null,
		deviceDisplayUnits: null,
		iotDeviceId: null,
		iotCoreDeviceBlocked: null,
		recordingIntervalInSeconds: null,
		transmitIntervalInSeconds: null,
		readInterval: null,
		heartbeatInterval: null,
		temperatureDeltaTrigger: null,
		pendingLoad: null,
		batteryAlertSent: null,
		lastSeen: new Date(),
		lastTelemetrySaved: null,
		latestReading: null,
		lastWifiConnection: null,
		lastBluetoothConnection: null,
		sessionStart: null,
		sessionLabel: null,
		lastArchive: null,
		lastPurged: null,
		assignedToAccountOn: null,
		accountId: null,
		notes: null,
		public: null,
		publicLink: null,
		searModeEnabled: null,
		showSensorChannels: null,
		ringColors: null,
		gateway: null,
		fan: null,
		bigQuery: null,
		...overrides,
	};
}

function makeChannel(overrides?: Partial<DeviceChannel>): DeviceChannel {
	return {
		value: 72.5,
		units: "F",
		label: "Probe 1",
		status: "ok",
		type: "temperature",
		number: "1",
		enabled: true,
		color: null,
		lastSeen: new Date(),
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

describe("DeviceNode health display", () => {
	it("shows green icon for healthy online device", () => {
		const device = makeDevice({ status: "online", battery: 80 });
		const channels = [makeChannel()];
		const node = new DeviceNode(device, false, false, channels);

		const icon = node.iconPath as { id: string; color?: { id: string } };
		expect(icon.id).toBe("pulse");
		expect(icon.color?.id).toBe("charts.green");
	});

	it("shows warning icon and description for offline device", () => {
		const device = makeDevice({ status: "offline", battery: 80 });
		const channels = [makeChannel()];
		const node = new DeviceNode(device, false, false, channels);

		const icon = node.iconPath as { id: string; color?: { id: string } };
		expect(icon.id).toBe("warning");
		expect(icon.color?.id).toBe("charts.orange");
		expect(node.description).toContain("Warning");
	});

	it("shows critical error icon for critically low battery", () => {
		const device = makeDevice({ status: "online", battery: 2 });
		const channels = [makeChannel()];
		const node = new DeviceNode(device, false, false, channels);

		const icon = node.iconPath as { id: string; color?: { id: string } };
		expect(icon.id).toBe("error");
		expect(icon.color?.id).toBe("charts.red");
		expect(node.description).toContain("Critical");
	});

	it("alarm icon takes priority over health icon", () => {
		const device = makeDevice({ status: "offline", battery: 2 });
		const channels = [makeChannel()];
		const node = new DeviceNode(device, true, false, channels);

		const icon = node.iconPath as { id: string; color?: { id: string } };
		expect(icon.id).toBe("warning");
		expect(icon.color?.id).toBe("charts.red");
	});

	it("shows warning description for stale reading", () => {
		const now = new Date();
		const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
		const device = makeDevice({ status: "online", battery: 80, lastSeen: tenMinutesAgo });
		const channels = [makeChannel({ lastSeen: tenMinutesAgo })];
		const node = new DeviceNode(device, false, false, channels);

		expect(node.description).toContain("Warning");
	});

	it("shows warning description for weak Wi-Fi", () => {
		const device = makeDevice({ status: "online", battery: 80, wifiStrength: -78 });
		const channels = [makeChannel()];
		const node = new DeviceNode(device, false, false, channels);

		expect(node.description).toContain("Warning");
	});

	it("shows no health indicator when all is well", () => {
		const device = makeDevice({ status: "online", battery: 80 });
		const channels = [makeChannel()];
		const node = new DeviceNode(device, false, false, channels);

		expect(node.description).not.toContain("Warning");
		expect(node.description).not.toContain("Critical");
	});
});

describe("ChannelNode stale display", () => {
	it("shows (stale) suffix when channel reading is old", () => {
		const now = new Date();
		const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
		const channel = makeChannel({ lastSeen: tenMinutesAgo });
		const node = new ChannelNode(channel, "TW-001", 0);

		expect(node.description).toContain("(stale)");
	});

	it("does not show (stale) for fresh readings", () => {
		const channel = makeChannel({ lastSeen: new Date() });
		const node = new ChannelNode(channel, "TW-001", 0);

		expect(node.description).not.toContain("(stale)");
	});

	it("does not show (stale) when lastSeen is null", () => {
		const channel = makeChannel({ lastSeen: null });
		const node = new ChannelNode(channel, "TW-001", 0);

		expect(node.description).not.toContain("(stale)");
	});

	it("shows temperature value alongside stale suffix", () => {
		const now = new Date();
		const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
		const channel = makeChannel({ value: 225, units: "F", lastSeen: tenMinutesAgo });
		const node = new ChannelNode(channel, "TW-001", 0);

		expect(node.description).toContain("225°F");
		expect(node.description).toContain("(stale)");
	});
});
