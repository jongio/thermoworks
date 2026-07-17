import {
	type ChannelLabelMap,
	channelLabelKey,
	MAX_CHANNEL_LABEL_LENGTH,
	sanitizeLabel,
} from "thermoworks-sdk";

import { loadConfig, saveConfig } from "../config.js";
import type { OutputOptions } from "../output.js";

function usage(): never {
	console.error(
		[
			"Usage: thermoworks label <subcommand>",
			"",
			"  label set <SERIAL> <CHANNEL> <LABEL>  Set a channel label",
			"  label get <SERIAL> <CHANNEL>           Show the label for a channel",
			"  label list [SERIAL]                    List all labels (optionally for one device)",
			"  label clear <SERIAL> <CHANNEL>         Remove a channel label",
			"",
			"  SERIAL   Device serial number",
			"  CHANNEL  Channel number (1-9)",
			`  LABEL    Display name (max ${MAX_CHANNEL_LABEL_LENGTH} chars)`,
		].join("\n"),
	);
	process.exit(1);
}

function parseChannel(raw: string | undefined): number {
	if (raw === undefined) {
		console.error("Missing channel number.");
		usage();
	}
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > 9) {
		console.error(`Invalid channel number: ${raw} (must be integer 1-9)`);
		process.exit(1);
	}
	return n;
}

function requireSerial(raw: string | undefined): string {
	if (!raw) {
		console.error("Missing device serial.");
		usage();
	}
	return raw;
}

async function setLabel(serial: string, channel: number, rawLabel: string): Promise<void> {
	const cleaned = sanitizeLabel(rawLabel);
	if (!cleaned || cleaned.trim().length === 0) {
		console.error("Label cannot be empty after sanitization.");
		process.exit(1);
	}
	const label = cleaned.trim();

	const config = await loadConfig();
	const labels: ChannelLabelMap = config.channelLabels ?? {};
	labels[channelLabelKey(serial, channel)] = label;
	await saveConfig({ ...config, channelLabels: labels });
	console.log(`Set Ch${channel} on ${serial} = "${label}"`);
}

async function getLabel(serial: string, channel: number): Promise<void> {
	const config = await loadConfig();
	const key = channelLabelKey(serial, channel);
	const label = config.channelLabels?.[key];
	console.log(label ?? "(not set)");
}

async function listLabels(serial: string | undefined, options: OutputOptions): Promise<void> {
	const config = await loadConfig();
	const labels = config.channelLabels ?? {};

	const entries = Object.entries(labels).filter(([key]) => {
		if (!serial) return true;
		return key.startsWith(`${serial}:`);
	});

	if (options.json) {
		const obj = Object.fromEntries(entries);
		console.log(JSON.stringify(obj, null, 2));
		return;
	}

	if (entries.length === 0) {
		console.log(serial ? `No labels set for ${serial}.` : "No channel labels set.");
		return;
	}

	for (const [key, value] of entries) {
		const [s, ch] = key.split(":");
		console.log(`  ${s} Ch${ch}: ${value}`);
	}
}

async function clearLabel(serial: string, channel: number): Promise<void> {
	const config = await loadConfig();
	const labels = config.channelLabels ?? {};
	const key = channelLabelKey(serial, channel);
	if (!(key in labels)) {
		console.log(`No label set for Ch${channel} on ${serial}.`);
		return;
	}
	delete labels[key];
	await saveConfig({ ...config, channelLabels: labels });
	console.log(`Cleared label for Ch${channel} on ${serial}.`);
}

/** The label command: manage persistent local channel labels. */
export async function label(args: string[], options: OutputOptions): Promise<void> {
	const subcommand = args[0];
	switch (subcommand) {
		case "set": {
			const serial = requireSerial(args[1]);
			const channel = parseChannel(args[2]);
			const rawLabel = args.slice(3).join(" ");
			if (!rawLabel) {
				console.error("Missing label text.");
				usage();
			}
			await setLabel(serial, channel, rawLabel);
			break;
		}
		case "get": {
			const serial = requireSerial(args[1]);
			const channel = parseChannel(args[2]);
			await getLabel(serial, channel);
			break;
		}
		case "list":
			await listLabels(args[1], options);
			break;
		case "clear": {
			const serial = requireSerial(args[1]);
			const channel = parseChannel(args[2]);
			await clearLabel(serial, channel);
			break;
		}
		default:
			usage();
	}
}
