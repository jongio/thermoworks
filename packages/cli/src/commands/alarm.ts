import type { AlarmSetOptions, DeviceChannel } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

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
