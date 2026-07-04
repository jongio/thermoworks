import type { Alarm, AlarmSetOptions, DeviceChannel } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** ANSI bold helper for section headings. */
const bold = (text: string): string => `\x1b[1m${text}\x1b[0m`;

/** Parse a named flag value from args (e.g., "--channel" "2" → "2"). */
function getFlagValue(args: string[], flag: string): string | undefined {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

/** Validate channel is an integer between 1 and 9. */
function parseChannel(raw: string | undefined): number {
	if (raw === undefined) {
		console.error("Missing required flag: --channel <1-9>");
		process.exit(1);
	}
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > 9) {
		console.error(`Invalid channel: ${raw}. Must be an integer from 1 to 9.`);
		process.exit(1);
	}
	return n;
}

/** Validate a temperature value is a finite number. */
function parseTemperature(raw: string, label: string): number {
	const n = Number(raw);
	if (!Number.isFinite(n)) {
		console.error(`Invalid ${label} value: ${raw}. Must be a number.`);
		process.exit(1);
	}
	return n;
}

/** Format an alarm confirmation line for human output. */
function formatAlarmInfo(channel: DeviceChannel, channelNum: number): string {
	const parts: string[] = [`Channel ${channelNum}`];

	if (channel.alarmHigh?.enabled) {
		const val = channel.alarmHigh.value;
		const units = channel.alarmHigh.units ?? "";
		parts.push(`high=${val}\u00B0${units}`);
	}
	if (channel.alarmLow?.enabled) {
		const val = channel.alarmLow.value;
		const units = channel.alarmLow.units ?? "";
		parts.push(`low=${val}\u00B0${units}`);
	}

	if (!channel.alarmHigh?.enabled && !channel.alarmLow?.enabled) {
		parts.push("alarms disabled");
	}

	return parts.join("  ");
}

export async function alarmSet(args: string[], options: OutputOptions): Promise<void> {
	const serial = args[0];
	if (!serial) {
		console.error(
			"Usage: thermoworks alarm set <SERIAL> --channel <1-9> --high <temp> --low <temp>",
		);
		process.exit(1);
	}

	const channel = parseChannel(getFlagValue(args, "--channel"));
	const highRaw = getFlagValue(args, "--high");
	const lowRaw = getFlagValue(args, "--low");

	if (highRaw === undefined && lowRaw === undefined) {
		console.error("At least one of --high or --low must be specified.");
		process.exit(1);
	}

	const config: AlarmSetOptions = {};
	if (highRaw !== undefined) {
		config.high = { value: parseTemperature(highRaw, "high"), enabled: true };
	}
	if (lowRaw !== undefined) {
		config.low = { value: parseTemperature(lowRaw, "low"), enabled: true };
	}

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		await client.setAlarm(serial, channel, config);
		const updated = await client.getDeviceChannel(serial, channel);

		if (options.json) {
			outputJson({
				serial,
				channel,
				alarmHigh: updated.alarmHigh,
				alarmLow: updated.alarmLow,
			});
			return;
		}

		console.log(`Alarm set on ${serial}:`);
		console.log(`  ${formatAlarmInfo(updated, channel)}`);
	} finally {
		client.close();
	}
}

export async function alarmClear(args: string[], options: OutputOptions): Promise<void> {
	const serial = args[0];
	if (!serial) {
		console.error("Usage: thermoworks alarm clear <SERIAL> --channel <1-9>");
		process.exit(1);
	}

	const channel = parseChannel(getFlagValue(args, "--channel"));

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		await client.setAlarm(serial, channel, {
			high: { value: 0, enabled: false },
			low: { value: 0, enabled: false },
		});
		const updated = await client.getDeviceChannel(serial, channel);

		if (options.json) {
			outputJson({
				serial,
				channel,
				alarmHigh: updated.alarmHigh,
				alarmLow: updated.alarmLow,
			});
			return;
		}

		console.log(`Alarms cleared on ${serial}:`);
		console.log(`  ${formatAlarmInfo(updated, channel)}`);
	} finally {
		client.close();
	}
}

/** A single armed-alarm entry for the `alarm list` view. */
interface AlarmListEntry {
	serial: string;
	deviceLabel: string | null;
	channel: number | null;
	channelLabel: string | null;
	alarmHigh: Alarm | null;
	alarmLow: Alarm | null;
}

/** True when a channel has a high or low alarm armed. */
function channelHasArmedAlarm(channel: DeviceChannel): boolean {
	return Boolean(channel.alarmHigh?.enabled) || Boolean(channel.alarmLow?.enabled);
}

/** Format an armed threshold as `<value>°<units>`, or null when not enabled. */
function formatThreshold(alarm: Alarm | null): string | null {
	if (!alarm?.enabled) return null;
	const units = alarm.units ?? "";
	return `${alarm.value}\u00B0${units}`;
}

/**
 * List configured (armed) alarm thresholds across devices and channels.
 *
 * - Without a serial: scans every device on the account.
 * - With a serial: scopes to a single device.
 *
 * Read-only: uses `getDevices`/`getDevice` + `getAllDeviceChannels` and never writes.
 */
export async function alarmList(args: string[], options: OutputOptions): Promise<void> {
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

		const entries: AlarmListEntry[] = [];
		for (const target of targets) {
			const channels = await client.getAllDeviceChannels(target.serial);
			for (const ch of channels) {
				if (!channelHasArmedAlarm(ch)) continue;
				entries.push({
					serial: target.serial,
					deviceLabel: target.label,
					channel: ch.number != null ? Number(ch.number) : null,
					channelLabel: ch.label,
					alarmHigh: ch.alarmHigh?.enabled ? ch.alarmHigh : null,
					alarmLow: ch.alarmLow?.enabled ? ch.alarmLow : null,
				});
			}
		}

		if (options.json) {
			outputJson(entries);
			return;
		}

		if (entries.length === 0) {
			console.log(serial ? `No armed alarms on ${serial}.` : "No armed alarms on any device.");
			return;
		}

		let currentSerial: string | null = null;
		for (const entry of entries) {
			if (entry.serial !== currentSerial) {
				currentSerial = entry.serial;
				const name = entry.deviceLabel ? `${entry.deviceLabel} (${entry.serial})` : entry.serial;
				console.log(bold(name));
			}
			const chLabel = entry.channelLabel || `Channel ${entry.channel ?? "?"}`;
			const parts: string[] = [];
			const high = formatThreshold(entry.alarmHigh);
			const low = formatThreshold(entry.alarmLow);
			if (high) parts.push(`high=${high}`);
			if (low) parts.push(`low=${low}`);
			console.log(`  ${chLabel}: ${parts.join("  ")}`);
		}
	} finally {
		client.close();
	}
}
