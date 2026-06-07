import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock vscode ─────────────────────────────────────────────────────────────

const mockShowQuickPick = vi.fn();
const mockShowInputBox = vi.fn();
const mockShowErrorMessage = vi.fn();
const mockShowInformationMessage = vi.fn();

vi.mock("vscode", () => ({
	window: {
		showQuickPick: (...args: unknown[]) => mockShowQuickPick(...args),
		showInputBox: (...args: unknown[]) => mockShowInputBox(...args),
		showErrorMessage: (...args: unknown[]) => mockShowErrorMessage(...args),
		showInformationMessage: (...args: unknown[]) => mockShowInformationMessage(...args),
	},
}));

// ─── Mock thermoworks-sdk ────────────────────────────────────────────────────

const mockGetDevices = vi.fn();
const mockGetAllDeviceChannels = vi.fn();
const mockSetAlarm = vi.fn();

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		getDevices = mockGetDevices;
		getAllDeviceChannels = mockGetAllDeviceChannels;
		setAlarm = mockSetAlarm;
		close = vi.fn();
	},
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { configureAlarm, promptTemperature, validateTemperature } from "../src/alarm-config";

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeDevice(serial: string, label: string | null = null) {
	return {
		serial,
		deviceId: null,
		label,
		type: null,
		device: null,
		status: null,
		battery: null,
		batteryState: null,
		wifiStrength: null,
		firmware: null,
		color: null,
		thumbnail: null,
		deviceDisplayUnits: null,
		iotDeviceId: null,
		iotCoreDeviceBlocked: null,
	};
}

function makeChannel(
	number: string,
	opts: {
		label?: string | null;
		value?: number | null;
		units?: string | null;
		alarmHigh?: { enabled: boolean; value: number | null; units: string | null } | null;
		alarmLow?: { enabled: boolean; value: number | null; units: string | null } | null;
	} = {},
) {
	return {
		number,
		label: opts.label ?? null,
		value: opts.value ?? 225,
		units: opts.units ?? "F",
		status: null,
		type: null,
		enabled: true,
		color: null,
		lastSeen: null,
		lastTelemetrySaved: null,
		lastEventId: null,
		showAvgTemp: null,
		estimatedAlarmStatus: null,
		rateOfChange: null,
		rateOfChangeUnit: null,
		alarmHigh: opts.alarmHigh
			? { ...opts.alarmHigh, alarming: false, muted: null, lastNotified: null }
			: null,
		alarmLow: opts.alarmLow
			? { ...opts.alarmLow, alarming: false, muted: null, lastNotified: null }
			: null,
		minimum: null,
		maximum: null,
	};
}

function makeClientManager() {
	return {
		getClient: vi.fn(() => ({
			getDevices: mockGetDevices,
			getAllDeviceChannels: mockGetAllDeviceChannels,
			setAlarm: mockSetAlarm,
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("validateTemperature", () => {
	it("returns null for valid integer", () => {
		expect(validateTemperature("275")).toBeNull();
	});

	it("returns null for valid decimal", () => {
		expect(validateTemperature("32.5")).toBeNull();
	});

	it("returns null for negative number", () => {
		expect(validateTemperature("-40")).toBeNull();
	});

	it("returns error for empty string", () => {
		expect(validateTemperature("")).toBe("Temperature value is required");
	});

	it("returns error for whitespace only", () => {
		expect(validateTemperature("   ")).toBe("Temperature value is required");
	});

	it("returns error for non-numeric string", () => {
		expect(validateTemperature("abc")).toBe("Must be a valid number");
	});

	it("returns error for Infinity", () => {
		expect(validateTemperature("Infinity")).toBe("Must be a valid number");
	});

	it("returns error for NaN", () => {
		expect(validateTemperature("NaN")).toBe("Must be a valid number");
	});
});

describe("configureAlarm", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows error when not signed in", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(false);

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith(
			"Not signed in to ThermoWorks. Please sign in first.",
		);
		expect(clientManager.getClient).not.toHaveBeenCalled();
	});

	it("shows error when getDevices fails", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockRejectedValue(new Error("Network error"));

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith("Failed to fetch devices: Network error");
	});

	it("shows info when no devices found", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([]);

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockShowInformationMessage).toHaveBeenCalledWith("No ThermoWorks devices found.");
	});

	it("exits gracefully when user cancels device pick", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("ABC123", "Smoker")]);
		mockShowQuickPick.mockResolvedValue(undefined);

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockGetAllDeviceChannels).not.toHaveBeenCalled();
	});

	it("shows error when getAllDeviceChannels fails", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("ABC123", "Smoker")]);
		mockShowQuickPick.mockResolvedValueOnce({
			label: "Smoker",
			device: makeDevice("ABC123", "Smoker"),
		});
		mockGetAllDeviceChannels.mockRejectedValue(new Error("Timeout"));

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith("Failed to fetch channels: Timeout");
	});

	it("shows info when no channels found", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("ABC123", "Smoker")]);
		mockShowQuickPick.mockResolvedValueOnce({
			label: "Smoker",
			device: makeDevice("ABC123", "Smoker"),
		});
		mockGetAllDeviceChannels.mockResolvedValue([]);

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockShowInformationMessage).toHaveBeenCalledWith("No channels found for this device.");
	});

	it("exits gracefully when user cancels channel pick", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("ABC123", "Smoker")]);
		mockShowQuickPick.mockResolvedValueOnce({
			label: "Smoker",
			device: makeDevice("ABC123", "Smoker"),
		});
		mockGetAllDeviceChannels.mockResolvedValue([makeChannel("1", { label: "Pit" })]);
		mockShowQuickPick.mockResolvedValueOnce(undefined);

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockSetAlarm).not.toHaveBeenCalled();
	});

	it("exits gracefully when user cancels action pick", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("ABC123", "Smoker")]);
		mockShowQuickPick.mockResolvedValueOnce({
			label: "Smoker",
			device: makeDevice("ABC123", "Smoker"),
		});
		mockGetAllDeviceChannels.mockResolvedValue([makeChannel("1", { label: "Pit" })]);
		mockShowQuickPick.mockResolvedValueOnce({ label: "Pit", channelNumber: 1 });
		mockShowQuickPick.mockResolvedValueOnce(undefined);

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockSetAlarm).not.toHaveBeenCalled();
	});

	it("sets high alarm successfully", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("ABC123", "Smoker")]);
		mockShowQuickPick.mockResolvedValueOnce({
			label: "Smoker",
			device: makeDevice("ABC123", "Smoker"),
		});
		mockGetAllDeviceChannels.mockResolvedValue([makeChannel("1", { label: "Pit" })]);
		mockShowQuickPick.mockResolvedValueOnce({ label: "Pit", channelNumber: 1 });
		mockShowQuickPick.mockResolvedValueOnce({ value: "set-high" });
		mockShowInputBox.mockResolvedValueOnce("275");
		mockSetAlarm.mockResolvedValue(undefined);

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 1, {
			high: { value: 275, enabled: true },
		});
		expect(mockShowInformationMessage).toHaveBeenCalledWith("Alarm set on Smoker Ch1: High=275");
	});

	it("sets low alarm successfully", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("ABC123", "Fridge")]);
		mockShowQuickPick.mockResolvedValueOnce({
			label: "Fridge",
			device: makeDevice("ABC123", "Fridge"),
		});
		mockGetAllDeviceChannels.mockResolvedValue([makeChannel("1", { label: "Internal" })]);
		mockShowQuickPick.mockResolvedValueOnce({ label: "Internal", channelNumber: 1 });
		mockShowQuickPick.mockResolvedValueOnce({ value: "set-low" });
		mockShowInputBox.mockResolvedValueOnce("32");
		mockSetAlarm.mockResolvedValue(undefined);

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 1, {
			low: { value: 32, enabled: true },
		});
		expect(mockShowInformationMessage).toHaveBeenCalledWith("Alarm set on Fridge Ch1: Low=32");
	});

	it("sets both alarms successfully", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("ABC123", "Smoker")]);
		mockShowQuickPick.mockResolvedValueOnce({
			label: "Smoker",
			device: makeDevice("ABC123", "Smoker"),
		});
		mockGetAllDeviceChannels.mockResolvedValue([makeChannel("2", { label: "Meat" })]);
		mockShowQuickPick.mockResolvedValueOnce({ label: "Meat", channelNumber: 2 });
		mockShowQuickPick.mockResolvedValueOnce({ value: "set-both" });
		mockShowInputBox.mockResolvedValueOnce("275");
		mockShowInputBox.mockResolvedValueOnce("32");
		mockSetAlarm.mockResolvedValue(undefined);

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 2, {
			high: { value: 275, enabled: true },
			low: { value: 32, enabled: true },
		});
		expect(mockShowInformationMessage).toHaveBeenCalledWith(
			"Alarm set on Smoker Ch2: High=275, Low=32",
		);
	});

	it("clears alarms successfully", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("ABC123", "Smoker")]);
		mockShowQuickPick.mockResolvedValueOnce({
			label: "Smoker",
			device: makeDevice("ABC123", "Smoker"),
		});
		mockGetAllDeviceChannels.mockResolvedValue([makeChannel("1", { label: "Pit" })]);
		mockShowQuickPick.mockResolvedValueOnce({ label: "Pit", channelNumber: 1 });
		mockShowQuickPick.mockResolvedValueOnce({ value: "clear" });
		mockSetAlarm.mockResolvedValue(undefined);

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 1, {
			high: { value: 0, enabled: false },
			low: { value: 0, enabled: false },
		});
		expect(mockShowInformationMessage).toHaveBeenCalledWith("Alarms cleared on Smoker Ch1");
	});

	it("exits when user cancels temperature input for high alarm", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("ABC123", "Smoker")]);
		mockShowQuickPick.mockResolvedValueOnce({
			label: "Smoker",
			device: makeDevice("ABC123", "Smoker"),
		});
		mockGetAllDeviceChannels.mockResolvedValue([makeChannel("1", { label: "Pit" })]);
		mockShowQuickPick.mockResolvedValueOnce({ label: "Pit", channelNumber: 1 });
		mockShowQuickPick.mockResolvedValueOnce({ value: "set-high" });
		mockShowInputBox.mockResolvedValueOnce(undefined);

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockSetAlarm).not.toHaveBeenCalled();
	});

	it("shows error when setAlarm fails", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("ABC123", "Smoker")]);
		mockShowQuickPick.mockResolvedValueOnce({
			label: "Smoker",
			device: makeDevice("ABC123", "Smoker"),
		});
		mockGetAllDeviceChannels.mockResolvedValue([makeChannel("1", { label: "Pit" })]);
		mockShowQuickPick.mockResolvedValueOnce({ label: "Pit", channelNumber: 1 });
		mockShowQuickPick.mockResolvedValueOnce({ value: "set-high" });
		mockShowInputBox.mockResolvedValueOnce("275");
		mockSetAlarm.mockRejectedValue(new Error("Permission denied"));

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith("Failed to set alarm: Permission denied");
	});

	it("shows error when clear alarm fails", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("ABC123", "Smoker")]);
		mockShowQuickPick.mockResolvedValueOnce({
			label: "Smoker",
			device: makeDevice("ABC123", "Smoker"),
		});
		mockGetAllDeviceChannels.mockResolvedValue([makeChannel("1", { label: "Pit" })]);
		mockShowQuickPick.mockResolvedValueOnce({ label: "Pit", channelNumber: 1 });
		mockShowQuickPick.mockResolvedValueOnce({ value: "clear" });
		mockSetAlarm.mockRejectedValue(new Error("API error"));

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith("Failed to clear alarms: API error");
	});

	it("uses serial as display name when device label is null", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("XYZ999", null)]);
		mockShowQuickPick.mockResolvedValueOnce({
			label: "XYZ999",
			device: makeDevice("XYZ999", null),
		});
		mockGetAllDeviceChannels.mockResolvedValue([makeChannel("1")]);
		mockShowQuickPick.mockResolvedValueOnce({ label: "Channel 1", channelNumber: 1 });
		mockShowQuickPick.mockResolvedValueOnce({ value: "clear" });
		mockSetAlarm.mockResolvedValue(undefined);

		await configureAlarm(clientManager as any, credentialStore as any);

		expect(mockShowInformationMessage).toHaveBeenCalledWith("Alarms cleared on XYZ999 Ch1");
	});

	it("displays current alarm info in channel picker detail", async () => {
		const clientManager = makeClientManager();
		const credentialStore = makeCredentialStore(true);
		mockGetDevices.mockResolvedValue([makeDevice("ABC123", "Smoker")]);
		mockShowQuickPick.mockResolvedValueOnce({
			label: "Smoker",
			device: makeDevice("ABC123", "Smoker"),
		});
		mockGetAllDeviceChannels.mockResolvedValue([
			makeChannel("1", {
				label: "Pit",
				alarmHigh: { enabled: true, value: 275, units: "F" },
				alarmLow: { enabled: true, value: 32, units: "F" },
			}),
		]);
		// Capture what's passed to showQuickPick for the channel picker
		mockShowQuickPick.mockResolvedValueOnce(undefined);

		await configureAlarm(clientManager as any, credentialStore as any);

		// Verify the second call to showQuickPick (channel picker) received items with detail
		const channelPickCall = mockShowQuickPick.mock.calls[1];
		expect(channelPickCall).toBeDefined();
		const items = channelPickCall[0];
		expect(items[0].detail).toBe("Current alarms: High: 275\u00B0F, Low: 32\u00B0F");
	});
});

describe("promptTemperature", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns parsed number on valid input", async () => {
		mockShowInputBox.mockResolvedValue("275");
		const result = await promptTemperature("high alarm");
		expect(result).toBe(275);
	});

	it("returns undefined when user cancels", async () => {
		mockShowInputBox.mockResolvedValue(undefined);
		const result = await promptTemperature("low alarm");
		expect(result).toBeUndefined();
	});

	it("passes correct prompt to showInputBox", async () => {
		mockShowInputBox.mockResolvedValue("100");
		await promptTemperature("high alarm");
		expect(mockShowInputBox).toHaveBeenCalledWith(
			expect.objectContaining({
				prompt: "Enter high alarm temperature value",
				placeHolder: "e.g. 275",
			}),
		);
	});

	it("provides validateInput function", async () => {
		mockShowInputBox.mockResolvedValue("100");
		await promptTemperature("low alarm");
		const opts = mockShowInputBox.mock.calls[0][0];
		expect(opts.validateInput).toBeTypeOf("function");
		expect(opts.validateInput("abc")).toBe("Must be a valid number");
		expect(opts.validateInput("42")).toBeNull();
	});
});
