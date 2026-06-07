import type { Device, DeviceChannel, DeviceEvent } from "thermoworks-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── VS Code mock ────────────────────────────────────────────────────────────

vi.mock("vscode", () => ({
	chat: {
		createChatParticipant: vi.fn(() => ({
			iconPath: undefined,
			dispose: vi.fn(),
		})),
	},
	extensions: {
		getExtension: vi.fn(() => ({
			extensionUri: { fsPath: "/mock/extension" },
		})),
	},
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path })),
		joinPath: vi.fn((_base: unknown, ...segments: string[]) => ({
			fsPath: `/mock/extension/${segments.join("/")}`,
		})),
	},
}));

// ─── SDK mock ────────────────────────────────────────────────────────────────

const { mockGetDevices, mockGetAllDeviceChannels, mockGetEvents, mockClose } = vi.hoisted(() => ({
	mockGetDevices: vi.fn(),
	mockGetAllDeviceChannels: vi.fn(),
	mockGetEvents: vi.fn(),
	mockClose: vi.fn(),
}));

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		getDevices = mockGetDevices;
		getAllDeviceChannels = mockGetAllDeviceChannels;
		getEvents = mockGetEvents;
		close = mockClose;
	},
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { createChatHandler, detectIntent, registerChatParticipant } from "../src/chat-participant";
import { ClientManager } from "../src/client-manager";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockDevice: Device = {
	serial: "ABC123",
	deviceId: "dev-1",
	label: "Smoker",
	type: "signals",
	device: null,
	status: "online",
	battery: 85,
	batteryState: null,
	wifiStrength: -45,
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
	lastSeen: new Date("2026-06-07T12:00:00Z"),
	lastTelemetrySaved: null,
	latestReading: null,
	lastWifiConnection: null,
	lastBluetoothConnection: null,
	sessionStart: new Date("2026-06-07T08:00:00Z"),
	sessionLabel: "Brisket",
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

const mockChannelAlarming: DeviceChannel = {
	...mockChannel,
	value: 285,
	label: "Meat",
	number: "2",
	alarmHigh: {
		enabled: true,
		alarming: true,
		muted: false,
		value: 275,
		units: "F",
		lastNotified: null,
	},
	alarmLow: null,
};

const mockEventData: DeviceEvent = {
	id: "evt-1",
	eventType: "High Alarm",
	severity: 3,
	eventTime: new Date("2026-06-07T11:30:00Z"),
	deviceId: "ABC123",
	channelId: "1",
	accountId: "account-1",
	valueBefore: "270",
	valueAfter: "285",
	groups: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockStream() {
	const lines: string[] = [];
	return {
		markdown: vi.fn((text: string) => {
			lines.push(text);
		}),
		lines,
	};
}

function createMockCredentialStore(hasCredentials: boolean) {
	return {
		getCredentials: vi.fn(async () =>
			hasCredentials ? { email: "test@example.com", password: "pass" } : null,
		),
		storeCredentials: vi.fn(),
		deleteCredentials: vi.fn(),
	};
}

const mockCancellationToken: {
	isCancellationRequested: boolean;
	onCancellationRequested: unknown;
} = {
	isCancellationRequested: false,
	onCancellationRequested: vi.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("detectIntent", () => {
	it("detects temperature intent", () => {
		expect(detectIntent("what's the current temperature?")).toBe("temperature");
		expect(detectIntent("show me the temp")).toBe("temperature");
		expect(detectIntent("how many degrees is it?")).toBe("temperature");
		expect(detectIntent("current reading")).toBe("temperature");
	});

	it("detects events intent", () => {
		expect(detectIntent("show me the last alarm events")).toBe("events");
		expect(detectIntent("any alerts recently?")).toBe("events");
		expect(detectIntent("event history")).toBe("events");
	});

	it("detects status intent", () => {
		expect(detectIntent("what's the battery level?")).toBe("status");
		expect(detectIntent("are my devices online?")).toBe("status");
		expect(detectIntent("show device status")).toBe("status");
	});

	it("detects session intent", () => {
		expect(detectIntent("how long has my brisket been cooking?")).toBe("session");
		expect(detectIntent("show active cook sessions")).toBe("session");
		expect(detectIntent("when did the session start?")).toBe("session");
	});

	it("returns unknown for unrecognized prompts", () => {
		expect(detectIntent("hello there")).toBe("unknown");
		expect(detectIntent("what is the meaning of life?")).toBe("unknown");
	});

	it("picks highest scoring intent when multiple keywords match", () => {
		// "temperature" + "reading" = 2 hits for temperature
		expect(detectIntent("what's the temperature reading?")).toBe("temperature");
	});
});

describe("createChatHandler", () => {
	let clientManager: ClientManager;

	beforeEach(() => {
		vi.clearAllMocks();
		clientManager = new ClientManager();
	});

	it("shows auth prompt when not signed in", async () => {
		const credentialStore = createMockCredentialStore(false);
		const handler = createChatHandler(credentialStore as any, clientManager);
		const stream = createMockStream();

		await handler(
			{ prompt: "show temp" } as any,
			{} as any,
			stream as any,
			mockCancellationToken as any,
		);

		expect(stream.lines.join("")).toContain("not signed in");
	});

	it("handles temperature intent", async () => {
		const credentialStore = createMockCredentialStore(true);
		const handler = createChatHandler(credentialStore as any, clientManager);
		const stream = createMockStream();

		mockGetDevices.mockResolvedValue([mockDevice]);
		mockGetAllDeviceChannels.mockResolvedValue([mockChannel, mockChannelAlarming]);

		await handler(
			{ prompt: "what's the current temperature?" } as any,
			{} as any,
			stream as any,
			mockCancellationToken as any,
		);

		const output = stream.lines.join("");
		expect(output).toContain("Current Temperatures");
		expect(output).toContain("Smoker");
		expect(output).toContain("Pit");
		expect(output).toContain("225");
		expect(output).toContain("Meat");
		expect(output).toContain("285");
		expect(output).toContain("\u26A0\uFE0F HIGH");
	});

	it("handles events intent", async () => {
		const credentialStore = createMockCredentialStore(true);
		const handler = createChatHandler(credentialStore as any, clientManager);
		const stream = createMockStream();

		mockGetEvents.mockResolvedValue([mockEventData]);

		await handler(
			{ prompt: "show me alarm events" } as any,
			{} as any,
			stream as any,
			mockCancellationToken as any,
		);

		const output = stream.lines.join("");
		expect(output).toContain("Recent Events");
		expect(output).toContain("High Alarm");
		expect(output).toContain("270");
		expect(output).toContain("285");
	});

	it("handles status intent", async () => {
		const credentialStore = createMockCredentialStore(true);
		const handler = createChatHandler(credentialStore as any, clientManager);
		const stream = createMockStream();

		mockGetDevices.mockResolvedValue([mockDevice]);

		await handler(
			{ prompt: "show device status" } as any,
			{} as any,
			stream as any,
			mockCancellationToken as any,
		);

		const output = stream.lines.join("");
		expect(output).toContain("Device Status");
		expect(output).toContain("Smoker");
		expect(output).toContain("signals");
		expect(output).toContain("online");
		expect(output).toContain("85%");
	});

	it("handles session intent with active session", async () => {
		const credentialStore = createMockCredentialStore(true);
		const handler = createChatHandler(credentialStore as any, clientManager);
		const stream = createMockStream();

		mockGetDevices.mockResolvedValue([mockDevice]);
		mockGetAllDeviceChannels.mockResolvedValue([mockChannel]);

		await handler(
			{ prompt: "how long has my brisket been cooking?" } as any,
			{} as any,
			stream as any,
			mockCancellationToken as any,
		);

		const output = stream.lines.join("");
		expect(output).toContain("Active Sessions");
		expect(output).toContain("Smoker");
		expect(output).toContain("Brisket");
		expect(output).toContain("Duration");
		expect(output).toContain("Pit");
		expect(output).toContain("225");
	});

	it("handles session intent with no active sessions", async () => {
		const credentialStore = createMockCredentialStore(true);
		const handler = createChatHandler(credentialStore as any, clientManager);
		const stream = createMockStream();

		mockGetDevices.mockResolvedValue([{ ...mockDevice, sessionStart: null }]);

		await handler(
			{ prompt: "any cooking sessions?" } as any,
			{} as any,
			stream as any,
			mockCancellationToken as any,
		);

		const output = stream.lines.join("");
		expect(output).toContain("No active cooking sessions");
	});

	it("shows help for unknown intent", async () => {
		const credentialStore = createMockCredentialStore(true);
		const handler = createChatHandler(credentialStore as any, clientManager);
		const stream = createMockStream();

		await handler(
			{ prompt: "hello" } as any,
			{} as any,
			stream as any,
			mockCancellationToken as any,
		);

		const output = stream.lines.join("");
		expect(output).toContain("Temperatures");
		expect(output).toContain("Events");
		expect(output).toContain("Status");
		expect(output).toContain("Sessions");
	});

	it("handles SDK errors gracefully", async () => {
		const credentialStore = createMockCredentialStore(true);
		const handler = createChatHandler(credentialStore as any, clientManager);
		const stream = createMockStream();

		mockGetDevices.mockRejectedValue(new Error("Network timeout"));

		await handler(
			{ prompt: "show temp" } as any,
			{} as any,
			stream as any,
			mockCancellationToken as any,
		);

		const output = stream.lines.join("");
		expect(output).toContain("Something went wrong");
		expect(output).toContain("Network timeout");
	});

	it("handles empty device list for temperature intent", async () => {
		const credentialStore = createMockCredentialStore(true);
		const handler = createChatHandler(credentialStore as any, clientManager);
		const stream = createMockStream();

		mockGetDevices.mockResolvedValue([]);

		await handler(
			{ prompt: "what's the temp?" } as any,
			{} as any,
			stream as any,
			mockCancellationToken as any,
		);

		const output = stream.lines.join("");
		expect(output).toContain("No devices found");
	});

	it("handles empty event list for events intent", async () => {
		const credentialStore = createMockCredentialStore(true);
		const handler = createChatHandler(credentialStore as any, clientManager);
		const stream = createMockStream();

		mockGetEvents.mockResolvedValue([]);

		await handler(
			{ prompt: "show events" } as any,
			{} as any,
			stream as any,
			mockCancellationToken as any,
		);

		const output = stream.lines.join("");
		expect(output).toContain("No recent events");
	});
});

describe("registerChatParticipant", () => {
	it("creates and returns a disposable participant", async () => {
		const { chat } = await import("vscode");
		const credentialStore = createMockCredentialStore(true);
		const clientManager = new ClientManager();

		const disposable = registerChatParticipant(credentialStore as any, clientManager);

		expect(chat.createChatParticipant).toHaveBeenCalledWith("thermoworks", expect.any(Function));
		expect(disposable).toBeDefined();
		expect(disposable.dispose).toBeDefined();
	});
});
