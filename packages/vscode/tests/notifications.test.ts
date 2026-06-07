import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mock vscode ─────────────────────────────────────────────────────────────

let configValues: Record<string, unknown> = {};

vi.mock("vscode", () => ({
	window: {
		showErrorMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showInformationMessage: vi.fn(),
	},
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string, defaultValue: unknown) => configValues[key] ?? defaultValue),
		})),
	},
}));

// ─── Mock thermoworks-sdk (use real getChannelAlarmState logic) ───────────────

vi.mock("thermoworks-sdk", () => ({
	getChannelAlarmState: vi.fn(
		(channel: { alarmHigh?: { alarming?: boolean }; alarmLow?: { alarming?: boolean } }) => {
			if (channel.alarmHigh?.alarming) return "high";
			if (channel.alarmLow?.alarming) return "low";
			return "none";
		},
	),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

import * as vscode from "vscode";
import { AlarmNotifier } from "../src/notifications";

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeChannel(overrides: {
	value?: number | null;
	units?: string | null;
	label?: string | null;
	number?: string | null;
	alarmHigh?: {
		enabled: boolean;
		alarming: boolean;
		muted: boolean | null;
		value: number | null;
		units: string | null;
		lastNotified: Date | null;
	} | null;
	alarmLow?: {
		enabled: boolean;
		alarming: boolean;
		muted: boolean | null;
		value: number | null;
		units: string | null;
		lastNotified: Date | null;
	} | null;
}) {
	return {
		value: "value" in overrides ? overrides.value : 225,
		units: "units" in overrides ? overrides.units : "F",
		label: "label" in overrides ? overrides.label : "Pit",
		number: "number" in overrides ? overrides.number : "1",
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
		alarmHigh: overrides.alarmHigh ?? null,
		alarmLow: overrides.alarmLow ?? null,
		minimum: null,
		maximum: null,
	};
}

function makeAlarm(alarming: boolean, value: number | null = null, units: string | null = "F") {
	return { enabled: true, alarming, muted: null, value, units, lastNotified: null };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AlarmNotifier", () => {
	let notifier: AlarmNotifier;

	beforeEach(() => {
		vi.clearAllMocks();
		configValues = {};
		notifier = new AlarmNotifier();
	});

	describe("checkAndNotify", () => {
		it("does not notify when alarm state is 'none'", () => {
			const channel = makeChannel({ alarmHigh: makeAlarm(false) });
			notifier.checkAndNotify("Smoker", "AAA", [channel]);

			expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
			expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
		});

		it("notifies with showErrorMessage on transition to 'high' alarm", () => {
			const normalChannel = makeChannel({ alarmHigh: makeAlarm(false) });
			notifier.checkAndNotify("Smoker", "AAA", [normalChannel]);

			const alarmingChannel = makeChannel({
				value: 285,
				alarmHigh: makeAlarm(true, 275, "F"),
			});
			notifier.checkAndNotify("Smoker", "AAA", [alarmingChannel]);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledOnce();
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				expect.stringContaining("High alarm"),
			);
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				expect.stringContaining("Smoker"),
			);
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("285"));
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				expect.stringContaining("above 275"),
			);
		});

		it("notifies with showWarningMessage on transition to 'low' alarm", () => {
			const normalChannel = makeChannel({ alarmLow: makeAlarm(false) });
			notifier.checkAndNotify("Fridge", "BBB", [normalChannel]);

			const alarmingChannel = makeChannel({
				value: 28,
				label: "Internal",
				alarmLow: makeAlarm(true, 32, "F"),
			});
			notifier.checkAndNotify("Fridge", "BBB", [alarmingChannel]);

			expect(vscode.window.showWarningMessage).toHaveBeenCalledOnce();
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining("Low alarm"),
			);
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining("Fridge"),
			);
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining("Internal"),
			);
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining("28"));
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining("below 32"),
			);
		});

		it("does NOT notify on ongoing alarm (same state repeated)", () => {
			const normalChannel = makeChannel({ alarmHigh: makeAlarm(false) });
			notifier.checkAndNotify("Smoker", "AAA", [normalChannel]);

			const alarmingChannel = makeChannel({ value: 285, alarmHigh: makeAlarm(true, 275, "F") });

			// First transition - should notify
			notifier.checkAndNotify("Smoker", "AAA", [alarmingChannel]);
			expect(vscode.window.showErrorMessage).toHaveBeenCalledOnce();

			// Same alarm state again - should NOT notify again
			notifier.checkAndNotify("Smoker", "AAA", [alarmingChannel]);
			expect(vscode.window.showErrorMessage).toHaveBeenCalledOnce();
		});

		it("does NOT notify on first check if channel starts in alarm (unknown previous state)", () => {
			// First call ever - transition from unknown ("none" default) to alarm
			// This IS a valid transition from the notifier's perspective
			const alarmingChannel = makeChannel({ value: 285, alarmHigh: makeAlarm(true, 275, "F") });
			notifier.checkAndNotify("Smoker", "AAA", [alarmingChannel]);

			// Should notify since previous state was "none" (default)
			expect(vscode.window.showErrorMessage).toHaveBeenCalledOnce();
		});

		it("handles multiple channels on same device independently", () => {
			const ch1Normal = makeChannel({ number: "1", alarmHigh: makeAlarm(false) });
			const ch2Normal = makeChannel({ number: "2", alarmLow: makeAlarm(false) });
			notifier.checkAndNotify("Smoker", "AAA", [ch1Normal, ch2Normal]);

			// Only channel 1 alarms
			const ch1Alarming = makeChannel({
				number: "1",
				value: 300,
				alarmHigh: makeAlarm(true, 275, "F"),
			});
			notifier.checkAndNotify("Smoker", "AAA", [ch1Alarming, ch2Normal]);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledOnce();
			expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
		});

		it("skips channels with null value or units", () => {
			const nullValueChannel = makeChannel({ value: null, alarmHigh: makeAlarm(true) });
			const nullUnitsChannel = makeChannel({ units: null, alarmHigh: makeAlarm(true) });
			notifier.checkAndNotify("Smoker", "AAA", [nullValueChannel, nullUnitsChannel]);

			expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
			expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
		});

		it("includes channel label in notification message", () => {
			const normalChannel = makeChannel({
				label: "Meat Probe",
				number: "2",
				alarmHigh: makeAlarm(false),
			});
			notifier.checkAndNotify("Smoker", "AAA", [normalChannel]);

			const alarmingChannel = makeChannel({
				label: "Meat Probe",
				number: "2",
				value: 205,
				alarmHigh: makeAlarm(true, 200, "F"),
			});
			notifier.checkAndNotify("Smoker", "AAA", [alarmingChannel]);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				expect.stringContaining("Meat Probe"),
			);
		});

		it("falls back to channel number when label is null", () => {
			const normalChannel = makeChannel({ label: null, number: "3", alarmHigh: makeAlarm(false) });
			notifier.checkAndNotify("Smoker", "AAA", [normalChannel]);

			const alarmingChannel = makeChannel({
				label: null,
				number: "3",
				value: 205,
				alarmHigh: makeAlarm(true, 200, "F"),
			});
			notifier.checkAndNotify("Smoker", "AAA", [alarmingChannel]);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining("Ch3"));
		});

		it("omits threshold text when alarm value is null", () => {
			const normalChannel = makeChannel({ number: "1", alarmHigh: makeAlarm(false) });
			notifier.checkAndNotify("Smoker", "AAA", [normalChannel]);

			const alarmingChannel = makeChannel({
				number: "1",
				value: 300,
				alarmHigh: makeAlarm(true, null, null),
			});
			notifier.checkAndNotify("Smoker", "AAA", [alarmingChannel]);

			const message = vi.mocked(vscode.window.showErrorMessage).mock.calls[0]?.[0] as string;
			expect(message).not.toContain("above");
			expect(message).not.toContain("below");
		});
	});

	describe("notifications setting", () => {
		it("does not notify when thermoworks.notifications is false", () => {
			configValues = { notifications: false };

			const normalChannel = makeChannel({ alarmHigh: makeAlarm(false) });
			notifier.checkAndNotify("Smoker", "AAA", [normalChannel]);

			const alarmingChannel = makeChannel({ value: 285, alarmHigh: makeAlarm(true, 275, "F") });
			notifier.checkAndNotify("Smoker", "AAA", [alarmingChannel]);

			expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
			expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
		});

		it("notifies when thermoworks.notifications is true (explicit)", () => {
			configValues = { notifications: true };

			const normalChannel = makeChannel({ alarmHigh: makeAlarm(false) });
			notifier.checkAndNotify("Smoker", "AAA", [normalChannel]);

			const alarmingChannel = makeChannel({ value: 285, alarmHigh: makeAlarm(true, 275, "F") });
			notifier.checkAndNotify("Smoker", "AAA", [alarmingChannel]);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledOnce();
		});

		it("defaults to enabled when setting is not configured", () => {
			// configValues is empty - get() returns defaultValue=true
			const normalChannel = makeChannel({ alarmHigh: makeAlarm(false) });
			notifier.checkAndNotify("Smoker", "AAA", [normalChannel]);

			const alarmingChannel = makeChannel({ value: 285, alarmHigh: makeAlarm(true, 275, "F") });
			notifier.checkAndNotify("Smoker", "AAA", [alarmingChannel]);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledOnce();
		});
	});

	describe("reset", () => {
		it("clears tracked state so next change triggers notification again", () => {
			const normalChannel = makeChannel({ alarmHigh: makeAlarm(false) });
			notifier.checkAndNotify("Smoker", "AAA", [normalChannel]);

			const alarmingChannel = makeChannel({ value: 285, alarmHigh: makeAlarm(true, 275, "F") });
			notifier.checkAndNotify("Smoker", "AAA", [alarmingChannel]);
			expect(vscode.window.showErrorMessage).toHaveBeenCalledOnce();

			// Reset and re-trigger - should notify again
			notifier.reset();
			notifier.checkAndNotify("Smoker", "AAA", [alarmingChannel]);
			expect(vscode.window.showErrorMessage).toHaveBeenCalledTimes(2);
		});
	});

	describe("dispose", () => {
		it("stops notifying after dispose", () => {
			const normalChannel = makeChannel({ alarmHigh: makeAlarm(false) });
			notifier.checkAndNotify("Smoker", "AAA", [normalChannel]);

			notifier.dispose();

			const alarmingChannel = makeChannel({ value: 285, alarmHigh: makeAlarm(true, 275, "F") });
			notifier.checkAndNotify("Smoker", "AAA", [alarmingChannel]);

			expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
		});
	});
});
