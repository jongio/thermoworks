// ─── Smoke Wood Guide ────────────────────────────────────────────────────────
//
// Offline reference data pairing each built-in cut with woods that suit it,
// plus a short profile for each wood. Picking a smoke wood is one of the first
// questions a new pitmaster asks, and an easy one to get wrong (mesquite on a
// delicate fish, say). Pure and side-effect free: no network, no clock, no
// files. Pairings are common starting points, not hard rules; smoke is a matter
// of taste, so treat these as a place to begin.

import { resolveMeatProfile } from "./plan.js";

/** How strongly a wood (or a cut's recommended smoke) reads on the palate. */
export type SmokeStrength = "mild" | "medium" | "strong";

/** A single smoking wood and how it behaves. */
export interface WoodProfile {
	/** Wood name. */
	readonly wood: string;
	/** Flavor strength. */
	readonly strength: SmokeStrength;
	/** One-line description of the wood's character. */
	readonly note: string;
}

/** Recommended woods and smoke level for one cut. */
export interface WoodPairing {
	/** Canonical cut name. */
	readonly meat: string;
	/** Recommended woods, strongest fit first. */
	readonly woods: string[];
	/** Overall smoke level that suits the cut. */
	readonly intensity: SmokeStrength;
	/** Why these woods pair with the cut. */
	readonly note: string;
}

// Flavor profiles for the woods used in the pairings below. Kept in strength
// order so the list reads from lightest to boldest.
const WOODS: WoodProfile[] = [
	{
		wood: "Alder",
		strength: "mild",
		note: "Delicate and lightly sweet; the traditional wood for fish.",
	},
	{ wood: "Apple", strength: "mild", note: "Sweet and fruity; friendly on pork and poultry." },
	{
		wood: "Cherry",
		strength: "mild",
		note: "Sweet with a reddish bark color; blends well with bolder woods.",
	},
	{ wood: "Maple", strength: "mild", note: "Softly sweet; pairs with poultry and pork." },
	{
		wood: "Oak",
		strength: "medium",
		note: "Steady and clean; a middle-ground wood that suits almost anything.",
	},
	{
		wood: "Pecan",
		strength: "medium",
		note: "Nutty and gentler than hickory; a good all-rounder.",
	},
	{
		wood: "Hickory",
		strength: "strong",
		note: "Classic bacon-like bite; the backbone of pork and beef smoking.",
	},
	{
		wood: "Mesquite",
		strength: "strong",
		note: "Earthy and intense; best in short, hot cooks like beef.",
	},
];

// Recommended woods per cut, keyed by the canonical profile name from the
// shared meat registry. Bigger, fattier beef takes bold smoke; lean poultry
// and fish want lighter, sweeter woods.
const PAIRINGS: Record<string, WoodPairing> = {
	Brisket: {
		meat: "Brisket",
		woods: ["Oak", "Hickory", "Mesquite"],
		intensity: "strong",
		note: "Beef takes bold smoke; oak burns steady over a long cook.",
	},
	"Pork Butt": {
		meat: "Pork Butt",
		woods: ["Hickory", "Apple", "Oak"],
		intensity: "medium",
		note: "Hickory for backbone, apple to sweeten the bark.",
	},
	"Pork Ribs": {
		meat: "Pork Ribs",
		woods: ["Apple", "Hickory", "Cherry"],
		intensity: "medium",
		note: "Fruit woods keep ribs sweet without covering the pork.",
	},
	"Baby Back Ribs": {
		meat: "Baby Back Ribs",
		woods: ["Apple", "Cherry", "Maple"],
		intensity: "mild",
		note: "Leaner and quicker, so lighter woods suit them best.",
	},
	"Whole Chicken": {
		meat: "Whole Chicken",
		woods: ["Apple", "Cherry", "Pecan"],
		intensity: "mild",
		note: "Poultry picks up smoke fast; stay light and sweet.",
	},
	"Chicken Wings": {
		meat: "Chicken Wings",
		woods: ["Apple", "Cherry", "Hickory"],
		intensity: "mild",
		note: "A short cook, so a little smoke goes a long way.",
	},
	Turkey: {
		meat: "Turkey",
		woods: ["Apple", "Maple", "Pecan"],
		intensity: "mild",
		note: "Mild woods keep white meat from turning bitter.",
	},
	"Tri-Tip": {
		meat: "Tri-Tip",
		woods: ["Oak", "Cherry", "Pecan"],
		intensity: "medium",
		note: "Oak is the Santa Maria classic; cherry adds color.",
	},
	Salmon: {
		meat: "Salmon",
		woods: ["Alder", "Apple", "Maple"],
		intensity: "mild",
		note: "Alder is the traditional fish wood; keep it delicate.",
	},
	"Beef Short Ribs": {
		meat: "Beef Short Ribs",
		woods: ["Oak", "Hickory", "Mesquite"],
		intensity: "strong",
		note: "Big beef flavor pairs with strong, steady woods.",
	},
};

/** List the wood flavor profiles, lightest to boldest. */
export function getWoodProfiles(): WoodProfile[] {
	return WOODS.map((w) => ({ ...w }));
}

/** List the wood pairings for every built-in cut. */
export function getSmokePairings(): WoodPairing[] {
	return Object.values(PAIRINGS).map((p) => ({ ...p, woods: [...p.woods] }));
}

/**
 * Resolve a cut name or alias to its wood pairing, or null if unknown.
 *
 * Uses the shared meat registry, so aliases like "pork butt" and "babyback"
 * resolve to the same pairing as the canonical name.
 */
export function resolveSmokePairing(meatName: string): WoodPairing | null {
	const profile = resolveMeatProfile(meatName);
	if (!profile) return null;
	const pairing = PAIRINGS[profile.name];
	if (!pairing) return null;
	return { ...pairing, woods: [...pairing.woods] };
}
