import {
	type AlarmState,
	assessDeviceHealth,
	type ChannelLabelMap,
	type Device,
	type DeviceChannel,
	type DeviceFilter,
	type DeviceHealth,
	formatTimeAgo,
	getChannelAlarmState,
	resolveChannelLabel,
	ThermoworksCloud,
} from "thermoworks-sdk";

import { loadConfig } from "../config.js";
import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

type DeviceSortField = "health" | "label" | "last-seen";

/** Options specific to the devices command. */
export interface DevicesOptions extends OutputOptions {
	/** Show channel readings per device (default: true). */
	channels?: boolean;
	/** Optional filter applied to the device list. */
	filter?: DeviceFilter;
	/** Optional device sort field. */
	sortBy?: DeviceSortField;
	/** Sort devices by health priority (alarms first, then critical, warning, good). */
	sortByHealth?: boolean;
	/** Only show devices needing attention (alarming, critical, or warning health). */
	criticalOnly?: boolean;
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

	// --sort health
	const sort = getFlagValue(args, "--sort");
	if (sort !== undefined) {
		if (sort !== "health" && sort !== "label" && sort !== "last-seen") {
			console.error(`Invalid --sort value: ${sort}. Supported values: health, label, last-seen`);
			process.exit(1);
		}
		options.sortBy = sort;
		options.sortByHealth = sort === "health";
	}

	// --critical
	if (args.includes("--critical")) {
		options.criticalOnly = true;
	}

	return options;
}

const ANSI_RED = "\x1b[31m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_GREEN = "\x1b[32m";
const ANSI_BLUE = "\x1b[34m";
const ANSI_RESET = "\x1b[0m";

/**
 * Compute a numeric health priority for sorting.
 *
 * Lower values sort first (most urgent). Alarm state is checked separately
 * from `assessDeviceHealth` because the SDK health assessment does not
 * cover channel alarm state.
 *
 * Priority 0: active channel alarm (high or low)
 * Priority 1: critical overall health (stale, low battery, offline combined)
 * Priority 2: warning overall health
 * Priority 3: good (healthy)
 */
export function computeHealthPriority(health: DeviceHealth, channels: DeviceChannel[]): number {
	const hasAlarm = channels.some(
		(ch) => ch.enabled !== false && getChannelAlarmState(ch) !== "none",
	);
	if (hasAlarm) return 0;
	if (health.overall === "critical") return 1;
	if (health.overall === "warning") return 2;
	return 3;
}

/** Format a colored health tag for terminal display. */
function formatHealthTag(priority: number): string {
	switch (priority) {
		case 0:
			return `${ANSI_RED}[ALARM]${ANSI_RESET}`;
		case 1:
			return `${ANSI_RED}[CRITICAL]${ANSI_RESET}`;
		case 2:
			return `${ANSI_YELLOW}[WARNING]${ANSI_RESET}`;
		default:
			return `${ANSI_GREEN}[OK]${ANSI_RESET}`;
	}
}

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
export function formatChannelLine(
	channel: DeviceChannel,
	index: number,
	serial?: string,
	channelLabels?: ChannelLabelMap,
): string {
	const chNum = channel.number ?? String(index + 1);
	const displayName =
		serial != null
			? resolveChannelLabel(serial, channel, channelLabels, index)
			: (channel.label ?? `Ch${chNum}`);
	const value = channel.value;
	const units = channel.units ?? "";
	const alarm = getChannelAlarmState(channel);
	const stateStr = formatAlarmState(alarm);

	return `    Ch${chNum} ${displayName}: ${value}°${units} ${stateStr}`;
}

export async function devices(options: DevicesOptions = { json: false }): Promise<void> {
	const showChannels = options.channels ?? true;
	const sortBy = options.sortBy ?? (options.sortByHealth ? "health" : undefined);
	const useHealth = sortBy === "health" || options.criticalOnly;

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const deviceList = await client.getDevices(options.filter);

		// Load persisted channel labels for display resolution.
		const config = await loadConfig();
		const channelLabels = config.channelLabels;

		// Channels are needed for display, JSON enrichment, and health assessment.
		const displayChannels = showChannels && !options.json;
		const needChannels = showChannels || useHealth;

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

		// Compute health assessment and priority for each device when triage flags are active.
		const healthBySerial = new Map<string, { health: DeviceHealth; priority: number }>();
		if (useHealth) {
			for (const device of deviceList) {
				const channels = channelsBySerial.get(device.serial) ?? [];
				const health = assessDeviceHealth(device, channels);
				const priority = computeHealthPriority(health, channels);
				healthBySerial.set(device.serial, { health, priority });
			}
		}

		// Apply --critical filter: remove devices with good health and no alarms.
		let displayList: Device[] = deviceList;
		if (options.criticalOnly) {
			displayList = deviceList.filter((d) => {
				const entry = healthBySerial.get(d.serial);
				return entry != null && entry.priority < 3;
			});
		}

		// Apply requested sort.
		if (sortBy === "health") {
			displayList = [...displayList].sort((a, b) => {
				const pa = healthBySerial.get(a.serial)?.priority ?? 3;
				const pb = healthBySerial.get(b.serial)?.priority ?? 3;
				return pa - pb;
			});
		} else if (sortBy === "label") {
			displayList = [...displayList].sort((a, b) => {
				const labelA = (a.label || a.serial).toLocaleLowerCase();
				const labelB = (b.label || b.serial).toLocaleLowerCase();
				return labelA.localeCompare(labelB);
			});
		} else if (sortBy === "last-seen") {
			displayList = [...displayList].sort((a, b) => {
				const timeA = a.lastSeen?.getTime() ?? 0;
				const timeB = b.lastSeen?.getTime() ?? 0;
				return timeB - timeA;
			});
		}

		if (options.json) {
			const output = displayList.map((device) => {
				const channels = channelsBySerial.get(device.serial) ?? [];
				const enabledChannels = channels.filter((ch) => ch.enabled !== false);

				const base: Record<string, unknown> = {
					...device,
					...(showChannels
						? {
								channels: enabledChannels.map((ch, idx) => ({
									number: ch.number,
									label: ch.label,
									displayName: resolveChannelLabel(device.serial, ch, channelLabels, idx),
									value: ch.value,
									units: ch.units,
									alarm: getChannelAlarmState(ch),
								})),
							}
						: {}),
				};

				// Include health summary when triage flags are active.
				const entry = healthBySerial.get(device.serial);
				if (entry) {
					base.health = {
						overall: entry.health.overall,
						priority: entry.priority,
						issues: entry.health.issues,
					};
				}

				return base;
			});
			outputJson(output);
			return;
		}

		if (displayList.length === 0) {
			if (options.criticalOnly) {
				console.log("No devices need attention.");
			} else {
				console.log(options.filter ? "No devices match the filter." : "No devices found.");
			}
			return;
		}

		console.log(`Found ${displayList.length} device${displayList.length > 1 ? "s" : ""}:\n`);

		for (const device of displayList) {
			const name = device.label || device.serial;
			const parts: string[] = [name];

			if (device.type) parts.push(`(${device.type})`);
			if (device.status) parts.push(`[${device.status}]`);
			if (device.battery != null) parts.push(`🔋 ${device.battery}%`);
			if (device.lastSeen) {
				const ago = formatTimeAgo(device.lastSeen);
				parts.push(`last seen ${ago}`);
			}

			// Append health tag when sorting or filtering by health.
			const entry = healthBySerial.get(device.serial);
			if (entry) {
				parts.push(formatHealthTag(entry.priority));
			}

			console.log(`  ${parts.join("  ")}`);

			if (displayChannels) {
				const channels = channelsBySerial.get(device.serial) ?? [];
				const activeChannels = channels.filter((ch) => ch.enabled !== false && ch.value != null);
				for (const [i, ch] of activeChannels.entries()) {
					console.log(formatChannelLine(ch, i, device.serial, channelLabels));
				}
			}
		}
	} finally {
		client.close();
	}
}
