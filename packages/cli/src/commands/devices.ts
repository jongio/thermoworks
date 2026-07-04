import {
	type AlarmState,
	type DeviceChannel,
	type DeviceFilter,
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
	/** Optional filter applied to the device list. */
	filter?: DeviceFilter;
}

/** Parse a named flag value from args (e.g., "--type" "node" → "node"). */
function getFlagValue(args: string[], flag: string): string | undefined {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

/** Split a comma-separated flag value into a match-any list, or return the single value. */
function parseListValue(raw: string): string | string[] {
	if (!raw.includes(",")) return raw;
	const items = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return items.length === 1 ? (items[0] as string) : items;
}

/**
 * Build the devices command options (channels + filter) from raw CLI args.
 *
 * Filter flags map directly onto the SDK `DeviceFilter`. Comma-separated values
 * (e.g. `--type node,smoke`) are treated as match-any.
 */
export function parseDevicesArgs(args: string[], base: OutputOptions): DevicesOptions {
	const options: DevicesOptions = {
		...base,
		channels: !args.includes("--no-channels"),
	};

	const filter: DeviceFilter = {};
	const type = getFlagValue(args, "--type");
	if (type) filter.type = parseListValue(type);
	const status = getFlagValue(args, "--status");
	if (status) filter.status = parseListValue(status);
	const label = getFlagValue(args, "--label");
	if (label) filter.label = parseListValue(label);
	const serial = getFlagValue(args, "--serial");
	if (serial) filter.serial = parseListValue(serial);

	const activeWithin = getFlagValue(args, "--active-within");
	if (activeWithin !== undefined) {
		const minutes = Number(activeWithin);
		if (!Number.isFinite(minutes) || minutes <= 0) {
			console.error(
				`Invalid --active-within: ${activeWithin}. Must be a positive number of minutes.`,
			);
			process.exit(1);
		}
		filter.activeWithinMinutes = minutes;
	}

	if (Object.keys(filter).length > 0) options.filter = filter;
	return options;
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
		const deviceList = await client.getDevices(options.filter);

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
			console.log(options.filter ? "No devices match the filter." : "No devices found.");
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
