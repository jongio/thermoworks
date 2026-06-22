import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock vscode ─────────────────────────────────────────────────────────────

const mockShowQuickPick = vi.fn();
const mockShowInputBox = vi.fn();
const mockShowErrorMessage = vi.fn();
const mockShowInformationMessage = vi.fn();
const mockShowWarningMessage = vi.fn();

vi.mock("vscode", () => ({
	window: {
		showQuickPick: (...args: unknown[]) => mockShowQuickPick(...args),
		showInputBox: (...args: unknown[]) => mockShowInputBox(...args),
		showErrorMessage: (...args: unknown[]) => mockShowErrorMessage(...args),
		showInformationMessage: (...args: unknown[]) => mockShowInformationMessage(...args),
		showWarningMessage: (...args: unknown[]) => mockShowWarningMessage(...args),
	},
}));

// ─── Mock thermoworks-sdk ────────────────────────────────────────────────────

const mockSetFanTarget = vi.fn();
const mockSetFanEnabled = vi.fn();
const mockRenameDevice = vi.fn();
const mockResetMinMax = vi.fn();

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		setFanTarget = mockSetFanTarget;
		setFanEnabled = mockSetFanEnabled;
		renameDevice = mockRenameDevice;
		resetMinMax = mockResetMinMax;
		close = vi.fn();
	},
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { renameDevice, resetMinMax, setFanEnabled, setFanTarget } from "../src/device-control";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDeviceNode(serial: string, label: string | null = "Smoker") {
	return { serial, label } as any;
}

function makeChannelNode(serial: string, channelNumber: number, label: string | null = "Probe 1") {
	return { serial, channelNumber, label } as any;
}

function makeClientManager() {
	return {
		getClient: vi.fn(() => ({
			setFanTarget: mockSetFanTarget,
			setFanEnabled: mockSetFanEnabled,
			renameDevice: mockRenameDevice,
			resetMinMax: mockResetMinMax,
		})),
		close: vi.fn(),
	};
}

function makeCredentialStore(hasCredentials: boolean) {
	return {
		getCredentials: vi.fn(async () =>
			hasCredentials ? { email: "test@example.com", password: "pass123" } : null,
		),
	};
}

// ─── Tests: setFanTarget ─────────────────────────────────────────────────────

describe("setFanTarget", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows error when not signed in", async () => {
		const node = makeDeviceNode("ABC123");
		const cm = makeClientManager();
		const cs = makeCredentialStore(false);

		await setFanTarget(node, cm as any, cs as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith(
			"Not signed in to ThermoWorks. Please sign in first.",
		);
		expect(cm.getClient).not.toHaveBeenCalled();
	});

	it("exits when user cancels input", async () => {
		const node = makeDeviceNode("ABC123");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowInputBox.mockResolvedValue(undefined);

		await setFanTarget(node, cm as any, cs as any);

		expect(mockSetFanTarget).not.toHaveBeenCalled();
	});

	it("sets fan target on success", async () => {
		const node = makeDeviceNode("ABC123", "Smoker");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowInputBox.mockResolvedValue("225");
		mockSetFanTarget.mockResolvedValue({ success: true, data: null, error: null });

		await setFanTarget(node, cm as any, cs as any);

		expect(mockSetFanTarget).toHaveBeenCalledWith("ABC123", 225);
		expect(mockShowInformationMessage).toHaveBeenCalledWith(
			"Fan target set to 225\u00B0 on Smoker.",
		);
	});

	it("shows error on failure", async () => {
		const node = makeDeviceNode("ABC123");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowInputBox.mockResolvedValue("225");
		mockSetFanTarget.mockResolvedValue({
			success: false,
			data: null,
			error: "Device offline",
		});

		await setFanTarget(node, cm as any, cs as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith("Failed to set fan target: Device offline");
	});

	it("uses serial when label is null", async () => {
		const node = makeDeviceNode("XYZ789", null);
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowInputBox.mockResolvedValue("300");
		mockSetFanTarget.mockResolvedValue({ success: true, data: null, error: null });

		await setFanTarget(node, cm as any, cs as any);

		expect(mockShowInformationMessage).toHaveBeenCalledWith(
			"Fan target set to 300\u00B0 on XYZ789.",
		);
	});

	it("validates input via validateInput callback", async () => {
		const node = makeDeviceNode("ABC123");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowInputBox.mockResolvedValue("225");
		mockSetFanTarget.mockResolvedValue({ success: true, data: null, error: null });

		await setFanTarget(node, cm as any, cs as any);

		// Verify the input box was configured with validateInput
		const inputBoxOptions = mockShowInputBox.mock.calls[0][0];
		expect(inputBoxOptions.validateInput).toBeDefined();
		expect(inputBoxOptions.validateInput("")).toBe("Temperature value is required");
		expect(inputBoxOptions.validateInput("abc")).toBe("Must be a valid number");
		expect(inputBoxOptions.validateInput("Infinity")).toBe("Must be a valid number");
		expect(inputBoxOptions.validateInput("225")).toBeNull();
	});
});

// ─── Tests: setFanEnabled ────────────────────────────────────────────────────

describe("setFanEnabled", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows error when not signed in", async () => {
		const node = makeDeviceNode("ABC123");
		const cm = makeClientManager();
		const cs = makeCredentialStore(false);

		await setFanEnabled(node, cm as any, cs as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith(
			"Not signed in to ThermoWorks. Please sign in first.",
		);
	});

	it("exits when user cancels pick", async () => {
		const node = makeDeviceNode("ABC123");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowQuickPick.mockResolvedValue(undefined);

		await setFanEnabled(node, cm as any, cs as any);

		expect(mockSetFanEnabled).not.toHaveBeenCalled();
	});

	it("enables fan on success", async () => {
		const node = makeDeviceNode("ABC123", "Smoker");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowQuickPick.mockResolvedValue({ value: true });
		mockSetFanEnabled.mockResolvedValue({ success: true, data: null, error: null });

		await setFanEnabled(node, cm as any, cs as any);

		expect(mockSetFanEnabled).toHaveBeenCalledWith("ABC123", true);
		expect(mockShowInformationMessage).toHaveBeenCalledWith("Fan enabled on Smoker.");
	});

	it("disables fan on success", async () => {
		const node = makeDeviceNode("ABC123", "Smoker");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowQuickPick.mockResolvedValue({ value: false });
		mockSetFanEnabled.mockResolvedValue({ success: true, data: null, error: null });

		await setFanEnabled(node, cm as any, cs as any);

		expect(mockSetFanEnabled).toHaveBeenCalledWith("ABC123", false);
		expect(mockShowInformationMessage).toHaveBeenCalledWith("Fan disabled on Smoker.");
	});

	it("shows error on failure", async () => {
		const node = makeDeviceNode("ABC123");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowQuickPick.mockResolvedValue({ value: true });
		mockSetFanEnabled.mockResolvedValue({
			success: false,
			data: null,
			error: "Fan not connected",
		});

		await setFanEnabled(node, cm as any, cs as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith("Failed to enable fan: Fan not connected");
	});
});

// ─── Tests: renameDevice ─────────────────────────────────────────────────────

describe("renameDevice", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows error when not signed in", async () => {
		const node = makeDeviceNode("ABC123");
		const cm = makeClientManager();
		const cs = makeCredentialStore(false);

		await renameDevice(node, cm as any, cs as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith(
			"Not signed in to ThermoWorks. Please sign in first.",
		);
	});

	it("exits when user cancels input", async () => {
		const node = makeDeviceNode("ABC123");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowInputBox.mockResolvedValue(undefined);

		await renameDevice(node, cm as any, cs as any);

		expect(mockRenameDevice).not.toHaveBeenCalled();
	});

	it("exits when user provides empty string", async () => {
		const node = makeDeviceNode("ABC123");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowInputBox.mockResolvedValue("");

		await renameDevice(node, cm as any, cs as any);

		expect(mockRenameDevice).not.toHaveBeenCalled();
	});

	it("renames device on success", async () => {
		const node = makeDeviceNode("ABC123", "Old Name");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowInputBox.mockResolvedValue("New Smoker");
		mockRenameDevice.mockResolvedValue({ success: true, data: null, error: null });

		await renameDevice(node, cm as any, cs as any);

		expect(mockRenameDevice).toHaveBeenCalledWith("ABC123", "New Smoker");
		expect(mockShowInformationMessage).toHaveBeenCalledWith('Device renamed to "New Smoker".');
	});

	it("pre-fills input with current label", async () => {
		const node = makeDeviceNode("ABC123", "My Smoker");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowInputBox.mockResolvedValue("New Name");
		mockRenameDevice.mockResolvedValue({ success: true, data: null, error: null });

		await renameDevice(node, cm as any, cs as any);

		const inputBoxOptions = mockShowInputBox.mock.calls[0][0];
		expect(inputBoxOptions.value).toBe("My Smoker");
	});

	it("shows error on failure", async () => {
		const node = makeDeviceNode("ABC123");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowInputBox.mockResolvedValue("New Name");
		mockRenameDevice.mockResolvedValue({
			success: false,
			data: null,
			error: "Name too long",
		});

		await renameDevice(node, cm as any, cs as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith("Failed to rename device: Name too long");
	});
});

// ─── Tests: resetMinMax ──────────────────────────────────────────────────────

describe("resetMinMax", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows error when not signed in", async () => {
		const node = makeChannelNode("ABC123", 1);
		const cm = makeClientManager();
		const cs = makeCredentialStore(false);

		await resetMinMax(node, cm as any, cs as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith(
			"Not signed in to ThermoWorks. Please sign in first.",
		);
	});

	it("exits when user cancels confirmation", async () => {
		const node = makeChannelNode("ABC123", 1);
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowWarningMessage.mockResolvedValue(undefined);

		await resetMinMax(node, cm as any, cs as any);

		expect(mockResetMinMax).not.toHaveBeenCalled();
	});

	it("resets min/max on confirmation", async () => {
		const node = makeChannelNode("ABC123", 2, "Probe 2");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowWarningMessage.mockResolvedValue("Reset");
		mockResetMinMax.mockResolvedValue({ success: true, data: null, error: null });

		await resetMinMax(node, cm as any, cs as any);

		expect(mockResetMinMax).toHaveBeenCalledWith("ABC123", 2);
		expect(mockShowInformationMessage).toHaveBeenCalledWith("Min/max reset for Probe 2.");
	});

	it("shows error on failure", async () => {
		const node = makeChannelNode("ABC123", 1, "Probe 1");
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowWarningMessage.mockResolvedValue("Reset");
		mockResetMinMax.mockResolvedValue({
			success: false,
			data: null,
			error: "Channel not found",
		});

		await resetMinMax(node, cm as any, cs as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith("Failed to reset min/max: Channel not found");
	});

	it("uses channel number as label when label is null", async () => {
		const node = makeChannelNode("ABC123", 3, null);
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowWarningMessage.mockResolvedValue("Reset");
		mockResetMinMax.mockResolvedValue({ success: true, data: null, error: null });

		await resetMinMax(node, cm as any, cs as any);

		expect(mockShowWarningMessage).toHaveBeenCalledWith(
			"Reset min/max for Ch3? This cannot be undone.",
			{ modal: true },
			"Reset",
		);
		expect(mockShowInformationMessage).toHaveBeenCalledWith("Min/max reset for Ch3.");
	});
});
