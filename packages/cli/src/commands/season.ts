import {
	calculateSeasoning,
	type DryBrinePlan,
	listRubRecipes,
	type RubPlan,
	resolveRubRecipe,
	type SeasoningPlan,
	type WetBrinePlan,
} from "thermoworks-sdk";

import { type OutputOptions, outputJson } from "../output.js";

/** Parsed options for the season command. */
export interface SeasonCommandOptions {
	weightLb?: number;
	recipe?: string;
	mode: "rub" | "wet-brine" | "dry-brine";
	list?: boolean;
}

/** Parse args after `season`. Returns an error message on failure. */
export function parseSeasonArgs(args: string[]): SeasonCommandOptions | { error: string } {
	const result: SeasonCommandOptions = { mode: "rub" };
	let brine = false;
	let dryBrine = false;

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
			result.weightLb = n;
		} else if (arg === "--recipe") {
			const value = args[++i];
			if (value === undefined) return { error: "--recipe requires a name" };
			result.recipe = value;
		} else if (arg === "--brine") {
			brine = true;
		} else if (arg === "--dry-brine") {
			dryBrine = true;
		} else if (arg === "--list") {
			result.list = true;
		} else if (arg.startsWith("--")) {
			return { error: `Unknown option: ${arg}` };
		} else if (result.weightLb === undefined) {
			const n = Number(arg);
			if (!Number.isFinite(n) || n <= 0) {
				return { error: `Weight must be a positive number, got "${arg}"` };
			}
			result.weightLb = n;
		} else {
			return { error: `Unexpected argument: ${arg}` };
		}
	}

	if (brine && dryBrine) {
		return { error: "--brine and --dry-brine cannot be used together" };
	}
	if (brine) result.mode = "wet-brine";
	if (dryBrine) result.mode = "dry-brine";

	return result;
}

function formatAmount(tablespoons: number): string {
	if (tablespoons <= 0) return "a pinch";
	if (tablespoons < 1) {
		const tsp = Math.round(tablespoons * 3 * 4) / 4;
		return `${tsp} tsp`;
	}
	return `${tablespoons} tbsp`;
}

/** Format the built-in rub recipes as a list. */
export function formatRecipeList(): string {
	const lines = ["Built-in rub recipes:\n"];
	for (const recipe of listRubRecipes()) {
		const items = recipe.ingredients.map((i) => i.name).join(", ");
		lines.push(`  ${recipe.name.padEnd(8)}  ${recipe.label}`);
		lines.push(`            ${items}`);
	}
	return `${lines.join("\n")}\n`;
}

function formatRub(plan: RubPlan): string {
	const width = Math.max(...plan.ingredients.map((i) => i.name.length));
	const lines = [
		`${plan.label} rub for ${plan.weightLb} lb (about ${plan.totalTablespoons} tbsp total):\n`,
	];
	for (const ingredient of plan.ingredients) {
		lines.push(`  ${ingredient.name.padEnd(width)}  ${formatAmount(ingredient.tablespoons)}`);
	}
	lines.push("");
	lines.push("  Mix, then coat the meat evenly and let it sit while the smoker heats.");
	return `${lines.join("\n")}\n`;
}

function formatWetBrine(plan: WetBrinePlan): string {
	return [
		`Wet brine for ${plan.weightLb} lb:\n`,
		`  Water:  ${plan.waterQuarts} qt`,
		`  Salt:   ${plan.saltGrams} g (about ${plan.saltCups} cup kosher) at ${plan.salinityPercent}% salinity`,
		`  Sugar:  ${plan.sugarGrams} g (optional)`,
		`  Time:   ${plan.minHours} to ${plan.maxHours} hours, refrigerated`,
		"",
		"  Dissolve the salt and sugar in the water, submerge the meat, and keep it cold.",
		"",
	].join("\n");
}

function formatDryBrine(plan: DryBrinePlan): string {
	return [
		`Dry brine for ${plan.weightLb} lb:\n`,
		`  Salt:  ${plan.saltGrams} g (about ${plan.saltTeaspoons} tsp kosher) at ${plan.saltPercent}% of weight`,
		`  Time:  ${plan.minHours} to ${plan.maxHours} hours, uncovered in the fridge`,
		"",
		"  Salt the surface evenly and rest it uncovered so the skin or bark dries out.",
		"",
	].join("\n");
}

/** Format any seasoning plan for the terminal. */
export function formatSeasoning(plan: SeasoningPlan): string {
	switch (plan.mode) {
		case "rub":
			return formatRub(plan);
		case "wet-brine":
			return formatWetBrine(plan);
		case "dry-brine":
			return formatDryBrine(plan);
	}
}

/**
 * Scale a dry rub or brine to the weight of a cut. Reads only built-in recipes
 * and standard ratios, so it needs no network access or login.
 *
 * - Default: a dry rub, scaled by `--weight`. Pick a recipe with `--recipe`.
 * - `--brine`: a wet brine plan (water, salt, sugar, time).
 * - `--dry-brine`: a dry brine plan (salt and fridge-rest time).
 * - `--list`: show the built-in rub recipes.
 */
export async function season(args: string[], options: OutputOptions): Promise<void> {
	const usage =
		"Usage: thermoworks season --weight <lb> [--recipe <name>] [--brine] [--dry-brine] [--list] [--json]";
	const parsed = parseSeasonArgs(args);
	if ("error" in parsed) {
		console.error(parsed.error);
		console.error(usage);
		process.exit(1);
	}

	if (parsed.list) {
		if (options.json) {
			outputJson(listRubRecipes());
			return;
		}
		process.stdout.write(formatRecipeList());
		return;
	}

	if (parsed.weightLb === undefined) {
		console.error("--weight is required (in pounds).");
		console.error(usage);
		process.exit(1);
	}

	if (parsed.mode === "rub" && parsed.recipe && !resolveRubRecipe(parsed.recipe)) {
		const names = listRubRecipes()
			.map((r) => r.name)
			.join(", ");
		console.error(`Unknown recipe: "${parsed.recipe}". Available: ${names}.`);
		process.exit(1);
	}

	const plan = calculateSeasoning(parsed.weightLb, {
		mode: parsed.mode,
		recipe: parsed.recipe,
	});

	if (options.json) {
		outputJson(plan);
		return;
	}

	process.stdout.write(formatSeasoning(plan));
}
