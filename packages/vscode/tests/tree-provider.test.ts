import type { Archive, Device, DeviceChannel, User } from "thermoworks-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── VS Code mock ────────────────────────────────────────────────────────────

const {
	mockExecuteCommand,
	mockShowInputBox,
	mockShowErrorMessage,
	mockShowInformationMessage,
	mockOpenExternal,
	mockGetConfiguration,
	mockOnDidChangeConfiguration,
	mockCreateOutputChannel,
	mockOutputChannel,
	configValues,
} = vi.hoisted(() => {
	const configValues: Record<string, unknown> = {};
	const mockOutputChannel = {
		clear: vi.fn(),
		appendLine: vi.fn(),
		show: vi.fn(),
		dispose: vi.fn(),
	};

	return {
		mockExecuteCommand: vi.fn(),
		mockShowInputBox: vi.fn(),
		mockShowErrorMessage: vi.fn(),
		mockShowInformationMessage: vi.fn(),
		mockOpenExternal: vi.fn(),
		configValues,
		mockGetConfiguration: vi.fn(() => ({
			get: vi.fn((key: string, defaultValue: unknown) => configValues[key] ?? defaultValue),
		})),
		mockOnDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
		mockOutputChannel,
		mockCreateOutputChannel: vi.fn(() => mockOutputChannel),
	};
});

vi.mock("vscode", () => ({
	ThemeColor: function ThemeColor(this: { id: string }, id: string) {
		this.id = id;
	},
	ThemeIcon: function ThemeIcon(
		this: { id: string; color?: unknown },
		id: string,
		color?: unknown,
	) {
		this.id = id;
		this.color = color;
	},
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
	EventEmitter: class {
		private handlers: Array<(...args: unknown[]) => void> = [];
		event = (handler: (...args: unknown[]) => void) => {
			this.handlers.push(handler);
			return { dispose: () => {} };
		};
		fire(data?: unknown) {
			for (const h of this.handlers) h(data);
		}
		dispose() {}
	},
	commands: { executeCommand: mockExecuteCommand },
	window: {
		showInputBox: mockShowInputBox,
		showErrorMessage: mockShowErrorMessage,
		showInformationMessage: mockShowInformationMessage,
		createOutputChannel: mockCreateOutputChannel,
	},
	workspace: {
		getConfiguration: mockGetConfiguration,
		onDidChangeConfiguration: mockOnDidChangeConfiguration,
	},
	env: { openExternal: mockOpenExternal },
}));

// ─── SDK mock ────────────────────────────────────────────────────────────────

const {
	mockGetUser,
	mockGetDevices,
	mockGetAllDeviceChannels,
	mockGetEvents,
	mockGetArchives,
	mockGetAverageTemperature,
	mockGetAccount,
	mockGetDataUsage,
	mockGetDataUsageByDevice,
	mockGetCalibration,
	mockGetFirmwareInfo,
	mockGetDeviceGroups,
	mockClose,
} = vi.hoisted(() => ({
	mockGetUser: vi.fn(),
	mockGetDevices: vi.fn(),
	mockGetAllDeviceChannels: vi.fn(),
	mockGetEvents: vi.fn(),

	mockGetArchives: vi.fn(),
	mockGetAverageTemperature: vi.fn(),
	mockGetAccount: vi.fn(),
	mockGetDataUsage: vi.fn(),
	mockGetDataUsageByDevice: vi.fn(),
	mockGetCalibration: vi.fn(),
	mockGetFirmwareInfo: vi.fn(),
	mockGetDeviceGroups: vi.fn(),
	mockClose: vi.fn(),
}));

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		getUser = mockGetUser;
		getDevices = mockGetDevices;
		getAllDeviceChannels = mockGetAllDeviceChannels;
		getEvents = mockGetEvents;

		getArchives = mockGetArchives;
		getAverageTemperature = mockGetAverageTemperature;
		getAccount = mockGetAccount;
		getDataUsage = mockGetDataUsage;
		getDataUsageByDevice = mockGetDataUsageByDevice;
		getCalibration = mockGetCalibration;
		getDeviceGroups = mockGetDeviceGroups;
		close = mockClose;
	},
	getChannelAlarmState: () => null,
	formatTimeAgo: (_date: Date) => "just now",
	assessDeviceHealth: (_device: unknown, _channels: unknown) => ({ overall: "good", issues: [] }),
	isChannelStale: () => false,
}));

const { mockDeviceStreamSetDevices, mockDeviceStreamDispose, deviceStreamInstances } = vi.hoisted(
	() => ({
		mockDeviceStreamSetDevices: vi.fn(),
		mockDeviceStreamDispose: vi.fn(),
		deviceStreamInstances: [] as Array<{
			fetchChannels: (serial: string) => Promise<DeviceChannel[]>;
			callbacks: { onSnapshot: (snapshot: unknown) => void };
			intervalMs: number;
		}>,
	}),
);

vi.mock("../src/device-stream", () => ({
	DeviceStream: class {
		fetchChannels: (serial: string) => Promise<DeviceChannel[]>;
		callbacks: { onSnapshot: (snapshot: unknown) => void };
		intervalMs: number;

		constructor(
			fetchChannels: (serial: string) => Promise<DeviceChannel[]>,
			callbacks: { onSnapshot: (snapshot: unknown) => void },
			intervalMs: number,
		) {
			this.fetchChannels = fetchChannels;
			this.callbacks = callbacks;
			this.intervalMs = intervalMs;
			deviceStreamInstances.push(this);
		}

		setDevices = mockDeviceStreamSetDevices;
		dispose = mockDeviceStreamDispose;
	},
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { DEMO_DEVICES, DEMO_USER } from "../src/demo-data";
import { ThermoworksTreeProvider } from "../src/tree/thermoworks-tree-provider";
import {
	AccountNode,
	ArchiveChannelNode,
	ArchiveNode,
	ArchivesFolderNode,
	CalibrationFolderNode,
	CalibrationRecordNode,
	ChannelsFolderNode,
	DetailsFolderNode,
	DeviceGroupFolderNode,
	DeviceNode,
	DevicesFolderNode,
	ErrorNode,
} from "../src/tree/tree-items";

// ─── Fixtures ────────────────────────────────────────────────────────────────

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
	lastLogin: null,
	appVersion: null,
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
	batteryState: null,
	wifiStrength: null,
	firmware: "1.2.3",
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

const mockChannel: DeviceChannel = {
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
};

const mockSecondDevice: Device = {
	...mockDevice,
	serial: "XYZ789",
	deviceId: "dev-2",
	label: "Grill",
	type: "node",
	firmware: "3.0.0",
};

const mockSecondChannel: DeviceChannel = {
	...mockChannel,
	label: "Food",
	number: "2",
	value: 175,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createProvider(): ThermoworksTreeProvider {
	// Construct with a mock credential store
	const credStore = {
		getCredentials: vi.fn(),
		storeCredentials: vi.fn(),
		deleteCredentials: vi.fn(),
	};

	// Construct with a mock client manager that returns a mock SDK client
	const clientManager = {
		getClient: vi.fn(() => ({
			getUser: mockGetUser,
			getDevices: mockGetDevices,
			getAllDeviceChannels: mockGetAllDeviceChannels,
			getEvents: mockGetEvents,

			getArchives: mockGetArchives,
			getAverageTemperature: mockGetAverageTemperature,
			getAccount: mockGetAccount,
			getDataUsage: mockGetDataUsage,
			getDataUsageByDevice: mockGetDataUsageByDevice,
			getCalibration: mockGetCalibration,
			getFirmwareInfo: mockGetFirmwareInfo,
			getDeviceGroups: mockGetDeviceGroups,
			close: mockClose,
		})),
		close: vi.fn(),
	};

	return new ThermoworksTreeProvider(credStore as any, clientManager as any);
}

function getCredStoreMock(provider: ThermoworksTreeProvider): any {
	return (provider as any).credentialStore;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ThermoworksTreeProvider", () => {
	let provider: ThermoworksTreeProvider;

	beforeEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
		for (const key of Object.keys(configValues)) {
			delete configValues[key];
		}
		deviceStreamInstances.length = 0;
		provider = createProvider();
	});

	describe("getChildren (root)", () => {
		it("returns empty array when not authenticated", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue(null);
			const children = await provider.getChildren();
			expect(children).toEqual([]);
		});

		it("returns AccountNode and DevicesFolderNode when authenticated", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices.mockResolvedValue([mockDevice]);

			const children = await provider.getChildren();
			expect(children.length).toBe(2);
			expect(children[0]?.label).toBe("Account");
			expect(children[1]?.label).toBe("Devices");
			expect(children[0]?.label).toBeDefined();
			expect(children[1]?.label).toBe("Devices");
		});

		it("returns ErrorNode on SDK failure", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockRejectedValue(new Error("Network timeout"));

			const children = await provider.getChildren();
			expect(children.length).toBe(1);
			expect(children[0]?.label).toBe("Network timeout");
		});
	});

	describe("signIn", () => {
		it("stores credentials and sets context on success", async () => {
			mockShowInputBox.mockResolvedValueOnce("user@test.com").mockResolvedValueOnce("secret");
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices.mockResolvedValue([]);

			const credStore = getCredStoreMock(provider);
			credStore.storeCredentials.mockResolvedValue(undefined);
			credStore.getCredentials.mockResolvedValue({ email: "user@test.com", password: "secret" });

			await provider.signIn();

			expect(credStore.storeCredentials).toHaveBeenCalledWith("user@test.com", "secret");
			expect(mockExecuteCommand).toHaveBeenCalledWith(
				"setContext",
				"thermoworks.isAuthenticated",
				true,
			);
			expect(mockShowInformationMessage).toHaveBeenCalledWith(
				"ThermoWorks: Signed in successfully.",
			);
		});

		it("shows error on auth failure", async () => {
			mockShowInputBox.mockResolvedValueOnce("user@test.com").mockResolvedValueOnce("wrong");
			mockGetUser.mockRejectedValue(new Error("Invalid credentials"));

			await provider.signIn();

			expect(mockShowErrorMessage).toHaveBeenCalledWith(
				"ThermoWorks: Login failed - check your email and password.",
			);
		});

		it("does nothing if user cancels email input", async () => {
			mockShowInputBox.mockResolvedValueOnce(undefined);
			await provider.signIn();
			expect(getCredStoreMock(provider).storeCredentials).not.toHaveBeenCalled();
		});

		it("does nothing if user cancels password input", async () => {
			mockShowInputBox.mockResolvedValueOnce("user@test.com").mockResolvedValueOnce(undefined);
			await provider.signIn();
			expect(getCredStoreMock(provider).storeCredentials).not.toHaveBeenCalled();
		});
	});

	describe("signOut", () => {
		it("clears credentials and sets context to false", async () => {
			const credStore = getCredStoreMock(provider);
			credStore.deleteCredentials.mockResolvedValue(undefined);

			await provider.signOut();

			expect(credStore.deleteCredentials).toHaveBeenCalled();
			expect(mockExecuteCommand).toHaveBeenCalledWith(
				"setContext",
				"thermoworks.isAuthenticated",
				false,
			);
			expect(mockShowInformationMessage).toHaveBeenCalledWith("ThermoWorks: Signed out.");
		});
	});

	describe("openCloud", () => {
		it("opens external URL", () => {
			provider.openCloud();
			expect(mockOpenExternal).toHaveBeenCalled();
		});
	});

	describe("refresh", () => {
		it("clears all caches", async () => {
			// Load data first
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices.mockResolvedValue([mockDevice]);
			mockGetAllDeviceChannels.mockResolvedValue([mockChannel]);

			await provider.getChildren();
			expect(mockGetDevices).toHaveBeenCalledTimes(1);

			// Refresh should clear cache, next getChildren should re-fetch
			await provider.refresh();
			await provider.getChildren();
			expect(mockGetDevices).toHaveBeenCalledTimes(2);
		});
	});

	describe("device caching", () => {
		it("uses cached devices on subsequent calls within TTL", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices.mockResolvedValue([mockDevice]);
			mockGetAllDeviceChannels.mockResolvedValue([mockChannel]);

			await provider.getChildren();
			await provider.getChildren();

			// getDevices called only once due to cache
			expect(mockGetDevices).toHaveBeenCalledTimes(1);
		});
	});

	describe("initialize", () => {
		it("sets context to true when credentials exist", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});

			await provider.initialize();
			expect(mockExecuteCommand).toHaveBeenCalledWith(
				"setContext",
				"thermoworks.isAuthenticated",
				true,
			);
		});

		it("sets context to false when no credentials", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue(null);

			await provider.initialize();
			expect(mockExecuteCommand).toHaveBeenCalledWith(
				"setContext",
				"thermoworks.isAuthenticated",
				false,
			);
		});
	});

	describe("dispose", () => {
		it("cleans up without throwing", () => {
			expect(() => provider.dispose()).not.toThrow();
		});

		it("returns empty array after disposal", async () => {
			provider.dispose();
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "a@b.com",
				password: "x",
			});
			const children = await provider.getChildren();
			expect(children).toEqual([]);
		});
	});

	describe("getChildren (archives folder)", () => {
		const mockArchive: Archive = {
			id: "arch-001",
			start: new Date("2026-01-01T08:00:00Z"),
			end: new Date("2026-01-01T14:30:00Z"),
			count: 390,
			type: "session",
			label: "Brisket Cook",
			deviceLabel: "Smoker",
			notes: null,
			createdOn: new Date("2026-01-01T14:31:00Z"),
			public: false,
			publicLink: null,
			filename: null,
			channels: [
				{
					number: "1",
					label: "Pit",
					units: "F",
					value: 225,
					status: "ok",
					enabled: true,
					color: null,
					type: "temperature",
					alarmHigh: null,
					alarmLow: null,
					minimum: { value: 180, units: "F", date: null },
					maximum: { value: 275, units: "F", date: null },
					recentReadings: [],
				},
			],
		};

		it("returns archive nodes when expanding archives folder", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetArchives.mockResolvedValue([mockArchive]);

			const folder = new ArchivesFolderNode("ABC123");
			const children = await provider.getChildren(folder);

			expect(children.length).toBe(1);
			expect(children[0]).toBeInstanceOf(ArchiveNode);
			expect((children[0] as ArchiveNode).label).toBe("Brisket Cook");
			expect(mockGetArchives).toHaveBeenCalledWith("ABC123", { limit: 20 });
		});

		it("returns error node when no archives exist", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetArchives.mockResolvedValue([]);

			const folder = new ArchivesFolderNode("ABC123");
			const children = await provider.getChildren(folder);

			expect(children.length).toBe(1);
			expect(children[0]?.label).toBe("No archived sessions");
		});

		it("returns error node on API failure", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetArchives.mockRejectedValue(new Error("Network timeout"));

			const folder = new ArchivesFolderNode("ABC123");
			const children = await provider.getChildren(folder);

			expect(children.length).toBe(1);
			expect(children[0]?.label).toBe("Network timeout");
		});

		it("returns channel nodes when expanding an archive", async () => {
			const archiveNode = new ArchiveNode(mockArchive, "ABC123");
			const children = await provider.getChildren(archiveNode);

			expect(children.length).toBe(1);
			expect(children[0]).toBeInstanceOf(ArchiveChannelNode);
			expect((children[0] as ArchiveChannelNode).label).toBe("Pit");
		});

		it("returns error when archive has no channels", async () => {
			const emptyArchive: Archive = { ...mockArchive, channels: [] };
			const archiveNode = new ArchiveNode(emptyArchive, "ABC123");
			const children = await provider.getChildren(archiveNode);

			expect(children.length).toBe(1);
			expect(children[0]?.label).toBe("No channel data");
		});

		it("returns error when archive channels is null", async () => {
			const nullArchive: Archive = { ...mockArchive, channels: null };
			const archiveNode = new ArchiveNode(nullArchive, "ABC123");
			const children = await provider.getChildren(archiveNode);

			expect(children.length).toBe(1);
			expect(children[0]?.label).toBe("No channel data");
		});

		it("caches archives and reuses on subsequent expand", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetArchives.mockResolvedValue([mockArchive]);

			const folder = new ArchivesFolderNode("ABC123");
			await provider.getChildren(folder);
			await provider.getChildren(folder);

			// Only one API call due to cache
			expect(mockGetArchives).toHaveBeenCalledTimes(1);
		});

		it("refreshArchives clears cache and re-fetches", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetArchives.mockResolvedValue([mockArchive]);

			const folder = new ArchivesFolderNode("ABC123");
			await provider.getChildren(folder);
			expect(mockGetArchives).toHaveBeenCalledTimes(1);

			await provider.refreshArchives();
			await provider.getChildren(folder);
			expect(mockGetArchives).toHaveBeenCalledTimes(2);
		});
	});

	describe("getChildren (account enrichment)", () => {
		it("includes account type and data usage when available", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices.mockResolvedValue([mockDevice]);
			mockGetAccount.mockResolvedValue({
				accountId: "account-1",
				name: "Test Account",
				type: "Pro",
				createdOn: new Date("2024-01-15"),
				exportVersion: 2,
			});
			mockGetDataUsage.mockResolvedValue({
				totalBytes: 1048576,
				formattedSize: "1.0 MB",
			});
			mockGetDataUsageByDevice.mockResolvedValue([
				{ deviceId: "ABC123", bytes: 524288, formattedSize: "512 KB" },
			]);

			// Get root, then expand AccountNode
			const root = await provider.getChildren();
			const accountNode = root[0];
			const children = await provider.getChildren(accountNode);

			// Should have: Email, Name, Units, Timezone, Account Type, Created, Data Usage, device entry, action
			const labels = children.map((c) => c.label);
			expect(labels).toContain("Account Type: Pro");
			expect(labels).toContain("Data Usage: 1.0 MB");
		});

		it("degrades gracefully when account API fails", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices.mockResolvedValue([mockDevice]);
			mockGetAccount.mockRejectedValue(new Error("Not available"));
			mockGetDataUsage.mockRejectedValue(new Error("Not available"));

			const root = await provider.getChildren();
			const accountNode = root[0];
			const children = await provider.getChildren(accountNode);

			// Should still have base info + action, no crash
			const labels = children.map((c) => c.label);
			expect(labels).toContain("Email: test@example.com");
			expect(labels).toContain("Open ThermoWorks Cloud");
			expect(labels).not.toContain("Account Type: Pro");
		});
	});

	describe("getChildren (device average temperature)", () => {
		it("includes average temp when available", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices.mockResolvedValue([mockDevice]);
			mockGetAllDeviceChannels.mockResolvedValue([mockChannel]);
			mockGetFirmwareInfo.mockResolvedValue(null);
			mockGetAverageTemperature.mockResolvedValue({ value: 220.5, units: "F" });

			// Populate device cache via root
			await provider.getChildren();

			const deviceNode = new DeviceNode(mockDevice, false);
			const children = await provider.getChildren(deviceNode);

			// Children are now folder nodes; find the DetailsFolderNode and check its contents
			const detFolder = children.find((c) => c instanceof DetailsFolderNode) as DetailsFolderNode;
			expect(detFolder).toBeDefined();
			const labels = detFolder.details.map((c) => c.label);
			expect(labels).toContain("Avg Temp: 221\u00B0F");
		});

		it("omits average temp when null", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices.mockResolvedValue([mockDevice]);
			mockGetAllDeviceChannels.mockResolvedValue([mockChannel]);
			mockGetAverageTemperature.mockResolvedValue(null);

			await provider.getChildren();

			const deviceNode = new DeviceNode(mockDevice, false);
			const children = await provider.getChildren(deviceNode);

			const labels = children.map((c) => c.label as string);
			const hasAvg = labels.some((l) => l.startsWith("Avg Temp"));
			expect(hasAvg).toBe(false);
		});

		it("omits average temp gracefully on error", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices.mockResolvedValue([mockDevice]);
			mockGetAllDeviceChannels.mockResolvedValue([mockChannel]);
			mockGetAverageTemperature.mockRejectedValue(new Error("Timeout"));

			await provider.getChildren();

			const deviceNode = new DeviceNode(mockDevice, false);
			const children = await provider.getChildren(deviceNode);

			// Should still render without crashing
			expect(children.length).toBeGreaterThan(0);
			const labels = children.map((c) => c.label as string);
			const hasAvg = labels.some((l) => l.startsWith("Avg Temp"));
			expect(hasAvg).toBe(false);
		});
	});

	describe("getChildren (calibration folder)", () => {
		it("returns calibration records when expanding folder", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetCalibration.mockResolvedValue([
				{
					calibrationId: "cal-001",
					calibrationDate: new Date("2025-06-01"),
					deviceId: "ABC123",
					sessionId: null,
					performedBy: "Tech",
					manager: null,
					referenceDetail: null,
					statedAccuracy: null,
					ambientTemperature: null,
					ambientHumidity: null,
					result: "Pass",
					lowPointAdjustments: [],
					highPointReference: [],
				},
			]);

			const folder = new CalibrationFolderNode("ABC123");
			const children = await provider.getChildren(folder);

			expect(children.length).toBe(1);
			expect(children[0]).toBeInstanceOf(CalibrationRecordNode);
			expect(mockGetCalibration).toHaveBeenCalledWith("ABC123");
		});

		it("returns error node when no records", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetCalibration.mockResolvedValue([]);

			const folder = new CalibrationFolderNode("ABC123");
			const children = await provider.getChildren(folder);

			expect(children.length).toBe(1);
			expect(children[0]?.label).toBe("No calibration records");
		});

		it("returns error node on API failure", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetCalibration.mockRejectedValue(new Error("Not found"));

			const folder = new CalibrationFolderNode("ABC123");
			const children = await provider.getChildren(folder);

			expect(children.length).toBe(1);
			expect(children[0]?.label).toBe("No calibration records");
		});
	});

	describe("getTreeItem", () => {
		it("returns the same node instance", () => {
			const node = new DeviceNode(mockDevice, false);
			expect(provider.getTreeItem(node)).toBe(node);
		});
	});

	describe("persisted cache", () => {
		it("rehydrates persisted device cache from global state", async () => {
			const state = {
				get: vi.fn(() => ({
					devices: [{ ...mockDevice, lastSeen: mockDevice.lastSeen?.toISOString() }] as any[],
					fetchedAt: Date.now(),
				})),
				update: vi.fn(),
			};

			provider.setGlobalState(state as any);
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);

			const children = await provider.getChildren();

			expect(children[1]).toBeInstanceOf(DevicesFolderNode);
			expect((children[1] as DevicesFolderNode).description).toBe("1");
			expect(mockGetDevices).not.toHaveBeenCalled();
		});
	});

	describe("demo mode", () => {
		it("returns demo account and device folder at the root", async () => {
			provider.enterDemoMode("normal");

			const children = await provider.getChildren();

			expect(children[0]).toBeInstanceOf(AccountNode);
			expect(children[1]).toBeInstanceOf(DevicesFolderNode);
			expect((children[1] as DevicesFolderNode).description).toBe(String(DEMO_DEVICES.length));
		});

		it("returns demo devices without calling the SDK", async () => {
			provider.enterDemoMode("high");

			const children = await provider.getChildren(new DevicesFolderNode(DEMO_DEVICES.length));

			expect(children).toHaveLength(DEMO_DEVICES.length);
			expect(children.every((child) => child instanceof DeviceNode)).toBe(true);
			expect(children.map((child) => child.label)).toEqual(
				expect.arrayContaining(DEMO_DEVICES.map((device) => device.label)),
			);
			expect(mockGetDevices).not.toHaveBeenCalled();
			expect(mockGetAllDeviceChannels).not.toHaveBeenCalled();
		});

		it("uses demo user details when expanding the account node", async () => {
			provider.enterDemoMode("normal");

			const children = await provider.getChildren(new AccountNode(DEMO_USER));

			expect(children.map((child) => child.label)).toEqual(
				expect.arrayContaining([
					`Email: ${DEMO_USER.email}`,
					`Name: ${DEMO_USER.displayName}`,
					"Open ThermoWorks Cloud",
				]),
			);
			expect(mockGetAccount).not.toHaveBeenCalled();
			expect(mockGetDataUsage).not.toHaveBeenCalled();
		});
	});

	describe("cache ttl behavior", () => {
		it("returns stale devices first and refreshes them in the background", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices
				.mockResolvedValueOnce([mockDevice])
				.mockResolvedValueOnce([mockDevice, mockSecondDevice]);

			const first = await provider.getChildren();
			expect((first[1] as DevicesFolderNode).description).toBe("1");

			vi.setSystemTime(new Date("2026-01-01T00:06:00Z"));
			const stale = await provider.getChildren();
			expect((stale[1] as DevicesFolderNode).description).toBe("1");

			await vi.waitFor(() => {
				expect(mockGetDevices).toHaveBeenCalledTimes(2);
			});

			const refreshed = await provider.getChildren();
			expect((refreshed[1] as DevicesFolderNode).description).toBe("2");
		});

		it("returns stale channels first and refreshes them in the background", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices.mockResolvedValue([mockDevice]);
			mockGetAllDeviceChannels
				.mockResolvedValueOnce([mockChannel])
				.mockResolvedValueOnce([mockChannel, mockSecondChannel]);
			mockGetAverageTemperature.mockResolvedValue(null);

			await provider.getChildren();

			const first = await provider.getChildren(new DeviceNode(mockDevice, false));
			const firstChannels = first.find(
				(child) => child instanceof ChannelsFolderNode,
			) as ChannelsFolderNode;
			expect(firstChannels.channels).toHaveLength(1);

			vi.setSystemTime(new Date("2026-01-01T00:01:30Z"));
			const stale = await provider.getChildren(new DeviceNode(mockDevice, false));
			const staleChannels = stale.find(
				(child) => child instanceof ChannelsFolderNode,
			) as ChannelsFolderNode;
			expect(staleChannels.channels).toHaveLength(1);

			await vi.waitFor(() => {
				expect(mockGetAllDeviceChannels).toHaveBeenCalledTimes(2);
			});

			const refreshed = await provider.getChildren(new DeviceNode(mockDevice, false));
			const refreshedChannels = refreshed.find(
				(child) => child instanceof ChannelsFolderNode,
			) as ChannelsFolderNode;
			expect(refreshedChannels.channels).toHaveLength(2);
		});

		it("reuses firmware info until its ttl expires", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetAllDeviceChannels.mockResolvedValue([mockChannel]);
			mockGetFirmwareInfo.mockResolvedValue({ version: "9.9.9" });
			(provider as any).deviceCache = { devices: [mockDevice], fetchedAt: Date.now() };

			const folder = new DevicesFolderNode(1);
			await provider.getChildren(folder);
			await provider.getChildren(folder);

			expect(mockGetFirmwareInfo).toHaveBeenCalledTimes(1);

			vi.setSystemTime(new Date("2026-01-01T02:00:00Z"));
			(provider as any).deviceCache = { devices: [mockDevice], fetchedAt: Date.now() };

			await provider.getChildren(folder);

			expect(mockGetFirmwareInfo).toHaveBeenCalledTimes(2);
		});
	});

	describe("device grouping", () => {
		it("returns grouped folders and ungrouped devices when grouped view is enabled", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices.mockResolvedValue([mockDevice, mockSecondDevice]);
			mockGetAllDeviceChannels.mockResolvedValue([mockChannel]);
			mockGetDeviceGroups.mockResolvedValue([
				{ id: "group-1", name: "Kitchen", devices: [mockDevice.serial, "MISSING"] },
			]);

			await provider.getChildren();
			provider.toggleDeviceView();

			expect(mockExecuteCommand).toHaveBeenCalledWith(
				"setContext",
				"thermoworks.groupedView",
				true,
			);

			const children = await provider.getChildren(new DevicesFolderNode(2));
			expect(children[0]).toBeInstanceOf(DeviceGroupFolderNode);
			expect(children[0]?.label).toBe("Kitchen");
			expect(children[1]).toBeInstanceOf(DeviceNode);
			expect(children[1]?.label).toBe("Grill");

			const groupedChildren = await provider.getChildren(children[0] as DeviceGroupFolderNode);
			expect(groupedChildren).toHaveLength(1);
			expect(groupedChildren[0]?.label).toBe("Smoker");
		});
	});

	describe("error handling", () => {
		it("returns an error node when fetching device channels fails", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices.mockResolvedValue([mockDevice]);
			mockGetAllDeviceChannels.mockRejectedValue(new Error("Channel fetch failed"));

			await provider.getChildren();
			const children = await provider.getChildren(new DevicesFolderNode(1));

			expect(children).toHaveLength(1);
			expect(children[0]).toBeInstanceOf(ErrorNode);
			expect(children[0]?.label).toBe("Channel fetch failed");
		});
	});

	describe("refresh invalidation", () => {
		it("clears channel cache so device children are fetched again", async () => {
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetUser.mockResolvedValue(mockUser);
			mockGetDevices.mockResolvedValue([mockDevice]);
			mockGetAllDeviceChannels.mockResolvedValue([mockChannel]);
			mockGetAverageTemperature.mockResolvedValue(null);

			await provider.getChildren();
			await provider.getChildren(new DeviceNode(mockDevice, false));
			await provider.getChildren(new DeviceNode(mockDevice, false));
			expect(mockGetAllDeviceChannels).toHaveBeenCalledTimes(1);

			await provider.refresh();
			await provider.getChildren(new DeviceNode(mockDevice, false));
			expect(mockGetAllDeviceChannels).toHaveBeenCalledTimes(2);
		});
	});

	describe("stream lifecycle", () => {
		it("starts a device stream and syncs device serials when streaming is enabled", async () => {
			configValues.streaming = true;
			configValues.refreshInterval = 1;
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetDevices.mockResolvedValue([mockDevice]);

			const context = { subscriptions: [] as unknown[] };
			provider.startAutoRefresh(context as any);

			expect(deviceStreamInstances).toHaveLength(1);
			expect(deviceStreamInstances[0]?.intervalMs).toBe(15_000);
			await vi.waitFor(() => {
				expect(mockDeviceStreamSetDevices).toHaveBeenCalledWith([mockDevice.serial]);
			});
			expect(context.subscriptions).toHaveLength(1);
		});

		it("clears stream devices in demo mode and resyncs them when demo mode exits", async () => {
			configValues.streaming = true;
			getCredStoreMock(provider).getCredentials.mockResolvedValue({
				email: "test@example.com",
				password: "pass",
			});
			mockGetDevices.mockResolvedValue([mockDevice]);

			provider.startAutoRefresh({ subscriptions: [] } as any);
			await vi.waitFor(() => {
				expect(mockDeviceStreamSetDevices).toHaveBeenCalledWith([mockDevice.serial]);
			});

			mockDeviceStreamSetDevices.mockClear();
			provider.enterDemoMode("normal");
			expect(mockDeviceStreamSetDevices).toHaveBeenCalledWith([]);

			mockDeviceStreamSetDevices.mockClear();
			mockGetDevices.mockResolvedValue([mockSecondDevice]);
			(provider as any).deviceCache = undefined;
			provider.exitDemoMode();
			await vi.waitFor(() => {
				expect(mockDeviceStreamSetDevices).toHaveBeenCalledWith([mockSecondDevice.serial]);
			});
		});
	});

	describe("showArchiveDetails", () => {
		it("writes archive details to an output channel", () => {
			const archive: Archive = {
				id: "arch-001",
				start: new Date("2026-01-01T08:00:00Z"),
				end: new Date("2026-01-01T14:30:00Z"),
				count: 390,
				type: "session",
				label: "Brisket Cook",
				deviceLabel: "Smoker",
				notes: "Wrapped at 165F",
				createdOn: new Date("2026-01-01T14:31:00Z"),
				public: false,
				publicLink: null,
				filename: null,
				channels: [
					{
						number: "1",
						label: "Pit",
						units: "F",
						value: 225,
						status: "ok",
						enabled: true,
						color: null,
						type: "temperature",
						alarmHigh: null,
						alarmLow: null,
						minimum: { value: 180, units: "F", date: null },
						maximum: { value: 275, units: "F", date: null },
						recentReadings: [],
					},
				],
			};

			provider.showArchiveDetails(archive);

			expect(mockCreateOutputChannel).toHaveBeenCalledWith("ThermoWorks Archives");
			expect(mockOutputChannel.clear).toHaveBeenCalled();
			expect(mockOutputChannel.appendLine).toHaveBeenCalledWith("=== Brisket Cook ===");
			expect(mockOutputChannel.show).toHaveBeenCalledWith(true);
		});
	});
});
