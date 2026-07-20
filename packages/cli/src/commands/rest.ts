import { planRest, type RestPlan } from "thermoworks-sdk";

import { type OutputOptions, outputJson } from "../output.js";

/** Parsed options for the rest command. */
export interface RestCommandOptions {
	readonly meat?: string;
	readonly weightLb?: number;
}

/** Parse args after `rest`. Returns an error message on failure. */
export function parseRestArgs(args: string[]): RestCommandOptions | { error: string } {
	const meatParts: string[] = [];
	let weightLb: number | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		if (arg === "--weight") {
			const value = args[++i];
			if (value === undefined) return { error: "--weight requires a value in pounds" };
			const n = Number(value);
			if (!Number.isFinite(n) || n <= 0) {
				return { error: `--weight must be a positive number, got "${value}"` };
			}
			weightLb = n;
		} else if (arg.startsWith("--")) {
			return { error: `Unknown option: ${arg}` };
		} else {
			meatParts.push(arg);
		}
	}

	return { meat: meatParts.join(" ").trim() || undefined, weightLb };
}

function formatRange(plan: RestPlan): string {
	return plan.minMinutes === plan.maxMinutes
		? `${plan.minMinutes} minutes`
		: `${plan.minMinutes} to ${plan.maxMinutes} minutes`;
}

function formatServingRange(plan: RestPlan): string | null {
	if (!plan.servingTemperatureF) return null;
	return `${plan.servingTemperatureF.minF}-${plan.servingTemperatureF.maxF}\u00B0F internal`;
}

/** Format a rest plan for terminal output. */
export function formatRestPlan(plan: RestPlan): string {
	const heading =
		plan.weightLb != null
			? `Rest plan for ${plan.meat} (${plan.weightLb} lb)`
			: `Rest plan for ${plan.meat}`;
	const lines = [
		heading,
		`  Window: ${formatRange(plan)}`,
		`  Hold:   ${plan.holdMethod}`,
		`  Note:   ${plan.note}`,
	];
	const servingRange = formatServingRange(plan);
	if (servingRange) lines.splice(2, 0, `  Serve:  ${servingRange}`);
	lines.push("  Steps:");
	for (const [index, step] of plan.steps.entries()) {
		lines.push(`    ${index + 1}. ${step}`);
	}
	return `${lines.join("\n")}\n`;
}

/**
 * Suggest a rest and holding window for a common barbecue cut. This command is
 * offline and uses the SDK's built-in meat aliases.
 */
export async function rest(args: string[], options: OutputOptions): Promise<void> {
	const usage = "Usage: thermoworks rest <MEAT> [--weight <lb>] [--json]";
	const parsed = parseRestArgs(args);
	if ("error" in parsed) {
		console.error(parsed.error);
		console.error(usage);
		process.exit(1);
	}

	if (!parsed.meat) {
		console.error(usage);
		process.exit(1);
	}

	let plan: RestPlan;
	try {
		plan = planRest(parsed.meat, { weightLb: parsed.weightLb });
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		console.error(usage);
		process.exit(1);
		return;
	}

	if (options.json) {
		outputJson(plan);
		return;
	}

	process.stdout.write(formatRestPlan(plan));
}
