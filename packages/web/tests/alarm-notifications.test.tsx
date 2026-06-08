import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device, DeviceChannel } from "thermoworks-sdk";
import { NotificationToggle } from "../src/components/NotificationToggle.tsx";
import {
	getNotificationsEnabled,
	setNotificationsEnabled,
	useAlarmNotifications,
} from "../src/hooks/useAlarmNotifications.ts";
import type { DeviceWithChannels } from "../src/lib/api.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDevice(serial: string, label: string | null = null): Device {
	return {
		serial,
		deviceId: null,
		label,
		type: null,
		device: null,
		status: "online",
		battery: null,
		batteryState: null,
		wifiStrength: null,
		firmware: null,
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
		lastSeen: null,
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
	};
}

function makeChannel(overrides: Partial<DeviceChannel> = {}): DeviceChannel {
	return {
		value: 72.5,
		units: "F",
		label: "Channel 1",
		status: "normal",
		type: null,
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

function alarmingChannel(direction: "high" | "low", temp = 225.0, threshold = 200.0): DeviceChannel {
	const alarm = { enabled: true, alarming: true, muted: null, value: threshold, units: "F", lastNotified: null };
	return makeChannel({
		value: temp,
		alarmHigh: direction === "high" ? alarm : null,
		alarmLow: direction === "low" ? alarm : null,
	});
}

// ─── Notification API mock ───────────────────────────────────────────────────

let notificationInstances: Array<{ title: string; options: NotificationOptions; onclick: (() => void) | null; close: () => void }>;
let mockPermission: NotificationPermission;

class MockNotification {
	static get permission() {
		return mockPermission;
	}
	static requestPermission = vi.fn().mockResolvedValue("granted");

	title: string;
	options: NotificationOptions;
	onclick: (() => void) | null = null;
	close = vi.fn();

	constructor(title: string, options: NotificationOptions = {}) {
		this.title = title;
		this.options = options;
		notificationInstances.push(this);
	}
}

// ─── localStorage mock ───────────────────────────────────────────────────────

let localStorageStore: Record<string, string>;

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
	localStorageStore = {};
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => localStorageStore[key] ?? null,
		setItem: (key: string, value: string) => {
			localStorageStore[key] = value;
		},
		removeItem: (key: string) => {
			delete localStorageStore[key];
		},
	});

	notificationInstances = [];
	mockPermission = "granted";
	vi.stubGlobal("Notification", MockNotification);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

// ─── useAlarmNotifications ───────────────────────────────────────────────────

describe("useAlarmNotifications", () => {
	it("fires a notification when a new high alarm is detected", () => {
		const data: DeviceWithChannels[] = [
			{ device: makeDevice("S1", "My Smoker"), channels: [alarmingChannel("high")] },
		];

		renderHook(() => useAlarmNotifications(data));

		expect(notificationInstances).toHaveLength(1);
		expect(notificationInstances[0].title).toBe("My Smoker");
		expect(notificationInstances[0].options.body).toContain("above");
		expect(notificationInstances[0].options.body).toContain("200.0");
	});

	it("fires a notification for low alarm", () => {
		const data: DeviceWithChannels[] = [
			{ device: makeDevice("S1", "My Smoker"), channels: [alarmingChannel("low", 180.0, 190.0)] },
		];

		renderHook(() => useAlarmNotifications(data));

		expect(notificationInstances).toHaveLength(1);
		expect(notificationInstances[0].options.body).toContain("below");
		expect(notificationInstances[0].options.body).toContain("190.0");
	});

	it("does not re-notify for the same alarm on subsequent renders", () => {
		const data: DeviceWithChannels[] = [
			{ device: makeDevice("S1", "My Smoker"), channels: [alarmingChannel("high")] },
		];

		const { rerender } = renderHook(({ d }) => useAlarmNotifications(d), {
			initialProps: { d: data },
		});

		expect(notificationInstances).toHaveLength(1);

		// Re-render with the same alarm data.
		rerender({ d: [...data] });
		expect(notificationInstances).toHaveLength(1);
	});

	it("notifies again when a new alarm appears", () => {
		const initial: DeviceWithChannels[] = [
			{ device: makeDevice("S1", "Probe A"), channels: [alarmingChannel("high")] },
		];

		const { rerender } = renderHook(({ d }) => useAlarmNotifications(d), {
			initialProps: { d: initial },
		});

		expect(notificationInstances).toHaveLength(1);

		// Second device starts alarming.
		const updated: DeviceWithChannels[] = [
			...initial,
			{ device: makeDevice("S2", "Probe B"), channels: [alarmingChannel("low")] },
		];
		rerender({ d: updated });

		expect(notificationInstances).toHaveLength(2);
		expect(notificationInstances[1].title).toBe("Probe B");
	});

	it("does not fire notifications when disabled in localStorage", () => {
		localStorageStore["thermoworks-notifications-enabled"] = "false";
		const data: DeviceWithChannels[] = [
			{ device: makeDevice("S1"), channels: [alarmingChannel("high")] },
		];

		renderHook(() => useAlarmNotifications(data));

		expect(notificationInstances).toHaveLength(0);
	});

	it("does not fire notifications when permission is denied", () => {
		mockPermission = "denied";

		const data: DeviceWithChannels[] = [
			{ device: makeDevice("S1"), channels: [alarmingChannel("high")] },
		];

		renderHook(() => useAlarmNotifications(data));

		expect(notificationInstances).toHaveLength(0);
	});

	it("requests permission when permission is default", async () => {
		mockPermission = "default";
		MockNotification.requestPermission.mockResolvedValue("granted");

		const data: DeviceWithChannels[] = [
			{ device: makeDevice("S1", "Test"), channels: [alarmingChannel("high")] },
		];

		renderHook(() => useAlarmNotifications(data));

		expect(MockNotification.requestPermission).toHaveBeenCalled();
	});

	it("uses serial as title when device label is null", () => {
		const data: DeviceWithChannels[] = [
			{ device: makeDevice("XYZ789"), channels: [alarmingChannel("high")] },
		];

		renderHook(() => useAlarmNotifications(data));

		expect(notificationInstances).toHaveLength(1);
		expect(notificationInstances[0].title).toBe("XYZ789");
	});

	it("does not fire for channels with no alarm", () => {
		const data: DeviceWithChannels[] = [
			{ device: makeDevice("S1"), channels: [makeChannel()] },
		];

		renderHook(() => useAlarmNotifications(data));

		expect(notificationInstances).toHaveLength(0);
	});

	it("clears stale alarm keys when alarm resolves", () => {
		const alarming: DeviceWithChannels[] = [
			{ device: makeDevice("S1"), channels: [alarmingChannel("high")] },
		];

		const { rerender } = renderHook(({ d }) => useAlarmNotifications(d), {
			initialProps: { d: alarming },
		});

		expect(notificationInstances).toHaveLength(1);

		// Alarm resolves.
		const resolved: DeviceWithChannels[] = [
			{ device: makeDevice("S1"), channels: [makeChannel()] },
		];
		rerender({ d: resolved });

		// Alarm re-fires - should notify again.
		rerender({ d: alarming });
		expect(notificationInstances).toHaveLength(2);
	});

	it("focuses window and closes notification on click", () => {
		const focusSpy = vi.spyOn(window, "focus").mockImplementation(() => {});
		const data: DeviceWithChannels[] = [
			{ device: makeDevice("S1", "Grill"), channels: [alarmingChannel("high")] },
		];

		renderHook(() => useAlarmNotifications(data));

		const notification = notificationInstances[0];
		notification.onclick?.();

		expect(focusSpy).toHaveBeenCalled();
		expect(notification.close).toHaveBeenCalled();
	});
});

// ─── getNotificationsEnabled / setNotificationsEnabled ───────────────────────

describe("getNotificationsEnabled", () => {
	it("returns true by default", () => {
		expect(getNotificationsEnabled()).toBe(true);
	});

	it("returns false when localStorage says false", () => {
		localStorageStore["thermoworks-notifications-enabled"] = "false";
		expect(getNotificationsEnabled()).toBe(false);
	});

	it("returns true for any other value", () => {
		localStorageStore["thermoworks-notifications-enabled"] = "true";
		expect(getNotificationsEnabled()).toBe(true);
	});
});

describe("setNotificationsEnabled", () => {
	it("persists true to localStorage", () => {
		setNotificationsEnabled(true);
		expect(localStorageStore["thermoworks-notifications-enabled"]).toBe("true");
	});

	it("persists false to localStorage", () => {
		setNotificationsEnabled(false);
		expect(localStorageStore["thermoworks-notifications-enabled"]).toBe("false");
	});
});

// ─── NotificationToggle component ────────────────────────────────────────────

describe("NotificationToggle", () => {
	it("renders bell icon when enabled and granted", () => {
		render(<NotificationToggle />);

		const btn = screen.getByRole("button", { name: /disable alarm notifications/i });
		expect(btn).toBeInTheDocument();
		expect(btn).not.toBeDisabled();
	});

	it("renders bellOff and disabled when permission is denied", () => {
		mockPermission = "denied";
		render(<NotificationToggle />);

		const btn = screen.getByRole("button", { name: /blocked by browser/i });
		expect(btn).toBeDisabled();
	});

	it("toggles local preference on click when granted", () => {
		render(<NotificationToggle />);

		const btn = screen.getByRole("button", { name: /disable alarm notifications/i });
		fireEvent.click(btn);

		expect(localStorageStore["thermoworks-notifications-enabled"]).toBe("false");

		const updatedBtn = screen.getByRole("button", { name: /enable alarm notifications/i });
		expect(updatedBtn).toBeInTheDocument();
	});

	it("requests permission on click when permission is default", () => {
		mockPermission = "default";
		MockNotification.requestPermission.mockResolvedValue("granted");

		render(<NotificationToggle />);

		const btn = screen.getByRole("button", { name: /enable alarm notifications/i });
		fireEvent.click(btn);

		expect(MockNotification.requestPermission).toHaveBeenCalled();
	});
});
