// ─── Fuel Estimator ──────────────────────────────────────────────────────────
//
// Offline helpers that estimate how much fuel a cook will burn from the pit
// temperature, duration, and fuel type. Pure and side-effect free: no network,
// no clock, no files. The burn rates are working approximations for common pits
// (pellet hoppers, charcoal kettles and kamados, offset stick burners), meant to
// help you buy and pack enough fuel, not to meter it to the ounce.

/** A fuel a pit can burn. */
export type FuelType = "pellet" | "charcoal" | "wood";

/** One burn-rate tier: use it when the pit temperature is at or below `maxTempF`. */
interface BurnTier {
	readonly maxTempF: number;
	readonly lbPerHour: number;
}

// Tiers are ordered low to high. The last tier's maxTempF is Infinity so any
// temperature resolves to a rate. Rates are pounds of fuel per hour.
const BURN_TIERS: Record<FuelType, readonly BurnTier[]> = {
	pellet: [
		{ maxTempF: 250, lbPerHour: 0.75 },
		{ maxTempF: 300, lbPerHour: 1.25 },
		{ maxTempF: 400, lbPerHour: 2.25 },
		{ maxTempF: Number.POSITIVE_INFINITY, lbPerHour: 3 },
	],
	charcoal: [
		{ maxTempF: 275, lbPerHour: 0.6 },
		{ maxTempF: 350, lbPerHour: 1 },
		{ maxTempF: 450, lbPerHour: 1.75 },
		{ maxTempF: Number.POSITIVE_INFINITY, lbPerHour: 2.5 },
	],
	wood: [
		{ maxTempF: 275, lbPerHour: 2 },
		{ maxTempF: 350, lbPerHour: 3 },
		{ maxTempF: Number.POSITIVE_INFINITY, lbPerHour: 4 },
	],
};

// Extra fuel to keep on hand beyond the raw estimate, as a fraction. Weather,
// lid opens, and cold meat all push real use above the ideal figure.
const BUFFER_FRACTION = 0.2;

/** Options for {@link estimateFuel}. */
export interface FuelOptions {
	/** Fuel the pit burns. Defaults to pellets. */
	fuelType?: FuelType;
	/**
	 * Usable fuel one hopper or basket load holds, in pounds. When given, the
	 * estimate includes how long a load lasts and how many refills to plan.
	 */
	hopperLb?: number;
}

/** The result of {@link estimateFuel}. */
export interface FuelEstimate {
	readonly fuelType: FuelType;
	readonly pitTempF: number;
	readonly hours: number;
	/** Estimated burn rate at this temperature, in pounds per hour. */
	readonly burnRateLbPerHour: number;
	/** Raw estimate: burn rate times hours, in pounds. */
	readonly totalLb: number;
	/** Total plus a buffer, rounded up, as the amount to have on hand. */
	readonly recommendedLb: number;
	/** Usable fuel per load when a hopper size was given. */
	readonly hopperLb?: number;
	/** How long one load lasts, in hours, when a hopper size was given. */
	readonly runtimePerLoadHours?: number;
	/** Refills to plan during the cook (beyond the first load). */
	readonly refills?: number;
}

function tierRate(fuelType: FuelType, pitTempF: number): number {
	const tiers = BURN_TIERS[fuelType];
	for (const tier of tiers) {
		if (pitTempF <= tier.maxTempF) return tier.lbPerHour;
	}
	// Unreachable: the last tier is Infinity. Fall back to the last rate.
	return tiers[tiers.length - 1]?.lbPerHour ?? 0;
}

function round1(value: number): number {
	return Math.round(value * 10) / 10;
}

function roundUpTo(value: number, step: number): number {
	return Math.ceil(value / step) * step;
}

/** List the fuel types the estimator supports. */
export function listFuelTypes(): FuelType[] {
	return Object.keys(BURN_TIERS) as FuelType[];
}

/**
 * Estimate how much fuel a cook will burn.
 *
 * Picks a burn rate from the fuel type and pit temperature, multiplies by the
 * cook length, and adds a buffer for the recommended amount to pack. When
 * `hopperLb` is given, it also reports how long one load lasts and how many
 * refills to plan.
 *
 * @throws RangeError if `pitTempF` or `hours` is not a positive, finite number,
 *   or if `hopperLb` is given but not positive.
 */
export function estimateFuel(
	pitTempF: number,
	hours: number,
	options: FuelOptions = {},
): FuelEstimate {
	if (!Number.isFinite(pitTempF) || pitTempF <= 0) {
		throw new RangeError(`pitTempF must be a positive number, got ${pitTempF}`);
	}
	if (!Number.isFinite(hours) || hours <= 0) {
		throw new RangeError(`hours must be a positive number, got ${hours}`);
	}

	const fuelType = options.fuelType ?? "pellet";
	const burnRateLbPerHour = tierRate(fuelType, pitTempF);
	const totalLb = burnRateLbPerHour * hours;
	const recommendedLb = roundUpTo(totalLb * (1 + BUFFER_FRACTION), 0.5);

	const estimate: FuelEstimate = {
		fuelType,
		pitTempF,
		hours,
		burnRateLbPerHour,
		totalLb: round1(totalLb),
		recommendedLb,
	};

	if (options.hopperLb === undefined) return estimate;

	if (!Number.isFinite(options.hopperLb) || options.hopperLb <= 0) {
		throw new RangeError(`hopperLb must be a positive number, got ${options.hopperLb}`);
	}
	const hopperLb = options.hopperLb;
	const runtimePerLoadHours = round1(hopperLb / burnRateLbPerHour);
	const refills = Math.max(0, Math.ceil(totalLb / hopperLb) - 1);

	return { ...estimate, hopperLb, runtimePerLoadHours, refills };
}
