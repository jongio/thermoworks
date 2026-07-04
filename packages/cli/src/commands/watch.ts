import {
	type AlarmState,
	type Device,
	type DeviceChannel,
	getChannelAlarmState,
	ThermoworksCloud,
} from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import type { OutputOptions } from "../output.js";
import { loadPreferences } from "../preferences.js";
import { formatChannelLine } from "./devices.js";
import { formatChannelTrend } from "./sparkline.js";

/** Parsed arguments for the watch command. */
export interface WatchArgs {
	device?: string;
	interval: number;
}

/** Defaults applied when the matching flag is not passed. */
export interface WatchDefaults {
	device?: string;
	interval?: number;
}

/** Parse watch command arguments from remaining argv tokens. */
export function parseWatchArgs(args: string[], defaults: WatchDefaults = {}): WatchArgs {
	let device = defaults.device;
	let interval = defaults.interval ?? 10;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--device" && i + 1 < args.length) {
			device = args[++i];
		} else if (arg === "--interval" && i + 1 < args.length) {
			const parsed = Number(args[++i]);
			if (Number.isNaN(parsed) || parsed < 1) {
				console.error("Error: --interval must be a positive number (>= 1)");
				process.exit(1);
			}
			interval = parsed;
		}
	}

	return { device, interval };
}

/** Format a Date to a time string for display in the watch header. */
export function formatTimestamp(date: Date): string {
	return date.toLocaleTimeString();
}

/** Device with its resolved channel readings. */
export interface DeviceWithChannels {
	device: Device;
	channels: DeviceChannel[];
}

/** Render a single watch frame as a string (without clearing the screen). */
export function formatWatchFrame(
	devices: DeviceWithChannels[],
	timestamp: Date,
	interval: number,
): string {
	const lines: string[] = [];

	lines.push(`ThermoWorks Watch  [${formatTimestamp(timestamp)}]`);
	lines.push(`Refreshing every ${interval}s  (Ctrl+C to exit)`);
	lines.push("");

	if (devices.length === 0) {
		lines.push("No devices found.");
	} else {
		for (const { device, channels } of devices) {
			const name = device.label || device.serial;
			const parts: string[] = [name];
			if (device.type) parts.push(`(${device.type})`);
			if (device.status) parts.push(`[${device.status}]`);
			lines.push(`  ${parts.join("  ")}`);

			const activeChannels = channels.filter((ch) => ch.enabled !== false && ch.value != null);
			for (const [i, ch] of activeChannels.entries()) {
				const trend = formatChannelTrend(ch);
				const channelLine = formatChannelLine(ch, i);
				lines.push(trend ? `${channelLine}  ${trend}` : channelLine);
			}
		}
	}

	return lines.join("\n");
}

/** A single channel reading in a watch JSON frame. */
export interface WatchJsonChannel {
	number: string | null;
	label: string | null;
	value: number | null;
	units: string | null;
	alarm: AlarmState;
}

/** A single device in a watch JSON frame. */
export interface WatchJsonDevice {
	serial: string;
	label: string | null;
	type: string | null;
	status: string | null;
	battery: number | null;
	channels: WatchJsonChannel[];
}

/** A full watch JSON frame emitted once per refresh in `--json` mode. */
export interface WatchJsonFrame {
	timestamp: string;
	devices: WatchJsonDevice[];
}

/** Build a single NDJSON watch frame object (one line per refresh). */
export function buildWatchJsonFrame(
	devices: DeviceWithChannels[],
	timestamp: Date,
): WatchJsonFrame {
	return {
		timestamp: timestamp.toISOString(),
		devices: devices.map(({ device, channels }) => ({
			serial: device.serial,
			label: device.label,
			type: device.type,
			status: device.status,
			battery: device.battery,
			channels: channels
				.filter((ch) => ch.enabled !== false)
				.map((ch) => ({
					number: ch.number,
					label: ch.label,
					value: ch.value,
					units: ch.units,
					alarm: getChannelAlarmState(ch),
				})),
		})),
	};
}

/** Sleep for the given number of seconds. Returns a cancellable handle. */
function sleep(seconds: number): { promise: Promise<void>; cancel: () => void } {
	let timer: ReturnType<typeof setTimeout>;
	const promise = new Promise<void>((resolve) => {
		timer = setTimeout(resolve, seconds * 1000);
	});
	// biome-ignore lint/style/noNonNullAssertion: timer assigned before cancel is callable
	return { promise, cancel: () => clearTimeout(timer!) };
}

/**
 * Run the watch loop: continuously fetch device temperatures and display them.
 * Exits on SIGINT (handled by the global handler in index.ts).
 */
export async function watch(args: string[], options: OutputOptions): Promise<void> {
	const prefs = await loadPreferences();
	const { device: deviceFilter, interval } = parseWatchArgs(args, {
		device: prefs.device,
		interval: prefs.watchInterval,
	});

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	// Register cleanup so the client is closed on process exit (covers SIGINT via global handler)
	process.on("exit", () => {
		client.close();
	});

	while (true) {
		try {
			let deviceList = await client.getDevices();

			if (deviceFilter) {
				deviceList = deviceList.filter((d) => d.serial === deviceFilter);
				if (deviceList.length === 0) {
					if (!options.json) console.clear();
					console.error(`No device found with serial: ${deviceFilter}`);
					process.exit(1);
				}
			}

			const devicesWithChannels: DeviceWithChannels[] = await Promise.all(
				deviceList.map(async (device) => {
					const channels = await client.getAllDeviceChannels(device.serial);
					return { device, channels };
				}),
			);

			if (options.json) {
				console.log(JSON.stringify(buildWatchJsonFrame(devicesWithChannels, new Date())));
			} else {
				console.clear();
				console.log(formatWatchFrame(devicesWithChannels, new Date(), interval));
			}
		} catch (err) {
			console.error(`Error fetching data: ${err instanceof Error ? err.message : String(err)}`);
		}

		const { promise } = sleep(interval);
		await promise;
	}
}
