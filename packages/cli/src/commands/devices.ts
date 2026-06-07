import {
	type AlarmState,
	type DeviceChannel,
	formatTimeAgo,
	getChannelAlarmState,
	ThermoworksCloud,
} from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Options specific to the devices command. */
export interface DevicesOptions extends OutputOptions {
	/** Show channel readings per device (default: true). */
	channels?: boolean;
}

const ANSI_RED = "\x1b[31m";
const ANSI_BLUE = "\x1b[34m";
const ANSI_RESET = "\x1b[0m";

/** Format alarm state for display, applying ANSI color when alarming. */
function formatAlarmState(alarm: AlarmState): string {
	switch (alarm) {
		case "high":
			return `${ANSI_RED}[HIGH]${ANSI_RESET}`;
		case "low":
			return `${ANSI_BLUE}[LOW]${ANSI_RESET}`;
		default:
			return "[NORMAL]";
	}
}

/** Format a single channel line for terminal display. */
export function formatChannelLine(channel: DeviceChannel, index: number): string {
	const chNum = channel.number ?? String(index + 1);
	const label = channel.label ?? `Ch${chNum}`;
	const value = channel.value;
	const units = channel.units ?? "";
	const alarm = getChannelAlarmState(channel);
	const stateStr = formatAlarmState(alarm);

	return `    Ch${chNum} ${label}: ${value}°${units} ${stateStr}`;
}

export async function devices(options: DevicesOptions = { json: false }): Promise<void> {
	const showChannels = options.channels ?? true;

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const deviceList = await client.getDevices();

		// Fetch channels for all devices in parallel when needed
		const displayChannels = showChannels && !options.json;
		const needChannels = showChannels;

		const channelsBySerial = new Map<string, DeviceChannel[]>();
		if (needChannels && deviceList.length > 0) {
			const results = await Promise.all(
				deviceList.map(async (device) => {
					const channels = await client.getAllDeviceChannels(device.serial);
					return { serial: device.serial, channels };
				}),
			);
			for (const { serial, channels } of results) {
				channelsBySerial.set(serial, channels);
			}
		}

		if (options.json) {
			if (showChannels) {
				const output = deviceList.map((device) => {
					const channels = channelsBySerial.get(device.serial) ?? [];
					const enabledChannels = channels.filter((ch) => ch.enabled !== false);
					return {
						...device,
						channels: enabledChannels.map((ch) => ({
							number: ch.number,
							label: ch.label,
							value: ch.value,
							units: ch.units,
							alarm: getChannelAlarmState(ch),
						})),
					};
				});
				outputJson(output);
			} else {
				outputJson(deviceList);
			}
			return;
		}

		if (deviceList.length === 0) {
			console.log("No devices found.");
			return;
		}

		console.log(`Found ${deviceList.length} device${deviceList.length > 1 ? "s" : ""}:\n`);

		for (const device of deviceList) {
			const name = device.label || device.serial;
			const parts: string[] = [name];

			if (device.type) parts.push(`(${device.type})`);
			if (device.status) parts.push(`[${device.status}]`);
			if (device.battery != null) parts.push(`🔋 ${device.battery}%`);
			if (device.lastSeen) {
				const ago = formatTimeAgo(device.lastSeen);
				parts.push(`last seen ${ago}`);
			}

			console.log(`  ${parts.join("  ")}`);

			if (displayChannels) {
				const channels = channelsBySerial.get(device.serial) ?? [];
				const activeChannels = channels.filter((ch) => ch.enabled !== false && ch.value != null);
				for (const [i, ch] of activeChannels.entries()) {
					console.log(formatChannelLine(ch, i));
				}
			}
		}
	} finally {
		client.close();
	}
}
