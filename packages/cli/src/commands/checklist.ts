import { getMeatProfiles, type MeatProfile, resolveMeatProfile } from "thermoworks-sdk";

import { type OutputOptions, outputJson } from "../output.js";
import { parseReadyTime } from "./plan.js";

export interface ChecklistStep {
	readonly id: string;
	readonly title: string;
	readonly detail: string;
	readonly dueAt?: Date;
}

export interface CookChecklist {
	readonly meat: MeatProfile;
	readonly weightLb: number | null;
	readonly readyAt: Date | null;
	readonly cookMinutes: number | null;
	readonly startAt: Date | null;
	readonly pullAt: Date | null;
	readonly steps: ChecklistStep[];
}

export interface ChecklistArgs {
	readonly meat?: string;
	readonly weightLb?: number;
	readonly readyAt?: Date;
	readonly listMeats?: boolean;
}

function addMinutes(date: Date, minutes: number): Date {
	return new Date(date.getTime() + minutes * 60_000);
}

function formatClock(date: Date): string {
	return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDuration(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h > 0 && m > 0) return `${h}h ${m}m`;
	if (h > 0) return `${h}h`;
	return `${m}m`;
}

function formatCookEstimate(profile: MeatProfile, weightLb: number | null): string {
	if (profile.hoursPerPound != null) {
		const suffix = weightLb ? `, ${weightLb} lb` : "";
		return `${profile.hoursPerPound} h/lb${suffix}`;
	}
	return `${profile.fixedHours ?? 0} h`;
}

function cookMinutesFor(profile: MeatProfile, weightLb: number | null): number | null {
	if (profile.hoursPerPound != null) {
		if (!weightLb) return null;
		return Math.round(profile.hoursPerPound * weightLb * 60);
	}
	if (profile.fixedHours != null) return Math.round(profile.fixedHours * 60);
	return null;
}

function needsWrapCheck(profile: MeatProfile): boolean {
	const name = profile.name.toLowerCase();
	return (
		name.includes("brisket") ||
		name.includes("pork butt") ||
		name.includes("ribs") ||
		name.includes("short ribs")
	);
}

export function parseChecklistArgs(args: string[]): ChecklistArgs | { error: string } {
	const positionals: string[] = [];
	let weightLb: number | undefined;
	let readyAt: Date | undefined;
	let listMeats = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		if (arg === "--list-meats") {
			listMeats = true;
		} else if (arg === "--weight") {
			const value = args[++i];
			if (value === undefined) return { error: "--weight requires a value in pounds" };
			const parsed = Number(value);
			if (!Number.isFinite(parsed) || parsed <= 0) {
				return { error: `--weight must be a positive number, got "${value}"` };
			}
			weightLb = parsed;
		} else if (arg === "--ready") {
			const value = args[++i];
			if (value === undefined) return { error: '--ready requires a time, e.g. "6:00 PM"' };
			const parsed = parseReadyTime(value);
			if (!parsed) return { error: `Could not understand ready time: "${value}"` };
			readyAt = parsed;
		} else if (arg.startsWith("--")) {
			return { error: `Unknown option: ${arg}` };
		} else {
			positionals.push(arg);
		}
	}

	if (listMeats) return { listMeats: true };
	if (positionals.length === 0) return { error: "Pass a meat name or --list-meats" };
	return {
		meat: positionals.join(" "),
		weightLb,
		readyAt,
	};
}

export function buildCookChecklist(
	profile: MeatProfile,
	options: { weightLb?: number; readyAt?: Date } = {},
): CookChecklist {
	const weightLb = options.weightLb ?? null;
	const cookMinutes = cookMinutesFor(profile, weightLb);
	const readyAt = options.readyAt ?? null;
	const pullAt = readyAt && cookMinutes != null ? addMinutes(readyAt, -profile.restMinutes) : null;
	const startAt = pullAt && cookMinutes != null ? addMinutes(pullAt, -cookMinutes) : null;
	const probeTarget =
		profile.targetTempF != null ? `${profile.targetTempF}\u00B0F` : profile.doneness;

	const steps: ChecklistStep[] = [
		{
			id: "prep",
			title: "Prep pit and probes",
			detail: `Preheat the pit to ${profile.pitTempF}\u00B0F, verify probe batteries, and set high/low alarms before the food goes on.`,
			dueAt: startAt ? addMinutes(startAt, -30) : undefined,
		},
		{
			id: "start",
			title: `Put ${profile.name} on`,
			detail: `Place the meat probe in the thickest part and keep the pit probe near grate level. Estimate: ${formatCookEstimate(
				profile,
				weightLb,
			)}.`,
			dueAt: startAt ?? undefined,
		},
		{
			id: "monitor",
			title: "Watch the trend",
			detail:
				"Check that the temperature rises steadily, alarms are armed, and the pit stays near the target.",
			dueAt: startAt
				? addMinutes(startAt, Math.min(120, Math.max(30, (cookMinutes ?? 120) / 4)))
				: undefined,
		},
	];

	if (needsWrapCheck(profile)) {
		steps.push({
			id: "wrap",
			title: "Check the stall and wrap",
			detail:
				"Near 160 to 170\u00B0F, decide whether to wrap based on bark color, stall time, and how fast dinner needs to land.",
			dueAt: startAt && cookMinutes != null ? addMinutes(startAt, cookMinutes * 0.6) : undefined,
		});
	}

	steps.push(
		{
			id: "pull",
			title: "Pull at the target",
			detail: `Pull when the probe reaches ${probeTarget}. ${profile.doneness}.`,
			dueAt: pullAt ?? undefined,
		},
		{
			id: "rest",
			title: "Rest before serving",
			detail: `Rest for ${formatDuration(profile.restMinutes)} so juices settle and carryover finishes.`,
			dueAt: pullAt ?? undefined,
		},
		{
			id: "serve",
			title: "Serve",
			detail: "Slice, pull, or portion the food and log the result for next time.",
			dueAt: readyAt ?? undefined,
		},
	);

	return {
		meat: profile,
		weightLb,
		readyAt,
		cookMinutes,
		startAt,
		pullAt,
		steps,
	};
}

export function formatChecklist(checklist: CookChecklist): string {
	const { meat } = checklist;
	const pull = meat.targetTempF != null ? `${meat.targetTempF}\u00B0F` : "by feel";
	const lines = [
		`Cook-day checklist - ${meat.name}`,
		`Pit: ${meat.pitTempF}\u00B0F  Pull: ${pull}  Rest: ${formatDuration(meat.restMinutes)}`,
		`Estimate: ${formatCookEstimate(meat, checklist.weightLb)}`,
	];

	if (checklist.readyAt && checklist.startAt && checklist.pullAt) {
		lines.push(
			`Timing: start ${formatClock(checklist.startAt)}, pull ${formatClock(
				checklist.pullAt,
			)}, serve ${formatClock(checklist.readyAt)}`,
		);
	} else if (meat.hoursPerPound != null && !checklist.weightLb) {
		lines.push("Tip: add --weight and --ready to calculate start and pull times.");
	} else if (!checklist.readyAt) {
		lines.push("Tip: add --ready to calculate start and pull times.");
	}

	lines.push("");
	checklist.steps.forEach((step, index) => {
		const prefix = step.dueAt ? `[${formatClock(step.dueAt)}] ` : "";
		lines.push(`${index + 1}. ${prefix}${step.title}`);
		lines.push(`   ${step.detail}`);
	});
	return `${lines.join("\n")}\n`;
}

export function formatChecklistMeatList(): string {
	const names = getMeatProfiles().map((profile) => profile.name);
	return `Built-in checklist meats:\n  ${names.join("\n  ")}\n`;
}

const USAGE =
	'Usage: thermoworks checklist <meat> [--weight LB] [--ready "6:00 PM"] [--json]\n' +
	"       thermoworks checklist --list-meats";

export async function checklist(
	args: string[],
	options: OutputOptions = { json: false },
): Promise<void> {
	const parsed = parseChecklistArgs(args);
	if ("error" in parsed) {
		console.error(parsed.error);
		console.error(USAGE);
		process.exit(1);
	}

	if (parsed.listMeats) {
		if (options.json) {
			outputJson(getMeatProfiles());
			return;
		}
		process.stdout.write(formatChecklistMeatList());
		return;
	}

	const profile = resolveMeatProfile(parsed.meat ?? "");
	if (!profile) {
		console.error(`Unknown meat: "${parsed.meat}". Run: thermoworks checklist --list-meats`);
		process.exit(1);
	}

	const result = buildCookChecklist(profile, {
		weightLb: parsed.weightLb,
		readyAt: parsed.readyAt,
	});

	if (options.json) {
		outputJson(result);
		return;
	}

	process.stdout.write(formatChecklist(result));
}
