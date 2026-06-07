import type { Device } from "thermoworks-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── VS Code mock ────────────────────────────────────────────────────────────

const mockShowQuickPick = vi.fn();
const mockShowInputBox = vi.fn();
const mockShowInformationMessage = vi.fn();
const mockShowErrorMessage = vi.fn();

vi.mock("vscode", () => ({
	window: {
		showQuickPick: (...args: unknown[]) => mockShowQuickPick(...args),
		showInputBox: (...args: unknown[]) => mockShowInputBox(...args),
		showInformationMessage: (...args: unknown[]) => mockShowInformationMessage(...args),
		showErrorMessage: (...args: unknown[]) => mockShowErrorMessage(...args),
	},
}));

// ─── SDK mock ────────────────────────────────────────────────────────────────

const mockGetDevices = vi.fn();
const mockStartSession = vi.fn();
const mockEndSession = vi.fn();

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		getDevices = mockGetDevices;
		startSession = mockStartSession;
		endSession = mockEndSession;
	},
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { ClientManager } from "../src/client-manager";
import { endSession, startSession } from "../src/session-commands";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeDevice(overrides: Partial<Device> = {}): Device {
	return {
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

// ─── Fake CredentialStore ────────────────────────────────────────────────────

function makeCredentialStore(hasCredentials = true) {
	return {
		getCredentials: vi
			.fn()
			.mockResolvedValue(hasCredentials ? { email: "test@example.com", password: "pass" } : null),
	} as any;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("session-commands", () => {
	let clientManager: ClientManager;

	beforeEach(() => {
		vi.clearAllMocks();
		clientManager = new ClientManager();
	});

	describe("startSession", () => {
		it("shows error when not signed in", async () => {
			const credentialStore = makeCredentialStore(false);
			await startSession(clientManager, credentialStore);

			expect(mockShowErrorMessage).toHaveBeenCalledWith("Not signed in. Please sign in first.");
			expect(mockShowQuickPick).not.toHaveBeenCalled();
		});

		it("shows info when no devices found", async () => {
			const credentialStore = makeCredentialStore();
			mockGetDevices.mockResolvedValue([]);

			await startSession(clientManager, credentialStore);

			expect(mockShowInformationMessage).toHaveBeenCalledWith("No devices found on your account.");
		});

		it("does nothing when user cancels device picker", async () => {
			const credentialStore = makeCredentialStore();
			mockGetDevices.mockResolvedValue([makeDevice()]);
			mockShowQuickPick.mockResolvedValue(undefined);

			await startSession(clientManager, credentialStore);

			expect(mockStartSession).not.toHaveBeenCalled();
		});

		it("does nothing when user cancels label input", async () => {
			const credentialStore = makeCredentialStore();
			const device = makeDevice();
			mockGetDevices.mockResolvedValue([device]);
			mockShowQuickPick.mockResolvedValue({ label: "Smoker", device });
			mockShowInputBox.mockResolvedValue(undefined);

			await startSession(clientManager, credentialStore);

			expect(mockStartSession).not.toHaveBeenCalled();
		});

		it("starts session without label when input is empty", async () => {
			const credentialStore = makeCredentialStore();
			const device = makeDevice();
			mockGetDevices.mockResolvedValue([device]);
			mockShowQuickPick.mockResolvedValue({ label: "Smoker", device });
			mockShowInputBox.mockResolvedValue("");
			mockStartSession.mockResolvedValue({ success: true, data: null, error: null });

			await startSession(clientManager, credentialStore);

			expect(mockStartSession).toHaveBeenCalledWith("ABC123", undefined);
			expect(mockShowInformationMessage).toHaveBeenCalledWith("Session started on Smoker.");
		});

		it("starts session with label", async () => {
			const credentialStore = makeCredentialStore();
			const device = makeDevice();
			mockGetDevices.mockResolvedValue([device]);
			mockShowQuickPick.mockResolvedValue({ label: "Smoker", device });
			mockShowInputBox.mockResolvedValue("Sunday Brisket");
			mockStartSession.mockResolvedValue({ success: true, data: null, error: null });

			await startSession(clientManager, credentialStore);

			expect(mockStartSession).toHaveBeenCalledWith("ABC123", "Sunday Brisket");
			expect(mockShowInformationMessage).toHaveBeenCalledWith(
				'Session started on Smoker ("Sunday Brisket").',
			);
		});

		it("shows error notification on failure", async () => {
			const credentialStore = makeCredentialStore();
			const device = makeDevice();
			mockGetDevices.mockResolvedValue([device]);
			mockShowQuickPick.mockResolvedValue({ label: "Smoker", device });
			mockShowInputBox.mockResolvedValue("");
			mockStartSession.mockResolvedValue({
				success: false,
				data: null,
				error: "Device offline",
			});

			await startSession(clientManager, credentialStore);

			expect(mockShowErrorMessage).toHaveBeenCalledWith("Failed to start session: Device offline");
		});

		it("uses serial as device name when label is null", async () => {
			const credentialStore = makeCredentialStore();
			const device = makeDevice({ label: null });
			mockGetDevices.mockResolvedValue([device]);
			mockShowQuickPick.mockResolvedValue({ label: "ABC123", device });
			mockShowInputBox.mockResolvedValue("");
			mockStartSession.mockResolvedValue({ success: true, data: null, error: null });

			await startSession(clientManager, credentialStore);

			expect(mockShowInformationMessage).toHaveBeenCalledWith("Session started on ABC123.");
		});
	});

	describe("endSession", () => {
		it("shows error when not signed in", async () => {
			const credentialStore = makeCredentialStore(false);
			await endSession(clientManager, credentialStore);

			expect(mockShowErrorMessage).toHaveBeenCalledWith("Not signed in. Please sign in first.");
		});

		it("shows info when no devices have active sessions", async () => {
			const credentialStore = makeCredentialStore();
			mockGetDevices.mockResolvedValue([makeDevice({ sessionStart: null })]);

			await endSession(clientManager, credentialStore);

			expect(mockShowInformationMessage).toHaveBeenCalledWith("No devices match the criteria.");
		});

		it("only shows devices with active sessions", async () => {
			const credentialStore = makeCredentialStore();
			const activeDevice = makeDevice({
				serial: "ACT1",
				label: "Active Smoker",
				sessionStart: new Date("2026-06-07T08:00:00Z"),
			});
			const inactiveDevice = makeDevice({
				serial: "INA1",
				label: "Idle Oven",
				sessionStart: null,
			});
			mockGetDevices.mockResolvedValue([activeDevice, inactiveDevice]);
			mockShowQuickPick.mockResolvedValue(undefined);

			await endSession(clientManager, credentialStore);

			const quickPickItems = mockShowQuickPick.mock.calls[0][0];
			expect(quickPickItems).toHaveLength(1);
			expect(quickPickItems[0].label).toBe("Active Smoker");
		});

		it("does nothing when user cancels device picker", async () => {
			const credentialStore = makeCredentialStore();
			const device = makeDevice({ sessionStart: new Date() });
			mockGetDevices.mockResolvedValue([device]);
			mockShowQuickPick.mockResolvedValue(undefined);

			await endSession(clientManager, credentialStore);

			expect(mockEndSession).not.toHaveBeenCalled();
		});

		it("ends session and shows success", async () => {
			const credentialStore = makeCredentialStore();
			const device = makeDevice({ sessionStart: new Date() });
			mockGetDevices.mockResolvedValue([device]);
			mockShowQuickPick.mockResolvedValue({ label: "Smoker", device });
			mockEndSession.mockResolvedValue({ success: true, data: null, error: null });

			await endSession(clientManager, credentialStore);

			expect(mockEndSession).toHaveBeenCalledWith("ABC123");
			expect(mockShowInformationMessage).toHaveBeenCalledWith("Session ended on Smoker.");
		});

		it("shows error notification on failure", async () => {
			const credentialStore = makeCredentialStore();
			const device = makeDevice({ sessionStart: new Date() });
			mockGetDevices.mockResolvedValue([device]);
			mockShowQuickPick.mockResolvedValue({ label: "Smoker", device });
			mockEndSession.mockResolvedValue({
				success: false,
				data: null,
				error: "No active session",
			});

			await endSession(clientManager, credentialStore);

			expect(mockShowErrorMessage).toHaveBeenCalledWith("Failed to end session: No active session");
		});

		it("uses serial as device name when label is null", async () => {
			const credentialStore = makeCredentialStore();
			const device = makeDevice({ label: null, sessionStart: new Date() });
			mockGetDevices.mockResolvedValue([device]);
			mockShowQuickPick.mockResolvedValue({ label: "ABC123", device });
			mockEndSession.mockResolvedValue({ success: true, data: null, error: null });

			await endSession(clientManager, credentialStore);

			expect(mockShowInformationMessage).toHaveBeenCalledWith("Session ended on ABC123.");
		});
	});
});
