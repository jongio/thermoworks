import { appendFileSync, existsSync, statSync } from "node:fs";
import {
	type AlarmState,
	type Device,
	type DeviceChannel,
	detectRapidChange,
	detectStall,
	getChannelAlarmState,
	predictDoneTime,
	type TemperatureReading,
	ThermoworksCloud,
} from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import type { OutputOptions } from "../output.js";
import { loadPreferences } from "../preferences.js";
import {
	type AlarmEvent,
	AlarmNotifier,
	alarmKey,
	type WebhookFormat,
	WebhookSink,
} from "./alarm-notifier.js";
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
	bell: boolean;
	stallAlert: boolean;
	alertBefore?: number;
	untilAlarm: boolean;
	timeout?: number;
	webhooks: string[];
	webhookFormat?: WebhookFormat;
}

/**
 * Exit code used when `--until-alarm --timeout` expires before any channel
 * enters an alarm state. Distinct from 1 (general error) so scripts can
 * distinguish "no alarm yet" from "something broke."
 */
export const UNTIL_ALARM_TIMEOUT_EXIT_CODE = 2;

/** Result emitted when `--until-alarm` detects a channel in alarm state. */
export interface AlarmTriggerResult {
	device: string;
	channel: string;
	value: number;
	units: string;
	threshold: number;
	alarmType: "high" | "low";
}

/**
 * Scan watched devices for the first enabled channel in an alarm state.
 * Returns the alarm details when found, or `null` when no channel is alarming.
 * Reuses the SDK's `getChannelAlarmState` to avoid duplicating alarm logic.
 */
export function findFirstAlarmingChannel(devices: DeviceWithChannels[]): AlarmTriggerResult | null {
	for (const { device, channels } of devices) {
		for (const ch of channels) {
			if (ch.enabled === false) continue;
			const state = getChannelAlarmState(ch);
			if (state === "none") continue;

			const alarm = state === "high" ? ch.alarmHigh : ch.alarmLow;
			return {
				device: device.label ?? device.serial,
				channel: ch.label ?? ch.number ?? "unknown",
				value: ch.value ?? 0,
				units: ch.units ?? "",
				threshold: alarm?.value ?? 0,
				alarmType: state,
			};
		}
	}
	return null;
}

/** Format an `AlarmTriggerResult` for human-readable console output. */
export function formatAlarmTrigger(result: AlarmTriggerResult): string {
	const parts = [
		`Alarm triggered: ${result.alarmType.toUpperCase()}`,
		`  Device:    ${result.device}`,
		`  Channel:   ${result.channel}`,
		`  Value:     ${result.value}°${result.units}`,
		`  Threshold: ${result.threshold}°${result.units}`,
		`  Type:      ${result.alarmType}`,
	];
	return parts.join("\n");
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
	let bell = false;
	let stallAlert = false;
	let alertBefore: number | undefined;
	let untilAlarm = false;
	let timeout: number | undefined;
	const webhooks: string[] = [];
	let webhookFormat: WebhookFormat | undefined;

	let i = 0;
	// Consume the value that must follow a value-taking flag, erroring when it is
	// missing (e.g. `--timeout` passed as the final token) instead of silently
	// ignoring the flag.
	const nextValue = (flag: string): string => {
		const value = args[i + 1];
		if (value === undefined) {
			console.error(`Error: ${flag} requires a value`);
			process.exit(1);
		}
		i += 1;
		return value;
	};

	for (; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--device") {
			device = nextValue("--device");
		} else if (arg === "--interval") {
			const parsed = Number(nextValue("--interval"));
			if (Number.isNaN(parsed) || parsed < 1) {
				console.error("Error: --interval must be a positive number (>= 1)");
				process.exit(1);
			}
			interval = parsed;
		} else if (arg === "--record") {
			record = nextValue("--record");
		} else if (arg === "--record-format") {
			const value = nextValue("--record-format");
			if (value !== "csv" && value !== "json") {
				console.error("Error: --record-format must be 'csv' or 'json'");
				process.exit(1);
			}
			recordFormat = value;
		} else if (arg === "--alert-before") {
			const parsed = Number(nextValue("--alert-before"));
			if (!Number.isFinite(parsed) || parsed <= 0) {
				console.error("Error: --alert-before must be a positive number of degrees");
				process.exit(1);
			}
			alertBefore = parsed;
		} else if (arg === "--bell") {
			bell = true;
		} else if (arg === "--stall-alert") {
			stallAlert = true;
		} else if (arg === "--until-alarm") {
			untilAlarm = true;
		} else if (arg === "--timeout") {
			const parsed = Number(nextValue("--timeout"));
			if (!Number.isFinite(parsed) || parsed <= 0) {
				console.error("Error: --timeout must be a positive number of seconds");
				process.exit(1);
			}
			timeout = parsed;
		} else if (arg === "--webhook") {
			const url = nextValue("--webhook");
			try {
				new URL(url);
			} catch {
				console.error(`Error: --webhook value is not a valid URL: ${url}`);
				process.exit(1);
			}
			webhooks.push(url);
		} else if (arg === "--webhook-format") {
			const value = nextValue("--webhook-format");
			if (value !== "generic" && value !== "slack" && value !== "discord") {
				console.error("Error: --webhook-format must be 'generic', 'slack', or 'discord'");
				process.exit(1);
			}
			webhookFormat = value;
		}
	}

	if (timeout !== undefined && !untilAlarm) {
		console.error("Error: --timeout requires --until-alarm");
		process.exit(1);
	}

	// Merge env-var webhooks (comma-separated) when no --webhook flags given.
	if (webhooks.length === 0) {
		const envUrl = process.env.THERMOWORKS_WEBHOOK_URL;
		if (envUrl) {
			for (const raw of envUrl.split(",")) {
				const trimmed = raw.trim();
				if (trimmed) {
					try {
						new URL(trimmed);
						webhooks.push(trimmed);
					} catch {
						console.error(`Warning: ignoring invalid URL in THERMOWORKS_WEBHOOK_URL: ${trimmed}`);
					}
				}
			}
		}
	}

	return {
		device,
		interval,
		record,
		recordFormat,
		bell,
		stallAlert,
		alertBefore,
		untilAlarm,
		timeout,
		webhooks,
		webhookFormat,
	};
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

/**
 * Per-channel reading history, keyed by `${serial}:${channelNumber}`.
 * Used to feed stall/rapid-change detection across watch refreshes.
 */
export type ChannelHistory = Map<string, TemperatureReading[]>;

/** Maximum readings retained per channel (covers ~2 hours at 10s intervals). */
const MAX_HISTORY_LENGTH = 720;

/** Build a channel history key from device serial and channel number. */
export function channelHistoryKey(serial: string, channelNumber: string | null): string {
	return `${serial}:${channelNumber ?? "0"}`;
}

/**
 * Record the current channel values into the history map.
 * Trims entries beyond MAX_HISTORY_LENGTH to avoid unbounded growth.
 */
export function recordChannelReadings(
	history: ChannelHistory,
	devices: DeviceWithChannels[],
	timestamp: Date,
): void {
	for (const { device, channels } of devices) {
		for (const ch of channels) {
			if (ch.enabled === false || ch.value == null || ch.units == null) continue;
			const key = channelHistoryKey(device.serial, ch.number);
			let readings = history.get(key);
			if (!readings) {
				readings = [];
				history.set(key, readings);
			}
			readings.push({ value: ch.value, timestamp, units: ch.units });
			if (readings.length > MAX_HISTORY_LENGTH) {
				readings.splice(0, readings.length - MAX_HISTORY_LENGTH);
			}
		}
	}
}

/** Format the stall indicator suffix for a channel line. */
export function formatStallIndicator(readings: TemperatureReading[]): string {
	const stall = detectStall(readings);
	if (stall.isStalling) {
		return `  \u23F8 STALL (${stall.stallDuration}min)`;
	}
	return "";
}

/** Format the rapid change indicator suffix for a channel line. */
export function formatRapidChangeIndicator(readings: TemperatureReading[]): string {
	const rapid = detectRapidChange(readings);
	if (rapid.isRapid) {
		const sign = rapid.rate > 0 ? "+" : "";
		const icon = rapid.rate > 0 ? "\uD83D\uDD25" : "\u2744\uFE0F";
		return `  ${icon} ${sign}${rapid.rate}\u00B0/5min`;
	}
	return "";
}

/** Format the ETA indicator when a channel has a positive rate and a high alarm target. */
export function formatEtaIndicator(channel: DeviceChannel): string {
	const rate = channel.rateOfChange;
	const target = channel.alarmHigh?.enabled ? channel.alarmHigh.value : null;
	const current = channel.value;

	if (rate == null || rate <= 0 || target == null || current == null) return "";

	const prediction = predictDoneTime(current, target, rate);
	if (prediction.estimatedMinutes == null || prediction.estimatedMinutes === 0) return "";

	const minutes = prediction.estimatedMinutes;
	if (minutes >= 60) {
		const hrs = Math.floor(minutes / 60);
		const rem = minutes % 60;
		return rem > 0 ? `  \u23F1 ~${hrs}h${rem}min` : `  \u23F1 ~${hrs}h`;
	}
	return `  \u23F1 ~${minutes}min`;
}

/** ANSI escape codes for colored stall alert text. */
const ANSI_YELLOW = "\x1b[33m";
const ANSI_RESET = "\x1b[0m";

/**
 * Degrees remaining before a channel reaches its enabled high alarm, or null
 * when the channel has no enabled high alarm or no current reading. A negative
 * value means the reading is already at or past the alarm.
 */
export function degreesToHighAlarm(channel: DeviceChannel): number | null {
	const target = channel.alarmHigh?.enabled ? channel.alarmHigh.value : null;
	const current = channel.value;
	if (target == null || current == null) return null;
	return target - current;
}

/**
 * Format an approaching-alarm indicator when a channel is within `alertBefore`
 * degrees of its high alarm but has not reached it yet. Returns an empty string
 * when there is no high alarm, the channel is outside the warning band, or the
 * channel is already alarming.
 */
export function formatApproachingIndicator(channel: DeviceChannel, alertBefore: number): string {
	const diff = degreesToHighAlarm(channel);
	if (diff == null || diff <= 0 || diff > alertBefore) return "";
	const rounded = Math.round(diff * 10) / 10;
	return `  \uD83D\uDD14 ${rounded}\u00B0 to alarm`;
}

/** True when any enabled channel is within `alertBefore` degrees of its high alarm. */
export function watchFrameHasApproaching(
	devices: DeviceWithChannels[],
	alertBefore: number,
): boolean {
	return devices.some(({ channels }) =>
		channels.some(
			(ch) => ch.enabled !== false && formatApproachingIndicator(ch, alertBefore) !== "",
		),
	);
}

/** Wrap text in ANSI yellow for stall alert visibility. */
export function colorStallAlert(text: string): string {
	if (!text) return text;
	return `${ANSI_YELLOW}${text}${ANSI_RESET}`;
}

/** Render a single watch frame as a string (without clearing the screen). */
export function formatWatchFrame(
	devices: DeviceWithChannels[],
	timestamp: Date,
	interval: number,
	history?: ChannelHistory,
	stallAlert?: boolean,
	alertBefore?: number,
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
				let line = trend ? `${channelLine}  ${trend}` : channelLine;

				// Append stall/rapid indicators when history is available.
				if (history) {
					const key = channelHistoryKey(device.serial, ch.number);
					const readings = history.get(key);
					if (readings && readings.length >= 2) {
						const stallSuffix = formatStallIndicator(readings);
						const rapidSuffix = formatRapidChangeIndicator(readings);
						const suffix = stallSuffix || rapidSuffix;
						if (suffix) {
							line += stallAlert ? colorStallAlert(suffix) : suffix;
						}
					}
				}

				// Append ETA when the channel has a positive rate and a target.
				const etaSuffix = formatEtaIndicator(ch);
				if (etaSuffix) {
					line += etaSuffix;
				}

				// Append approaching-alarm pre-alert when within the warning band.
				if (alertBefore !== undefined) {
					const approaching = formatApproachingIndicator(ch, alertBefore);
					if (approaching) {
						line += stallAlert ? colorStallAlert(approaching) : approaching;
					}
				}

				lines.push(line);
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
	if (/^[=+\-@|\t\r]/.test(escaped)) {
		escaped = `'${escaped}`;
	}
	if (
		escaped.includes(",") ||
		escaped.includes('"') ||
		escaped.includes("\n") ||
		escaped.includes("\r")
	) {
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

/** True when any enabled channel in the frame is in an alarm state (low or high). */
export function watchFrameHasAlarm(devices: DeviceWithChannels[]): boolean {
	return devices.some(({ channels }) =>
		channels.some((ch) => ch.enabled !== false && getChannelAlarmState(ch) !== "none"),
	);
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
 *
 * When `--until-alarm` is active the loop exits with code 0 on the first
 * detected alarm, or with {@link UNTIL_ALARM_TIMEOUT_EXIT_CODE} when
 * `--timeout` expires before any alarm fires.
 */
export async function watch(args: string[], options: OutputOptions): Promise<void> {
	const prefs = await loadPreferences();
	const {
		device: deviceFilter,
		interval,
		record,
		recordFormat,
		bell,
		stallAlert,
		alertBefore,
		untilAlarm,
		timeout,
		webhooks,
		webhookFormat,
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

	// Accumulate per-channel reading history for stall/rapid detection.
	const history: ChannelHistory = new Map();

	// Set up webhook alarm notifier when URLs are configured.
	const notifier = new AlarmNotifier();
	for (const url of webhooks) {
		notifier.addSink(new WebhookSink({ url, format: webhookFormat }));
	}
	// Track alarm transitions so webhooks fire only on state changes.
	const activeAlarms = new Set<string>();

	// Register cleanup so the client is closed on process exit (covers SIGINT via global handler)
	process.on("exit", () => {
		client.close();
	});

	const startTime = Date.now();

	// Exit with the timeout code once the deadline has passed. Defined once so the
	// check can run both before and after the sleep, keeping the exit near the
	// requested --timeout regardless of a large --interval.
	const exitIfTimedOut = (): void => {
		if (!untilAlarm || timeout === undefined) return;
		const elapsed = (Date.now() - startTime) / 1000;
		if (elapsed >= timeout) {
			if (options.json) {
				console.log(JSON.stringify({ timeout: true, elapsed: Math.round(elapsed) }));
			} else {
				console.error(`Timeout: no alarm detected within ${timeout}s`);
			}
			process.exit(UNTIL_ALARM_TIMEOUT_EXIT_CODE);
		}
	};

	while (true) {
		// Hoist so the alarm check (outside the try-catch) can access the
		// fetched data. Remains undefined when the fetch itself fails.
		let fetchedDevices: DeviceWithChannels[] | undefined;

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

			// Record readings into history for stall/rapid detection.
			recordChannelReadings(history, devicesWithChannels, now);

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
				console.log(
					formatWatchFrame(devicesWithChannels, now, interval, history, stallAlert, alertBefore),
				);
			}

			// Ring the terminal bell once per refresh while any channel is alarming
			// or, when --alert-before is set, while any channel is approaching its alarm.
			const shouldRing =
				bell &&
				(watchFrameHasAlarm(devicesWithChannels) ||
					(alertBefore !== undefined &&
						watchFrameHasApproaching(devicesWithChannels, alertBefore)));
			if (shouldRing) {
				process.stdout.write("\x07");
			}

			// Dispatch webhook notifications on alarm transitions (new alarms only).
			if (notifier.hasSinks) {
				const currentKeys = new Set<string>();

				for (const { device, channels } of devicesWithChannels) {
					for (const ch of channels) {
						if (ch.enabled === false) continue;
						const state = getChannelAlarmState(ch);
						if (state === "none") continue;

						const key = alarmKey(device.serial, ch.number, state);
						currentKeys.add(key);

						if (!activeAlarms.has(key)) {
							const alarm = state === "high" ? ch.alarmHigh : ch.alarmLow;
							const event: AlarmEvent = {
								device: device.label ?? device.serial,
								channel: ch.label ?? ch.number ?? "unknown",
								value: ch.value ?? 0,
								units: ch.units ?? "",
								threshold: alarm?.value ?? 0,
								alarmType: state,
								timestamp: now.toISOString(),
							};
							// Fire and forget; errors are logged inside the notifier.
							notifier.notify(event);
						}
					}
				}

				// Clear keys for alarms that are no longer active so they
				// retrigger if the channel re-enters an alarm state.
				for (const key of activeAlarms) {
					if (!currentKeys.has(key)) {
						activeAlarms.delete(key);
					}
				}
				for (const key of currentKeys) {
					activeAlarms.add(key);
				}
			}

			fetchedDevices = devicesWithChannels;
		} catch (err) {
			console.error(`Error fetching data: ${err instanceof Error ? err.message : String(err)}`);
		}

		// Alarm and timeout checks live outside the try-catch so process.exit
		// propagates without being swallowed by the fetch error handler.
		if (untilAlarm && fetchedDevices) {
			const trigger = findFirstAlarmingChannel(fetchedDevices);
			if (trigger) {
				if (options.json) {
					console.log(JSON.stringify({ alarm: trigger }));
				} else {
					console.log(formatAlarmTrigger(trigger));
				}
				process.exit(0);
			}
		}

		// Check timeout after the fetch cycle so the elapsed time accounts for
		// network latency and the check fires reliably after each iteration.
		exitIfTimedOut();

		// Bound the wait by the time left on --timeout so the deadline is honored
		// promptly instead of only at the next full poll interval.
		let waitSeconds = interval;
		if (untilAlarm && timeout !== undefined) {
			const remaining = timeout - (Date.now() - startTime) / 1000;
			waitSeconds = Math.max(0, Math.min(interval, remaining));
		}
		const { promise } = sleep(waitSeconds);
		await promise;

		// The deadline may have elapsed during the wait; exit now rather than
		// waiting for another full fetch cycle.
		exitIfTimedOut();
	}
}
