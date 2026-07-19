// ─── Portions Planner ────────────────────────────────────────────────────────
//
// Offline helpers that turn a guest count into how much raw meat to buy. Cuts
// lose weight to trim and rendering, so the raw weight to buy is the cooked
// weight you want to serve divided by the cut's yield. Pure and side-effect
// free: no network, no clock, no files. Yields are working averages for common
// cuts, meant to keep you from under-buying, not to hit an exact plate weight.

import { resolveMeatProfile } from "./plan.js";

/** How hungry the crowd is, as a serving size preset. */
export type Appetite = "light" | "standard" | "hearty";

/** Cooked ounces per person for each appetite preset. */
const APPETITE_OUNCES: Record<Appetite, number> = {
	light: 4,
	standard: 6,
	hearty: 8,
};

// Cook yield per cut: cooked, edible weight as a fraction of raw weight. Keyed
// by the canonical profile name from the shared meat registry. Fattier or
// bonier cuts lose more, so they need more raw weight per serving.
const YIELDS: Record<string, number> = {
	Brisket: 0.5,
	"Pork Butt": 0.6,
	"Pork Ribs": 0.55,
	"Baby Back Ribs": 0.5,
	"Whole Chicken": 0.5,
	"Chicken Wings": 0.65,
	Turkey: 0.5,
	"Tri-Tip": 0.7,
	Salmon: 0.75,
	"Beef Short Ribs": 0.5,
};

/** The yield reference for one cut. */
export interface PortionYield {
	/** Canonical cut name. */
	readonly meat: string;
	/** Cook yield as a percentage (cooked edible weight over raw). */
	readonly yieldPercent: number;
}

/** Options for {@link calculatePortions}. */
export interface PortionOptions {
	/** Serving-size preset. Defaults to standard (6 oz). Ignored if perPersonOz is set. */
	readonly appetite?: Appetite;
	/** Explicit cooked ounces per person, overriding the appetite preset. */
	readonly perPersonOz?: number;
}

/** The result of {@link calculatePortions}. */
export interface PortionPlan {
	/** Canonical cut name. */
	readonly meat: string;
	readonly guests: number;
	/** Cooked ounces served per person. */
	readonly servingOz: number;
	/** Appetite preset used, or null when perPersonOz was given. */
	readonly appetite: Appetite | null;
	/** Cook yield as a percentage. */
	readonly yieldPercent: number;
	/** Total cooked weight to serve, in pounds. */
	readonly cookedLb: number;
	/** Raw weight to buy, in pounds, rounded up to the next quarter pound. */
	readonly rawLb: number;
}

/** List the appetite presets and their cooked ounces per person. */
export function listAppetites(): { appetite: Appetite; ounces: number }[] {
	return (Object.keys(APPETITE_OUNCES) as Appetite[]).map((appetite) => ({
		appetite,
		ounces: APPETITE_OUNCES[appetite],
	}));
}

/** List the per-cut cook yields used to plan portions. */
export function listPortionYields(): PortionYield[] {
	return Object.entries(YIELDS).map(([meat, fraction]) => ({
		meat,
		yieldPercent: Math.round(fraction * 100),
	}));
}

function roundUpTo(value: number, step: number): number {
	return Math.ceil(value / step) * step;
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * Plan how much raw meat to buy for a headcount.
 *
 * Resolves the cut through the shared meat registry (so aliases like "pork
 * butt" work), reads its cook yield, and divides the cooked weight to serve by
 * that yield. The raw weight rounds up to the next quarter pound.
 *
 * @throws RangeError if `guests` is not a positive integer, or if `perPersonOz`
 *   is given but not a positive number.
 * @throws Error if the cut is unknown or has no yield reference.
 */
export function calculatePortions(
	meatName: string,
	guests: number,
	options: PortionOptions = {},
): PortionPlan {
	if (!Number.isInteger(guests) || guests <= 0) {
		throw new RangeError(`guests must be a positive whole number, got ${guests}`);
	}

	const profile = resolveMeatProfile(meatName);
	if (!profile) {
		const names = Object.keys(YIELDS).join(", ");
		throw new Error(`Unknown meat: "${meatName}". Available: ${names}.`);
	}

	const fraction = YIELDS[profile.name];
	if (fraction === undefined) {
		throw new Error(`No portion yield for "${profile.name}".`);
	}

	let servingOz: number;
	let appetite: Appetite | null;
	if (options.perPersonOz !== undefined) {
		if (!Number.isFinite(options.perPersonOz) || options.perPersonOz <= 0) {
			throw new RangeError(`perPersonOz must be a positive number, got ${options.perPersonOz}`);
		}
		servingOz = options.perPersonOz;
		appetite = null;
	} else {
		appetite = options.appetite ?? "standard";
		servingOz = APPETITE_OUNCES[appetite];
	}

	const cookedLb = (guests * servingOz) / 16;
	const rawLb = roundUpTo(cookedLb / fraction, 0.25);

	return {
		meat: profile.name,
		guests,
		servingOz,
		appetite,
		yieldPercent: Math.round(fraction * 100),
		cookedLb: round2(cookedLb),
		rawLb,
	};
}
