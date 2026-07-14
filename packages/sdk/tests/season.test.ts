import { describe, expect, it } from "vitest";
import { calculateSeasoning, listRubRecipes, resolveRubRecipe } from "../src/season.js";

describe("listRubRecipes", () => {
	it("returns the built-in recipes with ingredients", () => {
		const recipes = listRubRecipes();
		expect(recipes.length).toBeGreaterThanOrEqual(5);
		for (const recipe of recipes) {
			expect(recipe.ingredients.length).toBeGreaterThan(0);
			expect(recipe.tablespoonsPerPound).toBeGreaterThan(0);
		}
	});
});

describe("resolveRubRecipe", () => {
	it("resolves a known recipe case-insensitively", () => {
		expect(resolveRubRecipe("CLASSIC")?.name).toBe("classic");
		expect(resolveRubRecipe(" texas ")?.name).toBe("texas");
	});

	it("returns null for an unknown recipe", () => {
		expect(resolveRubRecipe("nope")).toBeNull();
	});
});

describe("calculateSeasoning - rub", () => {
	it("scales the default recipe by weight", () => {
		const plan = calculateSeasoning(6);
		expect(plan.mode).toBe("rub");
		if (plan.mode !== "rub") throw new Error("expected rub");
		expect(plan.recipe).toBe("classic");
		expect(plan.weightLb).toBe(6);
		// 1 tbsp per pound.
		expect(plan.totalTablespoons).toBe(6);
	});

	it("splits ingredients in proportion to their parts", () => {
		const plan = calculateSeasoning(8, { recipe: "texas" });
		if (plan.mode !== "rub") throw new Error("expected rub");
		// texas parts: salt 2, pepper 2, garlic 1 => total 5. 8 tbsp total.
		// Amounts round to the nearest quarter tablespoon.
		const quarter = (n: number) => Math.round(n * 4) / 4;
		const salt = plan.ingredients.find((i) => i.name === "kosher salt");
		const garlic = plan.ingredients.find((i) => i.name === "garlic powder");
		expect(salt?.tablespoons).toBe(quarter((8 * 2) / 5));
		expect(garlic?.tablespoons).toBe(quarter((8 * 1) / 5));
	});

	it("rounds ingredient amounts to the nearest quarter tablespoon", () => {
		const plan = calculateSeasoning(3, { recipe: "cajun" });
		if (plan.mode !== "rub") throw new Error("expected rub");
		for (const ingredient of plan.ingredients) {
			expect((ingredient.tablespoons * 4) % 1).toBe(0);
		}
	});

	it("throws on an unknown recipe", () => {
		expect(() => calculateSeasoning(5, { recipe: "ghost" })).toThrow(/unknown rub recipe/i);
	});
});

describe("calculateSeasoning - wet brine", () => {
	it("scales water and salt by weight and salinity", () => {
		const plan = calculateSeasoning(4, { mode: "wet-brine" });
		if (plan.mode !== "wet-brine") throw new Error("expected wet-brine");
		expect(plan.waterQuarts).toBe(4);
		expect(plan.salinityPercent).toBe(5);
		// 4 qt * 946.353 g * 5% ~= 189 g.
		expect(plan.saltGrams).toBeGreaterThan(180);
		expect(plan.saltGrams).toBeLessThan(200);
		expect(plan.sugarGrams).toBe(Math.round(plan.saltGrams * 0.5));
		expect(plan.minHours).toBeLessThanOrEqual(plan.maxHours);
	});

	it("honors a custom salinity", () => {
		const low = calculateSeasoning(4, { mode: "wet-brine", salinityPercent: 3 });
		const high = calculateSeasoning(4, { mode: "wet-brine", salinityPercent: 6 });
		if (low.mode !== "wet-brine" || high.mode !== "wet-brine") throw new Error("expected brine");
		expect(high.saltGrams).toBeGreaterThan(low.saltGrams);
	});

	it("keeps at least one quart of water for small cuts", () => {
		const plan = calculateSeasoning(0.5, { mode: "wet-brine" });
		if (plan.mode !== "wet-brine") throw new Error("expected wet-brine");
		expect(plan.waterQuarts).toBe(1);
	});
});

describe("calculateSeasoning - dry brine", () => {
	it("scales salt as a percent of meat weight", () => {
		const plan = calculateSeasoning(10, { mode: "dry-brine" });
		if (plan.mode !== "dry-brine") throw new Error("expected dry-brine");
		// 10 lb * 453.592 g * 1% ~= 45 g.
		expect(plan.saltGrams).toBeGreaterThan(40);
		expect(plan.saltGrams).toBeLessThan(50);
		expect(plan.saltTeaspoons).toBeGreaterThan(0);
	});

	it("gives larger cuts a longer rest window", () => {
		const small = calculateSeasoning(4, { mode: "dry-brine" });
		const large = calculateSeasoning(8, { mode: "dry-brine" });
		if (small.mode !== "dry-brine" || large.mode !== "dry-brine") throw new Error("expected brine");
		expect(large.maxHours).toBeGreaterThan(small.maxHours);
	});
});

describe("calculateSeasoning - validation", () => {
	it("rejects a non-positive weight", () => {
		expect(() => calculateSeasoning(0)).toThrow(RangeError);
		expect(() => calculateSeasoning(-2)).toThrow(RangeError);
		expect(() => calculateSeasoning(Number.NaN)).toThrow(RangeError);
	});

	it("rejects a non-positive salinity", () => {
		expect(() => calculateSeasoning(4, { mode: "wet-brine", salinityPercent: 0 })).toThrow(
			RangeError,
		);
	});

	it("rejects a non-positive salt percent", () => {
		expect(() => calculateSeasoning(4, { mode: "dry-brine", saltPercent: -1 })).toThrow(RangeError);
	});
});
