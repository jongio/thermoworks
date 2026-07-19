import { describe, expect, it } from "vitest";

import { getSmokePairings, getWoodProfiles, resolveSmokePairing } from "../src/smoke.js";

describe("getWoodProfiles", () => {
	it("returns eight woods, lightest to boldest", () => {
		const woods = getWoodProfiles();
		expect(woods).toHaveLength(8);
		expect(woods[0]?.wood).toBe("Alder");
		expect(woods[woods.length - 1]?.wood).toBe("Mesquite");
	});

	it("labels each wood with a strength", () => {
		const woods = getWoodProfiles();
		for (const w of woods) {
			expect(["mild", "medium", "strong"]).toContain(w.strength);
			expect(w.note.length).toBeGreaterThan(0);
		}
	});

	it("returns a fresh copy each call", () => {
		const a = getWoodProfiles();
		const b = getWoodProfiles();
		expect(a).not.toBe(b);
		expect(a[0]).not.toBe(b[0]);
	});
});

describe("getSmokePairings", () => {
	it("returns a pairing for every built-in cut", () => {
		const pairings = getSmokePairings();
		expect(pairings.length).toBe(10);
		const names = pairings.map((p) => p.meat);
		expect(names).toContain("Brisket");
		expect(names).toContain("Salmon");
	});

	it("gives each cut at least one wood and a note", () => {
		for (const p of getSmokePairings()) {
			expect(p.woods.length).toBeGreaterThan(0);
			expect(p.note.length).toBeGreaterThan(0);
			expect(["mild", "medium", "strong"]).toContain(p.intensity);
		}
	});

	it("returns copies so callers cannot mutate the source", () => {
		const first = getSmokePairings();
		first[0]?.woods.push("Pine");
		const second = getSmokePairings();
		expect(second[0]?.woods).not.toContain("Pine");
	});
});

describe("resolveSmokePairing", () => {
	it("resolves a canonical cut name", () => {
		const pairing = resolveSmokePairing("Brisket");
		expect(pairing?.meat).toBe("Brisket");
		expect(pairing?.intensity).toBe("strong");
		expect(pairing?.woods).toContain("Oak");
	});

	it("is case and whitespace insensitive", () => {
		const pairing = resolveSmokePairing("  brisket  ");
		expect(pairing?.meat).toBe("Brisket");
	});

	it("resolves aliases through the shared meat registry", () => {
		const pairing = resolveSmokePairing("pulled pork");
		expect(pairing?.meat).toBe("Pork Butt");
	});

	it("recommends light woods for fish", () => {
		const pairing = resolveSmokePairing("salmon");
		expect(pairing?.woods[0]).toBe("Alder");
		expect(pairing?.intensity).toBe("mild");
	});

	it("returns null for an unknown cut", () => {
		expect(resolveSmokePairing("unobtainium")).toBeNull();
	});
});
