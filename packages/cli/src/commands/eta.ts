import { predictDoneTime, ThermoworksCloud } from "thermoworks-sdk";

import { firstPositional } from "../args.js";
import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Parse a named flag value from args (e.g., "--target" "203" -> "203"). */
function getFlagValue(args: string[], flag: string): string | undefined {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

/** Validate an optional channel flag is an integer from 1 to 9. */
function parseChannelFlag(raw: string | undefined): number | undefined {
	if (raw === undefined) return undefined;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > 9) {
		console.error(`Invalid channel: ${raw}. Must be an integer from 1 to 9.`);
		process.exit(1);
	}
	return n;
}

/** Validate an optional numeric target flag. */
function parseTargetFlag(raw: string | undefined): number | undefined {
	if (raw === undefined) return undefined;
	const n = Number(raw);
	if (!Number.isFinite(n)) {
		console.error(`Invalid target: ${raw}. Must be a number.`);
		process.exit(1);
	}
	return n;
}

/** Parsed options for the eta command. */
export interface EtaArgs {
	serial: string;
	channel: number;
	target?: number;
}

/**
 * Parse eta-specific CLI args.
 * Expected: eta SERIAL [--channel N] [--target F]
 * Channel defaults to 1. Returns null when the serial is missing.
 */
export function parseEtaArgs(args: string[]): EtaArgs | null {
	const serial = firstPositional(args, ["--channel", "--target"]);
	if (!serial) return null;

	const channel = parseChannelFlag(getFlagValue(args, "--channel")) ?? 1;
	const target = parseTargetFlag(getFlagValue(args, "--target"));

	return { serial, channel, target };
}

/** Format a minute count as `~Xh Ymin`, `~Xh`, or `~Ymin`. */
function formatMinutes(minutes: number): string {
	if (minutes >= 60) {
		const hrs = Math.floor(minutes / 60);
		const rem = minutes % 60;
		return rem > 0 ? `~${hrs}h ${rem}min` : `~${hrs}h`;
	}
	return `~${minutes}min`;
}

/**
 * Estimate time-to-target for a single probe channel, in one shot, for scripts.
 * Reads the channel's current temperature and rate of change and runs the same
 * done-time prediction that powers the live `watch` ETA. The target is the
 * channel's enabled high alarm unless `--target` is given. Use `--json` for
 * machine-readable output.
 */
export async function eta(args: string[], options: OutputOptions): Promise<void> {
	const parsed = parseEtaArgs(args);
	if (!parsed) {
		console.error("Usage: thermoworks eta <SERIAL> [--channel <1-9>] [--target <temp>] [--json]");
		process.exit(1);
	}

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const ch = await client.getDeviceChannel(parsed.serial, parsed.channel);
		const current = ch.value;
		const units = ch.units ?? "F";
		const rate = ch.rateOfChange ?? 0;

		if (current == null) {
			console.error(`No reading for channel ${parsed.channel} on ${parsed.serial}.`);
			process.exit(1);
		}

		const target = parsed.target ?? (ch.alarmHigh?.enabled ? ch.alarmHigh.value : null) ?? null;
		if (target == null) {
			console.error(
				`No target for channel ${parsed.channel} on ${parsed.serial}. Set a high alarm or pass --target <temp>.`,
			);
			process.exit(1);
		}

		const prediction = predictDoneTime(current, target, rate);

		if (options.json) {
			outputJson({
				serial: parsed.serial,
				channel: parsed.channel,
				current,
				target,
				units,
				rateOfChange: ch.rateOfChange,
				estimatedMinutes: prediction.estimatedMinutes,
				estimatedTime: prediction.estimatedTime,
				confidence: prediction.confidence,
				method: prediction.method,
			});
			return;
		}

		if (prediction.estimatedMinutes === 0) {
			console.log(
				`${parsed.serial} channel ${parsed.channel} is at or past ${target}\u00B0${units}. Done.`,
			);
			return;
		}

		if (prediction.estimatedMinutes == null) {
			console.log(
				`Cannot estimate for ${parsed.serial} channel ${parsed.channel}: temperature is not rising (rate ${ch.rateOfChange ?? 0}\u00B0/min).`,
			);
			return;
		}

		const timeLeft = formatMinutes(prediction.estimatedMinutes);
		const when = new Date(prediction.estimatedTime ?? Date.now()).toLocaleTimeString();
		console.log(`ETA for ${parsed.serial} channel ${parsed.channel}:`);
		console.log(`  Now:        ${current}\u00B0${units}  ->  target ${target}\u00B0${units}`);
		console.log(`  Time left:  ${timeLeft} (around ${when})`);
		console.log(`  Confidence: ${prediction.confidence}`);
	} finally {
		client.close();
	}
}
