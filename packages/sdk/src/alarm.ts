import type { DeviceChannel } from "./types.js";

/** Alarm severity state for a device or channel. */
export type AlarmState = "none" | "low" | "high";

/** Determine the alarm state of a single channel. */
export function getChannelAlarmState(channel: DeviceChannel): AlarmState {
	if (channel.alarmHigh?.alarming) return "high";
	if (channel.alarmLow?.alarming) return "low";
	return "none";
}

/** Determine the highest alarm state across multiple channels. */
export function getChannelsAlarmState(channels: DeviceChannel[]): AlarmState {
	for (const ch of channels) {
		if (ch.alarmHigh?.alarming) return "high";
	}
	for (const ch of channels) {
		if (ch.alarmLow?.alarming) return "low";
	}
	return "none";
}

/** Escalate to the more severe of two alarm states. */
export function escalateAlarm(current: AlarmState, incoming: AlarmState): AlarmState {
	if (current === "high" || incoming === "high") return "high";
	if (current === "low" || incoming === "low") return "low";
	return "none";
}
