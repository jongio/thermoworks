import { type MeatProfile, resolveMeatProfile } from "thermoworks-sdk";

import { type OutputOptions, outputJson } from "../output.js";

/** Parse a named flag value from args (e.g., "--pit-band" "30" -> "30"). */
function getFlagValue(args: string[], flag: string): string | undefined {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

/** Validate an optional channel flag is an integer from 1 to 9. */
function parseChannelFlag(raw: string | undefined, name: string): number | undefined {
	if (raw === undefined) return undefined;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > 9) {
		console.error(`Invalid ${name}: ${raw}. Must be an integer from 1 to 9.`);
		process.exit(1);
	}
	return n;
}

/** Validate the pit band flag is a positive number. */
function parsePitBand(raw: string | undefined): number {
	if (raw === undefined) return 25;
	const n = Number(raw);
	if (!Number.isFinite(n) || n <= 0) {
		console.error(`Invalid --pit-band: ${raw}. Must be a positive number.`);
		process.exit(1);
	}
	return n;
}

/** Options that shape the suggested `alarm set` commands. */
export interface SuggestOptions {
	pitBand: number;
	serial?: string;
	meatChannel?: number;
	pitChannel?: number;
}

/** A recommended set of alarm thresholds for a cut of meat. */
export interface AlarmSuggestion {
	meat: string;
	doneness: string;
	meatProbe: { high: number | null };
	pit: { target: number; low: number; high: number; band: number };
	commands: string[];
}

/**
 * Build alarm suggestions for a meat profile: a high alarm on the meat probe at
 * the recommended pull temperature, and a pit band centered on the reference pit
 * temperature. Pure and offline so it is easy to test.
 */
export function buildAlarmSuggestion(profile: MeatProfile, opts: SuggestOptions): AlarmSuggestion {
	const band = opts.pitBand;
	const pitLow = profile.pitTempF - band;
	const pitHigh = profile.pitTempF + band;
	const meatHigh = profile.targetTempF;

	const serialToken = opts.serial ?? "<SERIAL>";
	const meatCh = opts.meatChannel != null ? String(opts.meatChannel) : "<MEAT_CH>";
	const pitCh = opts.pitChannel != null ? String(opts.pitChannel) : "<PIT_CH>";

	const commands: string[] = [];
	if (meatHigh != null) {
		commands.push(`thermoworks alarm set ${serialToken} --channel ${meatCh} --high ${meatHigh}`);
	}
	commands.push(
		`thermoworks alarm set ${serialToken} --channel ${pitCh} --high ${pitHigh} --low ${pitLow}`,
	);

	return {
		meat: profile.name,
		doneness: profile.doneness,
		meatProbe: { high: meatHigh },
		pit: { target: profile.pitTempF, low: pitLow, high: pitHigh, band },
		commands,
	};
}

/** Render a suggestion as a human-readable block. */
function formatSuggestion(s: AlarmSuggestion): string {
	const lines = [`Alarm suggestions for ${s.meat}:`];
	if (s.meatProbe.high != null) {
		lines.push(
			`  Meat probe high: ${s.meatProbe.high}\u00B0F  (pull temp; carryover adds a few more while it rests)`,
		);
	} else {
		lines.push(`  Meat probe high: none  (${s.doneness}, so judge this cut by feel)`);
	}
	lines.push(
		`  Pit band:        ${s.pit.low}-${s.pit.high}\u00B0F  (target ${s.pit.target}\u00B0F +/- ${s.pit.band})`,
	);
	lines.push("");
	lines.push("Set them with:");
	for (const c of s.commands) lines.push(`  ${c}`);
	return `${lines.join("\n")}\n`;
}

/**
 * Recommend pit and meat-probe alarm thresholds for a cut of meat, from the
 * built-in meat profiles. Offline: it needs no network access or login. Prints
 * the suggested thresholds and ready-to-edit `alarm set` commands; pass
 * `--serial`, `--meat-channel`, and `--pit-channel` to fill those commands in.
 * This command only suggests; it never writes to a device.
 */
export async function alarmSuggest(args: string[], options: OutputOptions): Promise<void> {
	const meat = args.find((a) => !a.startsWith("--"));
	if (!meat) {
		console.error(
			"Usage: thermoworks alarm suggest <MEAT> [--pit-band <deg>] [--serial <SN>] [--meat-channel <1-9>] [--pit-channel <1-9>] [--json]",
		);
		process.exit(1);
	}

	const profile = resolveMeatProfile(meat);
	if (!profile) {
		console.error(`Unknown meat: "${meat}". Run "thermoworks doneness" to see built-in cuts.`);
		process.exit(1);
	}

	const suggestion = buildAlarmSuggestion(profile, {
		pitBand: parsePitBand(getFlagValue(args, "--pit-band")),
		serial: getFlagValue(args, "--serial"),
		meatChannel: parseChannelFlag(getFlagValue(args, "--meat-channel"), "--meat-channel"),
		pitChannel: parseChannelFlag(getFlagValue(args, "--pit-channel"), "--pit-channel"),
	});

	if (options.json) {
		outputJson(suggestion);
		return;
	}

	process.stdout.write(formatSuggestion(suggestion));
}
