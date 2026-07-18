import { useEffect, useRef } from "react";
import type { DeviceChannel, NotificationSettings } from "thermoworks-sdk";
import type { DeviceWithChannels } from "../lib/api.ts";
import { getChannelAlarmState } from "../lib/api.ts";
import {
	getNotificationsEnabled,
	hasStoredNotificationPreference,
	NOTIFICATION_PREFERENCE_STORAGE_KEY,
	sanitizeNotificationText,
	setNotificationsEnabled,
} from "../lib/browser-notifications.ts";
import { isAlarmSnoozed, snoozeKey } from "./useAlarmSnooze.ts";

export {
	getNotificationsEnabled,
	hasStoredNotificationPreference,
	NOTIFICATION_PREFERENCE_STORAGE_KEY,
	setNotificationsEnabled,
};

/** Composite key for a specific channel alarm occurrence. */
function alarmKey(serial: string, channelIndex: number, state: "low" | "high"): string {
	return `${serial}:${channelIndex}:${state}`;
}

/** Build the notification body from channel data and alarm direction. */
function buildBody(channel: DeviceChannel, index: number, state: "low" | "high"): string {
	const label = sanitizeNotificationText(channel.label, `Channel ${index + 1}`);
	const temp = channel.value != null ? channel.value.toFixed(1) : "??";
	const units = sanitizeNotificationText(channel.units, "F");
	const alarm = state === "high" ? channel.alarmHigh : channel.alarmLow;
	const threshold = alarm?.value != null ? alarm.value.toFixed(1) : "??";
	const direction = state === "high" ? "above" : "below";

	return `${label}: ${temp}°${units} - ${direction} ${threshold}°${units}`;
}

function allowsAlarmNotification(settings: NotificationSettings | null | undefined): boolean {
	if (!getNotificationsEnabled()) return false;
	if (!settings) return true;
	return settings.enabled && settings.deviceNotification;
}

/**
 * Fires browser desktop notifications when a channel enters alarm state.
 *
 * Only notifies on *new* alarms - channels that were not alarming on the
 * previous poll cycle. Respects the user's localStorage toggle and the
 * browser Notification API permission.
 */
export function useAlarmNotifications(
	data: DeviceWithChannels[],
	settings?: NotificationSettings | null,
): void {
	const previousAlarmsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!allowsAlarmNotification(settings)) return;
		if (typeof Notification === "undefined") return;
		if (Notification.permission !== "granted") return;

		const currentAlarms = new Set<string>();

		for (const { device, channels } of data) {
			for (let i = 0; i < channels.length; i++) {
				const channel = channels[i];
				if (!channel) continue;

				const state = getChannelAlarmState(channel);
				if (state === "none") continue;

				const key = alarmKey(device.serial, i, state);
				currentAlarms.add(key);

				if (previousAlarmsRef.current.has(key)) continue;

				// Skip notification if this alarm is snoozed in localStorage.
				if (
					channel.number != null &&
					isAlarmSnoozed(snoozeKey(device.serial, channel.number, state))
				) {
					continue;
				}

				// New alarm - fire notification.
				const title = sanitizeNotificationText(device.label, device.serial);
				const body = buildBody(channel, i, state);

				const n = new Notification(title, { body, tag: key, icon: "/favicon.svg" });
				n.onclick = () => {
					window.focus();
					n.close();
				};
			}
		}

		previousAlarmsRef.current = currentAlarms;
	}, [data, settings]);
}
