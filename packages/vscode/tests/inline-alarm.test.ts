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

const mockSetAlarm = vi.fn();

vi.mock("thermoworks-sdk", () => ({
	ThermoworksCloud: class {
		setAlarm = mockSetAlarm;
		close = vi.fn();
	},
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import { clearAlarmInline, setAlarmInline } from "../src/inline-alarm";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeChannelNode(serial: string, channelNumber: number) {
	return { serial, channelNumber } as any;
}

function makeClientManager() {
	return {
		getClient: vi.fn(() => ({
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

describe("setAlarmInline", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows error when not signed in", async () => {
		const node = makeChannelNode("ABC123", 1);
		const cm = makeClientManager();
		const cs = makeCredentialStore(false);

		await setAlarmInline(node, cm as any, cs as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith(
			"Not signed in to ThermoWorks. Please sign in first.",
		);
		expect(cm.getClient).not.toHaveBeenCalled();
	});

	it("exits when user cancels action pick", async () => {
		const node = makeChannelNode("ABC123", 1);
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowQuickPick.mockResolvedValue(undefined);

		await setAlarmInline(node, cm as any, cs as any);

		expect(mockSetAlarm).not.toHaveBeenCalled();
	});

	it("sets high alarm on channel", async () => {
		const node = makeChannelNode("ABC123", 2);
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowQuickPick.mockResolvedValueOnce({ value: "set-high" });
		mockShowInputBox.mockResolvedValueOnce("275");
		mockSetAlarm.mockResolvedValue(undefined);

		await setAlarmInline(node, cm as any, cs as any);

		expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 2, {
			high: { value: 275, enabled: true },
		});
		expect(mockShowInformationMessage).toHaveBeenCalledWith("Alarm set on Ch2: High=275");
	});

	it("sets low alarm on channel", async () => {
		const node = makeChannelNode("DEF456", 1);
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowQuickPick.mockResolvedValueOnce({ value: "set-low" });
		mockShowInputBox.mockResolvedValueOnce("32");
		mockSetAlarm.mockResolvedValue(undefined);

		await setAlarmInline(node, cm as any, cs as any);

		expect(mockSetAlarm).toHaveBeenCalledWith("DEF456", 1, {
			low: { value: 32, enabled: true },
		});
		expect(mockShowInformationMessage).toHaveBeenCalledWith("Alarm set on Ch1: Low=32");
	});

	it("sets both alarms on channel", async () => {
		const node = makeChannelNode("ABC123", 1);
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowQuickPick.mockResolvedValueOnce({ value: "set-both" });
		mockShowInputBox.mockResolvedValueOnce("275");
		mockShowInputBox.mockResolvedValueOnce("32");
		mockSetAlarm.mockResolvedValue(undefined);

		await setAlarmInline(node, cm as any, cs as any);

		expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 1, {
			high: { value: 275, enabled: true },
			low: { value: 32, enabled: true },
		});
		expect(mockShowInformationMessage).toHaveBeenCalledWith("Alarm set on Ch1: High=275, Low=32");
	});

	it("exits when user cancels temperature input", async () => {
		const node = makeChannelNode("ABC123", 1);
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowQuickPick.mockResolvedValueOnce({ value: "set-high" });
		mockShowInputBox.mockResolvedValueOnce(undefined);

		await setAlarmInline(node, cm as any, cs as any);

		expect(mockSetAlarm).not.toHaveBeenCalled();
	});

	it("shows error when setAlarm fails", async () => {
		const node = makeChannelNode("ABC123", 1);
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockShowQuickPick.mockResolvedValueOnce({ value: "set-high" });
		mockShowInputBox.mockResolvedValueOnce("275");
		mockSetAlarm.mockRejectedValue(new Error("API timeout"));

		await setAlarmInline(node, cm as any, cs as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith("Failed to set alarm: API timeout");
	});
});

describe("clearAlarmInline", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("shows error when not signed in", async () => {
		const node = makeChannelNode("ABC123", 1);
		const cm = makeClientManager();
		const cs = makeCredentialStore(false);

		await clearAlarmInline(node, cm as any, cs as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith(
			"Not signed in to ThermoWorks. Please sign in first.",
		);
	});

	it("clears alarms with disabled thresholds", async () => {
		const node = makeChannelNode("ABC123", 2);
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockSetAlarm.mockResolvedValue(undefined);

		await clearAlarmInline(node, cm as any, cs as any);

		expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 2, {
			high: { value: 0, enabled: false },
			low: { value: 0, enabled: false },
		});
		expect(mockShowInformationMessage).toHaveBeenCalledWith("Alarms cleared on Ch2");
	});

	it("shows error when clearAlarm fails", async () => {
		const node = makeChannelNode("ABC123", 1);
		const cm = makeClientManager();
		const cs = makeCredentialStore(true);
		mockSetAlarm.mockRejectedValue(new Error("Network error"));

		await clearAlarmInline(node, cm as any, cs as any);

		expect(mockShowErrorMessage).toHaveBeenCalledWith("Failed to clear alarms: Network error");
	});
});
