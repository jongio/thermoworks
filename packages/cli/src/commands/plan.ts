import { type CookPlan, type CookPlanItemInput, getMeatProfiles, planCook } from "thermoworks-sdk";

import { type OutputOptions, outputJson } from "../output.js";

/** Parsed options for the plan command. */
export interface PlanOptions {
	readyAt: Date;
	items: CookPlanItemInput[];
}

/**
 * Parse a `--ready` time. Accepts a full date-time (anything Date can parse
 * that includes a date) or a time of day like "6:00 PM", "6pm", or "18:00".
 * Time-of-day values resolve to today, rolling to tomorrow if already past.
 */
export function parseReadyTime(input: string, now: Date = new Date()): Date | null {
	const trimmed = input.trim();

	// Full date-time (contains a date separator or ISO marker).
	if (/[/T]/.test(trimmed) || /\d{4}-\d{2}-\d{2}/.test(trimmed)) {
		const parsed = new Date(trimmed);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(trimmed);
	if (!match) return null;

	let hours = Number.parseInt(match[1] ?? "", 10);
	const minutes = match[2] ? Number.parseInt(match[2], 10) : 0;
	const meridiem = match[3]?.toLowerCase();

	if (minutes > 59) return null;
	if (meridiem) {
		if (hours < 1 || hours > 12) return null;
		if (meridiem === "pm" && hours !== 12) hours += 12;
		if (meridiem === "am" && hours === 12) hours = 0;
	} else if (hours > 23) {
		return null;
	}

	const target = new Date(now);
	target.setHours(hours, minutes, 0, 0);
	if (target.getTime() <= now.getTime()) {
		target.setDate(target.getDate() + 1);
	}
	return target;
}

/**
 * Parse a single `--item` spec.
 * Forms: `NAME`, `NAME=WEIGHT` (pounds), or `NAME=Nh` (explicit cook hours).
 */
export function parseItemSpec(spec: string): CookPlanItemInput | null {
	const trimmed = spec.trim();
	if (!trimmed) return null;

	const eq = trimmed.indexOf("=");
	if (eq === -1) {
		return { meat: trimmed };
	}

	const name = trimmed.slice(0, eq).trim();
	const rawValue = trimmed.slice(eq + 1).trim();
	if (!name || !rawValue) return null;

	// Explicit hours form: trailing "h".
	if (/h$/i.test(rawValue)) {
		const hours = Number.parseFloat(rawValue.slice(0, -1));
		if (!Number.isFinite(hours) || hours <= 0) return null;
		return { label: name, hours };
	}

	const weightLb = Number.parseFloat(rawValue);
	if (!Number.isFinite(weightLb) || weightLb <= 0) return null;
	return { meat: name, weightLb };
}

/** Parse plan command args. Returns null when usage help should be shown. */
export function parsePlanArgs(args: string[]): PlanOptions | { listMeats: true } | null {
	if (args.includes("--list-meats")) {
		return { listMeats: true };
	}

	let ready: string | undefined;
	const itemSpecs: string[] = [];

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;
		if (arg === "--ready") {
			ready = args[++i];
			if (!ready) {
				console.error('--ready requires a time, e.g. --ready "6:00 PM"');
				process.exit(1);
			}
		} else if (arg === "--item") {
			const spec = args[++i];
			if (!spec) {
				console.error('--item requires a value, e.g. --item "brisket=12"');
				process.exit(1);
			}
			itemSpecs.push(spec);
		} else if (arg.startsWith("--")) {
			console.error(`Unknown option: ${arg}`);
			process.exit(1);
		}
	}

	if (!ready) {
		return null;
	}

	const readyAt = parseReadyTime(ready);
	if (!readyAt) {
		console.error(`Could not understand ready time: "${ready}". Try "6:00 PM" or "18:00".`);
		process.exit(1);
	}

	if (itemSpecs.length === 0) {
		console.error('Add at least one --item, e.g. --item "brisket=12" --item ribs');
		process.exit(1);
	}

	const items: CookPlanItemInput[] = [];
	for (const spec of itemSpecs) {
		const parsed = parseItemSpec(spec);
		if (!parsed) {
			console.error(`Could not understand item: "${spec}". Use NAME, NAME=WEIGHT, or NAME=Nh.`);
			process.exit(1);
		}
		items.push(parsed);
	}

	return { readyAt, items };
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

/** Format a cook plan as an aligned, human-readable timeline. */
export function formatPlan(plan: CookPlan): string {
	const lines: string[] = [];
	lines.push(`Cook plan - everything ready at ${formatClock(plan.readyAt)}\n`);

	const rows = plan.items.map((item) => ({
		start: formatClock(item.startAt),
		label: item.label,
		cook: formatDuration(item.cookMinutes),
		rest: item.restMinutes > 0 ? formatDuration(item.restMinutes) : "-",
		off: formatClock(item.removeAt),
	}));

	const header = { start: "Start", label: "Item", cook: "Cook", rest: "Rest", off: "Pull off" };
	const w = {
		start: Math.max(header.start.length, ...rows.map((r) => r.start.length)),
		label: Math.max(header.label.length, ...rows.map((r) => r.label.length)),
		cook: Math.max(header.cook.length, ...rows.map((r) => r.cook.length)),
		rest: Math.max(header.rest.length, ...rows.map((r) => r.rest.length)),
		off: Math.max(header.off.length, ...rows.map((r) => r.off.length)),
	};

	const line = (r: typeof header) =>
		`  ${r.start.padEnd(w.start)}  ${r.label.padEnd(w.label)}  ${r.cook.padEnd(w.cook)}  ${r.rest.padEnd(w.rest)}  ${r.off.padEnd(w.off)}`;

	lines.push(line(header));
	for (const r of rows) lines.push(line(r));
	return `${lines.join("\n")}\n`;
}

/** Format the built-in meat profiles as a table. */
export function formatMeatList(): string {
	const profiles = getMeatProfiles();
	const rows = profiles.map((p) => ({
		name: p.name,
		time: p.hoursPerPound != null ? `${p.hoursPerPound} h/lb` : `${p.fixedHours} h`,
		rest: `${p.restMinutes}m`,
		pit: `${p.pitTempF}\u00B0F`,
	}));
	const header = { name: "Meat", time: "Cook time", rest: "Rest", pit: "Pit" };
	const w = {
		name: Math.max(header.name.length, ...rows.map((r) => r.name.length)),
		time: Math.max(header.time.length, ...rows.map((r) => r.time.length)),
		rest: Math.max(header.rest.length, ...rows.map((r) => r.rest.length)),
		pit: Math.max(header.pit.length, ...rows.map((r) => r.pit.length)),
	};
	const line = (r: typeof header) =>
		`  ${r.name.padEnd(w.name)}  ${r.time.padEnd(w.time)}  ${r.rest.padEnd(w.rest)}  ${r.pit.padEnd(w.pit)}`;
	const lines = ["Built-in meat profiles:\n", line(header)];
	for (const r of rows) lines.push(line(r));
	return `${lines.join("\n")}\n`;
}

const USAGE =
	'Usage: thermoworks plan --ready "6:00 PM" --item "brisket=12" [--item ribs] [--json]\n' +
	"       thermoworks plan --list-meats\n" +
	"\n" +
	"Item forms: NAME (fixed-time cut), NAME=WEIGHT (pounds), NAME=Nh (explicit hours).";

/** The plan command handler. Requires no network access. */
export async function plan(
	args: string[],
	options: OutputOptions = { json: false },
): Promise<void> {
	const parsed = parsePlanArgs(args);

	if (parsed === null) {
		console.log(USAGE);
		return;
	}

	if ("listMeats" in parsed) {
		if (options.json) {
			outputJson(getMeatProfiles());
			return;
		}
		process.stdout.write(formatMeatList());
		return;
	}

	let result: CookPlan;
	try {
		result = planCook(parsed.items, { readyAt: parsed.readyAt });
	} catch (err) {
		console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
		process.exit(1);
	}

	if (options.json) {
		outputJson(result);
		return;
	}
	process.stdout.write(formatPlan(result));
}
