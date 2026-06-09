import { useEffect, useRef } from "react";
import type { DeviceChannel } from "thermoworks-sdk";
import type { DeviceWithChannels } from "../lib/api.ts";
import { getChannelAlarmState } from "../lib/api.ts";

export const NOTIFICATION_PREFERENCE_STORAGE_KEY = "thermoworks-notifications-enabled";

/** Composite key for a specific channel alarm occurrence. */
function alarmKey(serial: string, channelIndex: number, state: "low" | "high"): string {
	return `${serial}:${channelIndex}:${state}`;
}

/** Build the notification body from channel data and alarm direction. */
function buildBody(
	channel: DeviceChannel,
	index: number,
	state: "low" | "high",
): string {
	const label = channel.label ?? `Channel ${index + 1}`;
	const temp = channel.value != null ? channel.value.toFixed(1) : "??";
	const units = channel.units ?? "F";
	const alarm = state === "high" ? channel.alarmHigh : channel.alarmLow;
	const threshold = alarm?.value != null ? alarm.value.toFixed(1) : "??";
	const direction = state === "high" ? "above" : "below";

	return `${label}: ${temp}°${units} - ${direction} ${threshold}°${units}`;
}

/** Read the user's notification preference from localStorage. */
export function getNotificationsEnabled(): boolean {
	try {
		return localStorage.getItem(NOTIFICATION_PREFERENCE_STORAGE_KEY) !== "false";
	} catch {
		return true;
	}
}

export function hasStoredNotificationPreference(): boolean {
	try {
		return localStorage.getItem(NOTIFICATION_PREFERENCE_STORAGE_KEY) !== null;
	} catch {
		return false;
	}
}

/** Persist the user's notification preference to localStorage. */
export function setNotificationsEnabled(enabled: boolean): void {
	try {
		localStorage.setItem(NOTIFICATION_PREFERENCE_STORAGE_KEY, String(enabled));
	} catch {
		// Storage unavailable - ignore.
	}
}

/**
 * Fires browser desktop notifications when a channel enters alarm state.
 *
 * Only notifies on *new* alarms - channels that were not alarming on the
 * previous poll cycle. Respects the user's localStorage toggle and the
 * browser Notification API permission.
 */
export function useAlarmNotifications(data: DeviceWithChannels[]): void {
	const previousAlarmsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!getNotificationsEnabled()) return;
		if (typeof Notification === "undefined") return;
		if (Notification.permission === "denied") return;

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

				// New alarm - fire notification (requesting permission if needed).
				const title = device.label ?? device.serial;
				const body = buildBody(channel, i, state);

				if (Notification.permission === "granted") {
					const n = new Notification(title, { body, tag: key, icon: "/favicon.svg" });
					n.onclick = () => {
						window.focus();
						n.close();
					};
				} else if (Notification.permission === "default") {
					Notification.requestPermission().then((perm) => {
						if (perm === "granted") {
							const n = new Notification(title, { body, tag: key, icon: "/favicon.svg" });
							n.onclick = () => {
								window.focus();
								n.close();
							};
						}
					});
				}
			}
		}

		previousAlarmsRef.current = currentAlarms;
	}, [data]);
}
