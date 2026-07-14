import type { AlarmState, DeviceChannel } from "thermoworks-sdk";
import { getChannelAlarmState, ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** ANSI bold helper for section headings. */
const bold = (text: string): string => `\x1b[1m${text}\x1b[0m`;

/** A single channel that is currently in an alarm state. */
export interface AlertEntry {
	serial: string;
	deviceLabel: string | null;
	channel: number | null;
	channelLabel: string | null;
	state: Exclude<AlarmState, "none">;
	value: number | null;
	units: string | null;
}

/** Collect the channels that are currently alarming on one device. */
function collectDeviceAlerts(
	serial: string,
	deviceLabel: string | null,
	channels: DeviceChannel[],
): AlertEntry[] {
	const entries: AlertEntry[] = [];
	for (const ch of channels) {
		const state = getChannelAlarmState(ch);
		if (state === "none") continue;
		entries.push({
			serial,
			deviceLabel,
			channel: ch.number != null ? Number(ch.number) : null,
			channelLabel: ch.label,
			state,
			value: ch.value,
			units: ch.units,
		});
	}
	return entries;
}

/** Format one alerting channel as a human-readable line. */
function formatAlertLine(entry: AlertEntry): string {
	const chLabel = entry.channelLabel || `Channel ${entry.channel ?? "?"}`;
	const temp = entry.value != null ? `  ${entry.value}\u00B0${entry.units ?? ""}` : "";
	return `  ${entry.state.toUpperCase()}  ${chLabel}${temp}`;
}

/**
 * Scan current alarm state across devices and report any channel that is
 * actively alarming. Meant for scripting: it sets a non-zero exit code when any
 * alarm is firing, so a cron job or shell script can act on it.
 *
 * - Without a serial: scans every device on the account.
 * - With a serial: scopes to a single device.
 *
 * Read-only. Uses `getDevices`/`getDevice` + `getAllDeviceChannels` and never
 * writes to a device.
 */
export async function alerts(args: string[], options: OutputOptions): Promise<void> {
	const serial = args.find((a) => !a.startsWith("--"));

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		let targets: { serial: string; label: string | null }[];
		if (serial) {
			const device = await client.getDevice(serial);
			targets = [{ serial: device.serial, label: device.label }];
		} else {
			const devices = await client.getDevices();
			targets = devices.map((d) => ({ serial: d.serial, label: d.label }));
		}

		const entries: AlertEntry[] = [];
		for (const target of targets) {
			const channels = await client.getAllDeviceChannels(target.serial);
			entries.push(...collectDeviceAlerts(target.serial, target.label, channels));
		}

		if (options.json) {
			outputJson(entries);
		} else if (entries.length === 0) {
			console.log(serial ? `No active alarms on ${serial}.` : "No active alarms on any device.");
		} else {
			let currentSerial: string | null = null;
			for (const entry of entries) {
				if (entry.serial !== currentSerial) {
					currentSerial = entry.serial;
					const name = entry.deviceLabel ? `${entry.deviceLabel} (${entry.serial})` : entry.serial;
					console.log(bold(name));
				}
				console.log(formatAlertLine(entry));
			}
		}

		// Scriptable signal: non-zero exit when any channel is alarming.
		if (entries.length > 0) {
			process.exitCode = 1;
		}
	} finally {
		client.close();
	}
}
