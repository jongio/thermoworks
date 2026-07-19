import {
	type Appetite,
	calculatePortions,
	listAppetites,
	listPortionYields,
	type PortionPlan,
} from "thermoworks-sdk";

import { type OutputOptions, outputJson } from "../output.js";

const APPETITES: Appetite[] = ["light", "standard", "hearty"];

/** Parsed options for the portions command. */
export interface PortionsCommandOptions {
	meat?: string;
	guests?: number;
	appetite?: Appetite;
	perPersonOz?: number;
	list?: boolean;
}

function isAppetite(value: string): value is Appetite {
	return (APPETITES as string[]).includes(value);
}

/** Parse args after `portions`. Returns an error message on failure. */
export function parsePortionsArgs(args: string[]): PortionsCommandOptions | { error: string } {
	const result: PortionsCommandOptions = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		if (arg === "--guests") {
			const value = args[++i];
			if (value === undefined) return { error: "--guests requires a count" };
			const n = Number(value);
			if (!Number.isInteger(n) || n <= 0) {
				return { error: `--guests must be a positive whole number, got "${value}"` };
			}
			result.guests = n;
		} else if (arg === "--appetite") {
			const value = args[++i];
			if (value === undefined) return { error: "--appetite requires a value" };
			if (!isAppetite(value)) {
				return { error: `Unknown appetite: "${value}". Available: ${APPETITES.join(", ")}.` };
			}
			result.appetite = value;
		} else if (arg === "--per-person") {
			const value = args[++i];
			if (value === undefined) return { error: "--per-person requires a value in ounces" };
			const n = Number(value);
			if (!Number.isFinite(n) || n <= 0) {
				return { error: `--per-person must be a positive number, got "${value}"` };
			}
			result.perPersonOz = n;
		} else if (arg === "--list") {
			result.list = true;
		} else if (arg.startsWith("--")) {
			return { error: `Unknown option: ${arg}` };
		} else if (result.meat === undefined) {
			result.meat = arg;
		} else {
			return { error: `Unexpected argument: ${arg}` };
		}
	}

	if (result.appetite && result.perPersonOz !== undefined) {
		return { error: "--appetite and --per-person cannot be used together" };
	}

	return result;
}

/** Format the per-cut yields and appetite presets as a list. */
export function formatPortionList(): string {
	const lines = ["Cook yields (cooked weight kept from raw):\n"];
	for (const item of listPortionYields()) {
		lines.push(`  ${item.meat.padEnd(16)}  ${item.yieldPercent}%`);
	}
	lines.push("");
	lines.push("Appetite presets (cooked oz per person):");
	for (const item of listAppetites()) {
		lines.push(`  ${item.appetite.padEnd(10)}  ${item.ounces} oz`);
	}
	lines.push("");
	return `${lines.join("\n")}\n`;
}

/** Format a portion plan for the terminal. */
export function formatPortions(plan: PortionPlan): string {
	const serving =
		plan.appetite !== null
			? `${plan.servingOz} oz per person (${plan.appetite})`
			: `${plan.servingOz} oz per person`;
	return [
		`${plan.meat} for ${plan.guests} guests:\n`,
		`  Serving:  ${serving}`,
		`  Cooked:   ${plan.cookedLb} lb to serve`,
		`  Yield:    ${plan.yieldPercent}% (cooked from raw)`,
		`  Buy:      ${plan.rawLb} lb raw`,
		"",
		"  Yields are averages, so round up if you want leftovers.",
		"",
	].join("\n");
}

/**
 * Plan how much raw meat to buy for a headcount. Reads only built-in cook
 * yields and the shared meat registry, so it needs no network access or login.
 *
 * - `<meat>` and `--guests N` are required for a plan.
 * - `--appetite light|standard|hearty` sets the serving size.
 * - `--per-person OZ` sets an explicit cooked serving instead.
 * - `--list`: show the per-cut yields and appetite presets.
 */
export async function portions(args: string[], options: OutputOptions): Promise<void> {
	const usage =
		"Usage: thermoworks portions <meat> --guests N [--appetite light|standard|hearty] [--per-person OZ] [--list] [--json]";
	const parsed = parsePortionsArgs(args);
	if ("error" in parsed) {
		console.error(parsed.error);
		console.error(usage);
		process.exit(1);
	}

	if (parsed.list) {
		if (options.json) {
			outputJson({ yields: listPortionYields(), appetites: listAppetites() });
			return;
		}
		process.stdout.write(formatPortionList());
		return;
	}

	if (parsed.meat === undefined) {
		console.error("A meat is required (for example: portions brisket --guests 12).");
		console.error(usage);
		process.exit(1);
	}
	if (parsed.guests === undefined) {
		console.error("--guests is required.");
		console.error(usage);
		process.exit(1);
	}

	let plan: PortionPlan;
	try {
		plan = calculatePortions(parsed.meat, parsed.guests, {
			appetite: parsed.appetite,
			perPersonOz: parsed.perPersonOz,
		});
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}

	if (options.json) {
		outputJson(plan);
		return;
	}

	process.stdout.write(formatPortions(plan));
}
