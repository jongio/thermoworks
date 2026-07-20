import type { Device, DeviceChannel, DeviceHealth, DeviceHealthIssue } from "./types.js";

/** Threshold in milliseconds: 5 minutes for warning-level staleness. */
const STALE_WARNING_MS = 5 * 60 * 1000;
/** Threshold in milliseconds: 30 minutes for critical-level staleness. */
const STALE_CRITICAL_MS = 30 * 60 * 1000;
/** Battery percentage below which a warning is issued. */
const BATTERY_WARNING_THRESHOLD = 20;
/** Battery percentage below which a critical issue is issued. */
const BATTERY_CRITICAL_THRESHOLD = 5;
/** RSSI at or below this dBm is warning-level Wi-Fi health. */
const WIFI_WARNING_DBM = -75;
/** RSSI at or below this dBm is critical Wi-Fi health. */
const WIFI_CRITICAL_DBM = -85;
/** Percentage at or below this value is warning-level Wi-Fi health. */
const WIFI_WARNING_PERCENT = 30;
/** Percentage at or below this value is critical Wi-Fi health. */
const WIFI_CRITICAL_PERCENT = 10;

function assessWifiStrength(strength: number): DeviceHealthIssue | null {
	const isRssi = strength < 0;
	const detail = isRssi ? `RSSI ${strength} dBm` : `Signal ${strength}%`;
	const critical = isRssi ? strength <= WIFI_CRITICAL_DBM : strength <= WIFI_CRITICAL_PERCENT;
	if (critical) {
		return {
			code: "weak_wifi_signal",
			severity: "critical",
			message: "Wi-Fi signal critically weak",
			detail,
		};
	}

	const warning = isRssi ? strength <= WIFI_WARNING_DBM : strength <= WIFI_WARNING_PERCENT;
	if (warning) {
		return {
			code: "weak_wifi_signal",
			severity: "warning",
			message: "Wi-Fi signal weak",
			detail,
		};
	}

	return null;
}

/**
 * Assess the health of a device based on its state and channel data.
 *
 * Checks for stale readings, low battery, and offline status, returning
 * a summary with the worst severity as the overall health level.
 *
 * @param device - The device to assess.
 * @param channels - The device's channel readings (used for timestamp comparison).
 * @param now - Optional current time for testability (defaults to `new Date()`).
 */
export function assessDeviceHealth(
	device: Device,
	channels: DeviceChannel[],
	now: Date = new Date(),
): DeviceHealth {
	const issues: DeviceHealthIssue[] = [];
	const nowMs = now.getTime();

	// Determine the most recent reading timestamp across channels and device-level lastSeen.
	const timestamps: number[] = [];
	if (device.lastSeen) {
		timestamps.push(device.lastSeen.getTime());
	}
	for (const ch of channels) {
		if (ch.lastSeen) {
			timestamps.push(ch.lastSeen.getTime());
		}
	}

	if (timestamps.length > 0) {
		const mostRecent = Math.max(...timestamps);
		const ageMs = nowMs - mostRecent;

		if (ageMs >= STALE_CRITICAL_MS) {
			const minutes = Math.round(ageMs / 60_000);
			issues.push({
				code: "stale_reading",
				severity: "critical",
				message: "Reading is critically stale",
				detail: `Last reading was ${minutes} minutes ago`,
			});
		} else if (ageMs >= STALE_WARNING_MS) {
			const minutes = Math.round(ageMs / 60_000);
			issues.push({
				code: "stale_reading",
				severity: "warning",
				message: "Reading may be stale",
				detail: `Last reading was ${minutes} minutes ago`,
			});
		}
	}

	// Battery check
	if (device.battery != null) {
		if (device.battery < BATTERY_CRITICAL_THRESHOLD) {
			issues.push({
				code: "low_battery",
				severity: "critical",
				message: "Battery critically low",
				detail: `Battery at ${device.battery}%`,
			});
		} else if (device.battery < BATTERY_WARNING_THRESHOLD) {
			issues.push({
				code: "low_battery",
				severity: "warning",
				message: "Battery low",
				detail: `Battery at ${device.battery}%`,
			});
		}
	}

	if (device.wifiStrength != null) {
		const wifiIssue = assessWifiStrength(device.wifiStrength);
		if (wifiIssue) issues.push(wifiIssue);
	}

	// Offline check
	if (device.status !== "online") {
		issues.push({
			code: "offline",
			severity: "warning",
			message: "Device is offline",
			detail: device.status ? `Status: ${device.status}` : undefined,
		});
	}

	// Derive overall status from worst issue severity
	let overall: DeviceHealth["overall"] = "good";
	for (const issue of issues) {
		if (issue.severity === "critical") {
			overall = "critical";
			break;
		}
		if (issue.severity === "warning") {
			overall = "warning";
		}
	}

	return { overall, issues };
}

/**
 * Check whether a channel reading is considered stale.
 *
 * @param channel - The channel to check.
 * @param now - Optional current time for testability.
 * @returns `true` if the channel's last reading is older than 5 minutes.
 */
export function isChannelStale(channel: DeviceChannel, now: Date = new Date()): boolean {
	if (!channel.lastSeen) return false;
	const ageMs = now.getTime() - channel.lastSeen.getTime();
	return ageMs >= STALE_WARNING_MS;
}
