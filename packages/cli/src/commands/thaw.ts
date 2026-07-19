import {
	listThawProfiles,
	planThaw,
	type ThawMethod,
	type ThawPlan,
	type ThawProfile,
} from "thermoworks-sdk";

import { type OutputOptions, outputJson } from "../output.js";

interface ParsedThawArgs {
	meat?: string;
	weightLb?: number;
	method?: ThawMethod;
	readyAt?: Date;
	list: boolean;
}

function formatHours(hours: number): string {
	if (hours < 1) return `${Math.round(hours * 60)}m`;
	const whole = Math.floor(hours);
	const minutes = Math.round((hours - whole) * 60);
	if (minutes === 0) return `${whole}h`;
	return `${whole}h ${minutes}m`;
}

function formatDate(date: Date | null): string {
	return date ? date.toLocaleString() : "-";
}

/** Parse args after `thaw`. */
export function parseThawArgs(args: string[]): ParsedThawArgs | { error: string } {
	const parsed: ParsedThawArgs = { list: false };
	const meatParts: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;
		if (arg === "--list") {
			parsed.list = true;
		} else if (arg === "--weight") {
			const value = args[++i];
			if (value === undefined) return { error: "--weight requires pounds" };
			const weight = Number(value);
			if (!Number.isFinite(weight) || weight <= 0) {
				return { error: `--weight must be a positive number, got "${value}"` };
			}
			parsed.weightLb = weight;
		} else if (arg === "--method") {
			const value = args[++i];
			if (value === undefined) return { error: "--method requires fridge or cold-water" };
			if (value !== "fridge" && value !== "cold-water") {
				return { error: `Unknown thaw method: ${value}` };
			}
			parsed.method = value;
		} else if (arg === "--ready") {
			const value = args[++i];
			if (value === undefined) return { error: "--ready requires a date or time" };
			const readyAt = new Date(value);
			if (Number.isNaN(readyAt.getTime())) return { error: `Invalid ready time: ${value}` };
			parsed.readyAt = readyAt;
		} else if (arg.startsWith("--")) {
			return { error: `Unknown option: ${arg}` };
		} else {
			meatParts.push(arg);
		}
	}

	if (meatParts.length > 0) parsed.meat = meatParts.join(" ");
	return parsed;
}

/** Format thaw reference data as a table. */
export function formatThawProfileTable(profiles: ThawProfile[]): string {
	const header = { meat: "Meat", fridge: "Fridge", water: "Cold water" };
	const rows = profiles.map((profile) => ({
		meat: profile.meat,
		fridge: `${profile.fridgeHoursPerPound}h/lb`,
		water: `${profile.coldWaterMinutesPerPound}m/lb`,
	}));
	const widths = {
		meat: Math.max(header.meat.length, ...rows.map((row) => row.meat.length)),
		fridge: Math.max(header.fridge.length, ...rows.map((row) => row.fridge.length)),
	};
	const lines = [
		"Thaw timing guide:\n",
		`  ${header.meat.padEnd(widths.meat)}  ${header.fridge.padEnd(widths.fridge)}  ${header.water}`,
	];
	for (const row of rows) {
		lines.push(
			`  ${row.meat.padEnd(widths.meat)}  ${row.fridge.padEnd(widths.fridge)}  ${row.water}`,
		);
	}
	return `${lines.join("\n")}\n`;
}

/** Format a thaw plan as human-readable text. */
export function formatThawPlan(plan: ThawPlan): string {
	const lines = [
		`Thaw plan for ${plan.meat} (${plan.weightLb} lb)`,
		`  Method:       ${plan.method}`,
		`  Thaw time:    ${formatHours(plan.thawHours)}`,
		`  Buffer:       ${formatHours(plan.bufferHours)}`,
		`  Total window: ${formatHours(plan.totalHours)}`,
		`  Start thaw:   ${formatDate(plan.startAt)}`,
		`  Ready by:     ${formatDate(plan.readyAt)}`,
		`  Note:         ${plan.note}`,
	];
	return `${lines.join("\n")}\n`;
}

/** Plan safe thaw timing for a frozen cut. */
export async function thaw(
	args: string[],
	options: OutputOptions = { json: false },
): Promise<void> {
	const usage =
		'Usage: thermoworks thaw <meat> --weight LB [--method fridge|cold-water] [--ready "DATE"] [--list] [--json]';
	const parsed = parseThawArgs(args);
	if ("error" in parsed) {
		console.error(parsed.error);
		console.error(usage);
		process.exit(1);
	}

	if (parsed.list) {
		const profiles = listThawProfiles();
		if (options.json) {
			outputJson(profiles);
			return;
		}
		process.stdout.write(formatThawProfileTable(profiles));
		return;
	}

	if (!parsed.meat || parsed.weightLb === undefined) {
		console.error(usage);
		process.exit(1);
	}

	try {
		const plan = planThaw(parsed.meat, parsed.weightLb, {
			method: parsed.method,
			readyAt: parsed.readyAt,
		});
		if (options.json) {
			outputJson(plan);
			return;
		}
		process.stdout.write(formatThawPlan(plan));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
