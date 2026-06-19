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
} = vi.hoisted(() => ({
	mockExecuteCommand: vi.fn(),
	mockShowInputBox: vi.fn(),
	mockShowErrorMessage: vi.fn(),
	mockShowInformationMessage: vi.fn(),
	mockOpenExternal: vi.fn(),
	mockGetConfiguration: vi.fn(() => ({
		get: (_key: string, defaultValue: number) => defaultValue,
	})),
}));

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
	},
	workspace: {
		getConfiguration: mockGetConfiguration,
		onDidChangeConfiguration: vi.fn(() => ({ dispose: () => {} })),
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
	mockClose,
} = vi.hoisted(() => ({
	mockGetUser: vi.fn(),
	mockGetDevices: vi.fn(),
	mockGetAllDeviceChannels: vi.fn(),
	mockGetEvents: vi.fn(),

	mockGetArchives: vi.fn(),
	mockClose: vi.fn(),
}));

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		getUser = mockGetUser;
		getDevices = mockGetDevices;
		getAllDeviceChannels = mockGetAllDeviceChannels;
		getEvents = mockGetEvents;

		getArchives = mockGetArchives;
		close = mockClose;
	},
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { ThermoworksTreeProvider } from "../src/tree/thermoworks-tree-provider";
import { ArchiveChannelNode, ArchiveNode, ArchivesFolderNode } from "../src/tree/tree-items";

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createProvider(): ThermoworksTreeProvider {
	const _mockSecrets = {
		get: vi.fn(),
		store: vi.fn(),
		delete: vi.fn(),
		onDidChange: vi.fn(() => ({ dispose: () => {} })),
	};

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
		vi.clearAllMocks();
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
			expect(mockGetArchives).toHaveBeenCalledWith("ABC123", { limit: 10 });
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
});
