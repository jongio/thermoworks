import { describe, expect, it } from "vitest";
import { getProbePlacements, resolveProbePlacement } from "../src/placement.js";
import { getMeatProfiles } from "../src/plan.js";

describe("getProbePlacements", () => {
	it("covers every built-in meat profile", () => {
		const placements = getProbePlacements();
		expect(placements.map((p) => p.meat)).toEqual(getMeatProfiles().map((p) => p.name));
		expect(placements.find((p) => p.meat === "Brisket")?.meatProbe).toContain("flat");
	});

	it("returns copies so callers cannot mutate the source", () => {
		const first = getProbePlacements();
		(first[0]!.avoid as string[]).push("hacked");
		expect(getProbePlacements()[0]?.avoid).not.toContain("hacked");
	});
});

describe("resolveProbePlacement", () => {
	it("resolves canonical names and aliases", () => {
		expect(resolveProbePlacement("BRISKET")?.meat).toBe("Brisket");
		expect(resolveProbePlacement("pulled pork")?.meat).toBe("Pork Butt");
	});

	it("returns null for unknown meats", () => {
		expect(resolveProbePlacement("unobtainium")).toBeNull();
	});
});
