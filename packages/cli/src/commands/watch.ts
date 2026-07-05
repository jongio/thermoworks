import { appendFileSync, existsSync, statSync } from "node:fs";
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

/** Supported formats for the watch recording log. */
export type WatchRecordFormat = "csv" | "json";

/** Parsed arguments for the watch command. */
export interface WatchArgs {
	device?: string;
	interval: number;
	record?: string;
	recordFormat: WatchRecordFormat;
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
	let record: string | undefined;
	let recordFormat: WatchRecordFormat = "csv";

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
		} else if (arg === "--record" && i + 1 < args.length) {
			record = args[++i];
		} else if (arg === "--record-format" && i + 1 < args.length) {
			const value = args[++i];
			if (value !== "csv" && value !== "json") {
				console.error("Error: --record-format must be 'csv' or 'json'");
				process.exit(1);
			}
			recordFormat = value;
		}
	}

	return { device, interval, record, recordFormat };
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

/** Header row for the CSV recording format. */
export const RECORD_CSV_HEADER = "timestamp,serial,channel,value,units,alarm";

/** Escape a CSV field, guarding against spreadsheet formula injection. */
function escapeCsvField(field: string): string {
	let escaped = field;
	// OWASP: prefix formula-trigger characters so a label cannot become a formula.
	if (/^[=+\-@\t\r]/.test(escaped)) {
		escaped = `'${escaped}`;
	}
	if (escaped.includes(",") || escaped.includes('"') || escaped.includes("\n")) {
		return `"${escaped.replace(/"/g, '""')}"`;
	}
	return escaped;
}

/** Flatten a watch frame into CSV data rows (one per enabled channel). */
export function buildRecordCsvRows(frame: WatchJsonFrame): string[] {
	const rows: string[] = [];
	for (const device of frame.devices) {
		for (const ch of device.channels) {
			const channel = ch.label ?? ch.number ?? "unknown";
			const value = ch.value ?? "";
			const units = ch.units ?? "";
			rows.push(
				[
					frame.timestamp,
					escapeCsvField(device.serial),
					escapeCsvField(channel),
					String(value),
					escapeCsvField(units),
					ch.alarm,
				].join(","),
			);
		}
	}
	return rows;
}

/**
 * Build the exact text to append to the recording file for one refresh.
 * JSON produces one NDJSON line per frame. CSV produces one line per channel,
 * optionally prefixed with the header row when starting a fresh file.
 */
export function buildRecordChunk(
	frame: WatchJsonFrame,
	format: WatchRecordFormat,
	includeHeader: boolean,
): string {
	if (format === "json") {
		return `${JSON.stringify(frame)}\n`;
	}
	const rows = buildRecordCsvRows(frame);
	const lines = includeHeader ? [RECORD_CSV_HEADER, ...rows] : rows;
	return lines.length > 0 ? `${lines.join("\n")}\n` : "";
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
	const {
		device: deviceFilter,
		interval,
		record,
		recordFormat,
	} = parseWatchArgs(args, {
		device: prefs.device,
		interval: prefs.watchInterval,
	});

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	// For CSV, only write the header when starting a fresh (missing or empty) file.
	let needsCsvHeader =
		record !== undefined && recordFormat === "csv"
			? !existsSync(record) || statSync(record).size === 0
			: false;

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

			const now = new Date();
			const frame = buildWatchJsonFrame(devicesWithChannels, now);

			if (record !== undefined) {
				const chunk = buildRecordChunk(frame, recordFormat, needsCsvHeader);
				if (chunk.length > 0) {
					try {
						appendFileSync(record, chunk, "utf8");
						needsCsvHeader = false;
					} catch (err) {
						console.error(
							`Error writing record file: ${err instanceof Error ? err.message : String(err)}`,
						);
						process.exit(1);
					}
				}
			}

			if (options.json) {
				console.log(JSON.stringify(frame));
			} else {
				console.clear();
				console.log(formatWatchFrame(devicesWithChannels, now, interval));
			}
		} catch (err) {
			console.error(`Error fetching data: ${err instanceof Error ? err.message : String(err)}`);
		}

		const { promise } = sleep(interval);
		await promise;
	}
}
