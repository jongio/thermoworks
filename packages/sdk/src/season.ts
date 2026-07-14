// ─── Seasoning Calculator ────────────────────────────────────────────────────
//
// Offline helpers that scale dry rubs and brines to the weight of a cut. Pure
// and side-effect free: no network, no clock, no files. All math is deterministic
// so the CLI and any other caller get the same numbers for the same inputs.

const GRAMS_PER_POUND = 453.592;
const GRAMS_PER_QUART_WATER = 946.353;
const TSP_PER_TABLESPOON = 3;
// Diamond Crystal kosher salt, a common baseline for seasoning by volume.
const GRAMS_PER_TSP_KOSHER = 2.84;
const GRAMS_PER_CUP_KOSHER = GRAMS_PER_TSP_KOSHER * TSP_PER_TABLESPOON * 16;

/** A single ingredient in a dry-rub recipe, weighted by parts. */
export interface RubIngredient {
	readonly name: string;
	readonly parts: number;
}

/** A named dry-rub recipe and how heavily to apply it. */
export interface RubRecipe {
	readonly name: string;
	readonly label: string;
	/** Tablespoons of finished rub to apply per pound of meat. */
	readonly tablespoonsPerPound: number;
	readonly ingredients: readonly RubIngredient[];
}

const RUB_RECIPES: Record<string, RubRecipe> = {
	classic: {
		name: "classic",
		label: "Classic BBQ",
		tablespoonsPerPound: 1,
		ingredients: [
			{ name: "paprika", parts: 8 },
			{ name: "brown sugar", parts: 8 },
			{ name: "kosher salt", parts: 4 },
			{ name: "black pepper", parts: 4 },
			{ name: "garlic powder", parts: 2 },
			{ name: "onion powder", parts: 2 },
			{ name: "chili powder", parts: 2 },
			{ name: "cumin", parts: 1 },
		],
	},
	texas: {
		name: "texas",
		label: "Texas salt and pepper",
		tablespoonsPerPound: 1,
		ingredients: [
			{ name: "kosher salt", parts: 2 },
			{ name: "coarse black pepper", parts: 2 },
			{ name: "garlic powder", parts: 1 },
		],
	},
	coffee: {
		name: "coffee",
		label: "Coffee chophouse",
		tablespoonsPerPound: 1,
		ingredients: [
			{ name: "ground coffee", parts: 4 },
			{ name: "brown sugar", parts: 4 },
			{ name: "paprika", parts: 2 },
			{ name: "kosher salt", parts: 2 },
			{ name: "black pepper", parts: 2 },
			{ name: "cocoa", parts: 1 },
		],
	},
	cajun: {
		name: "cajun",
		label: "Cajun",
		tablespoonsPerPound: 1,
		ingredients: [
			{ name: "paprika", parts: 4 },
			{ name: "kosher salt", parts: 2 },
			{ name: "garlic powder", parts: 2 },
			{ name: "onion powder", parts: 2 },
			{ name: "cayenne", parts: 1 },
			{ name: "oregano", parts: 1 },
			{ name: "thyme", parts: 1 },
			{ name: "black pepper", parts: 1 },
		],
	},
	sweet: {
		name: "sweet",
		label: "Sweet and smoky",
		tablespoonsPerPound: 1,
		ingredients: [
			{ name: "brown sugar", parts: 10 },
			{ name: "paprika", parts: 4 },
			{ name: "kosher salt", parts: 3 },
			{ name: "smoked paprika", parts: 2 },
			{ name: "black pepper", parts: 1 },
			{ name: "garlic powder", parts: 1 },
		],
	},
};

const DEFAULT_RECIPE = "classic";
const DEFAULT_WET_SALINITY_PERCENT = 5;
const DEFAULT_DRY_SALT_PERCENT = 1;

/** A scaled amount of one rub ingredient. */
export interface SeasoningIngredientAmount {
	readonly name: string;
	/** Tablespoons of this ingredient, rounded to the nearest quarter tablespoon. */
	readonly tablespoons: number;
}

/** A scaled dry-rub plan. */
export interface RubPlan {
	readonly mode: "rub";
	readonly recipe: string;
	readonly label: string;
	readonly weightLb: number;
	readonly totalTablespoons: number;
	readonly ingredients: readonly SeasoningIngredientAmount[];
}

/** A scaled wet-brine plan. */
export interface WetBrinePlan {
	readonly mode: "wet-brine";
	readonly weightLb: number;
	readonly waterQuarts: number;
	readonly salinityPercent: number;
	readonly saltGrams: number;
	readonly saltCups: number;
	readonly sugarGrams: number;
	readonly minHours: number;
	readonly maxHours: number;
}

/** A scaled dry-brine plan. */
export interface DryBrinePlan {
	readonly mode: "dry-brine";
	readonly weightLb: number;
	readonly saltPercent: number;
	readonly saltGrams: number;
	readonly saltTeaspoons: number;
	readonly minHours: number;
	readonly maxHours: number;
}

/** The result of {@link calculateSeasoning}. */
export type SeasoningPlan = RubPlan | WetBrinePlan | DryBrinePlan;

/** Options for {@link calculateSeasoning}. */
export interface SeasoningOptions {
	/** Which seasoning to compute. Defaults to a dry rub. */
	mode?: "rub" | "wet-brine" | "dry-brine";
	/** Dry-rub recipe name (rub mode). Defaults to "classic". */
	recipe?: string;
	/** Wet-brine salinity as a percent of the water weight. Defaults to 5. */
	salinityPercent?: number;
	/** Dry-brine salt as a percent of the meat weight. Defaults to 1. */
	saltPercent?: number;
}

function roundTo(value: number, step: number): number {
	return Math.round(value / step) * step;
}

function round1(value: number): number {
	return Math.round(value * 10) / 10;
}

/** List the built-in dry-rub recipes. */
export function listRubRecipes(): RubRecipe[] {
	return Object.values(RUB_RECIPES);
}

/** Look up a dry-rub recipe by name (case-insensitive). Returns null if unknown. */
export function resolveRubRecipe(name: string): RubRecipe | null {
	return RUB_RECIPES[name.trim().toLowerCase()] ?? null;
}

function buildRubPlan(weightLb: number, recipe: RubRecipe): RubPlan {
	const totalParts = recipe.ingredients.reduce((sum, i) => sum + i.parts, 0);
	const totalTablespoons = weightLb * recipe.tablespoonsPerPound;

	const ingredients = recipe.ingredients.map((ingredient) => ({
		name: ingredient.name,
		tablespoons: roundTo((totalTablespoons * ingredient.parts) / totalParts, 0.25),
	}));

	return {
		mode: "rub",
		recipe: recipe.name,
		label: recipe.label,
		weightLb,
		totalTablespoons: round1(totalTablespoons),
		ingredients,
	};
}

function buildWetBrinePlan(weightLb: number, salinityPercent: number): WetBrinePlan {
	const waterQuarts = Math.max(1, Math.round(weightLb));
	const waterGrams = waterQuarts * GRAMS_PER_QUART_WATER;
	const saltGrams = waterGrams * (salinityPercent / 100);

	return {
		mode: "wet-brine",
		weightLb,
		waterQuarts,
		salinityPercent,
		saltGrams: Math.round(saltGrams),
		saltCups: round1(saltGrams / GRAMS_PER_CUP_KOSHER),
		sugarGrams: Math.round(saltGrams * 0.5),
		minHours: Math.max(2, Math.round(weightLb)),
		maxHours: Math.max(4, Math.round(weightLb * 1.5)),
	};
}

function buildDryBrinePlan(weightLb: number, saltPercent: number): DryBrinePlan {
	const meatGrams = weightLb * GRAMS_PER_POUND;
	const saltGrams = meatGrams * (saltPercent / 100);

	return {
		mode: "dry-brine",
		weightLb,
		saltPercent,
		saltGrams: Math.round(saltGrams),
		saltTeaspoons: round1(saltGrams / GRAMS_PER_TSP_KOSHER),
		minHours: 8,
		maxHours: weightLb > 6 ? 48 : 24,
	};
}

/**
 * Scale a dry rub or brine to the weight of a cut.
 *
 * Dry rub (default): scales a named recipe's ingredients by weight and returns
 * a per-ingredient breakdown in tablespoons. Wet brine: returns the water
 * volume, salt, sugar, and a brine-time range. Dry brine: returns the salt
 * amount and a fridge-rest range.
 *
 * @throws RangeError if `weightLb` is not a positive, finite number, or if a
 *   named rub recipe cannot be found.
 */
export function calculateSeasoning(
	weightLb: number,
	options: SeasoningOptions = {},
): SeasoningPlan {
	if (!Number.isFinite(weightLb) || weightLb <= 0) {
		throw new RangeError(`weightLb must be a positive number, got ${weightLb}`);
	}

	const mode = options.mode ?? "rub";

	if (mode === "wet-brine") {
		const salinity = options.salinityPercent ?? DEFAULT_WET_SALINITY_PERCENT;
		if (!Number.isFinite(salinity) || salinity <= 0) {
			throw new RangeError(`salinityPercent must be a positive number, got ${salinity}`);
		}
		return buildWetBrinePlan(weightLb, salinity);
	}

	if (mode === "dry-brine") {
		const saltPercent = options.saltPercent ?? DEFAULT_DRY_SALT_PERCENT;
		if (!Number.isFinite(saltPercent) || saltPercent <= 0) {
			throw new RangeError(`saltPercent must be a positive number, got ${saltPercent}`);
		}
		return buildDryBrinePlan(weightLb, saltPercent);
	}

	const recipeName = options.recipe ?? DEFAULT_RECIPE;
	const recipe = resolveRubRecipe(recipeName);
	if (!recipe) {
		throw new RangeError(`Unknown rub recipe: "${recipeName}"`);
	}
	return buildRubPlan(weightLb, recipe);
}
