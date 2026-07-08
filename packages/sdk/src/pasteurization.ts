// ─── Food-Safety Pasteurization ──────────────────────────────────────────────
//
// Estimates when meat has been held long enough at its core temperature to be
// pasteurized, in addition to the usual instant-safe target temperature.
//
// Data is adapted from USDA FSIS Appendix A time-at-temperature lethality
// tables: 7.0-log10 Salmonella reduction for poultry and 6.5-log10 Salmonella
// reduction for beef and pork. Values are interpolated between published
// points. These are estimates for planning, not a replacement for official
// food-safety guidance. Hold times assume the core is held at or above the
// listed temperature for the full duration.

/** Supported protein tables. */
export type Protein = "poultry" | "beef" | "pork";

/** A pasteurization lookup table for one protein. */
export interface PasteurizationTable {
	protein: Protein;
	/** Core temperature (F) below which holding does not pasteurize in a practical time. */
	minTempF: number;
	/** Core temperature (F) at or above which lethality is treated as instant. */
	instantTempF: number;
	/** Sorted ascending [tempF, holdMinutes] points for the required hold time. */
	points: ReadonlyArray<readonly [number, number]>;
}

// Poultry: USDA FSIS Appendix A, 7.0-log10 Salmonella reduction.
const POULTRY_TABLE: PasteurizationTable = {
	protein: "poultry",
	minTempF: 130,
	instantTempF: 165,
	points: [
		[130, 86.5],
		[134, 35.9],
		[136, 24.0],
		[138, 15.9],
		[140, 10.5],
		[142, 7.0],
		[144, 4.7],
		[146, 3.1],
		[148, 2.1],
		[150, 1.4],
		[154, 0.6],
		[158, 0.3],
		[162, 0.1],
	],
};

// Beef and pork: USDA FSIS Appendix A, 6.5-log10 Salmonella reduction.
const BEEF_PORK_POINTS: ReadonlyArray<readonly [number, number]> = [
	[130, 112.0],
	[133, 56.0],
	[135, 36.0],
	[138, 18.0],
	[140, 12.0],
	[142, 8.0],
	[145, 4.0],
	[147, 2.7],
	[150, 1.0],
	[153, 0.6],
	[155, 0.4],
];

const BEEF_TABLE: PasteurizationTable = {
	protein: "beef",
	minTempF: 130,
	instantTempF: 160,
	points: BEEF_PORK_POINTS,
};

const PORK_TABLE: PasteurizationTable = {
	protein: "pork",
	minTempF: 130,
	instantTempF: 160,
	points: BEEF_PORK_POINTS,
};

const TABLES: Record<Protein, PasteurizationTable> = {
	poultry: POULTRY_TABLE,
	beef: BEEF_TABLE,
	pork: PORK_TABLE,
};

/** Return the pasteurization table for a protein. Defaults to poultry. */
export function getPasteurizationTable(protein: Protein = "poultry"): PasteurizationTable {
	return TABLES[protein];
}

/**
 * Required hold time (minutes) at a core temperature for the protein.
 *
 * - Returns 0 when the temperature is at or above the instant-safe target.
 * - Returns null when the temperature is below the table minimum, meaning
 *   holding will not pasteurize in a practical time.
 * - Otherwise interpolates between published points. Above the highest listed
 *   point (but below the instant target) the smallest listed hold time is used.
 */
export function requiredHoldMinutes(
	temperatureF: number,
	protein: Protein = "poultry",
): number | null {
	const table = getPasteurizationTable(protein);
	if (temperatureF >= table.instantTempF) return 0;
	if (temperatureF < table.minTempF) return null;

	const points = table.points;
	// biome-ignore lint/style/noNonNullAssertion: points is a non-empty constant
	const first = points[0]!;
	// biome-ignore lint/style/noNonNullAssertion: points is a non-empty constant
	const last = points[points.length - 1]!;
	if (temperatureF <= first[0]) return first[1];
	if (temperatureF >= last[0]) return last[1];

	for (let i = 0; i < points.length - 1; i++) {
		// biome-ignore lint/style/noNonNullAssertion: index guarded by loop bound
		const [t0, m0] = points[i]!;
		// biome-ignore lint/style/noNonNullAssertion: index guarded by loop bound
		const [t1, m1] = points[i + 1]!;
		if (temperatureF >= t0 && temperatureF <= t1) {
			const frac = (temperatureF - t0) / (t1 - t0);
			return m0 + frac * (m1 - m0);
		}
	}
	return last[1];
}

/** Input for a pasteurization assessment. */
export interface PasteurizationInput {
	/** Current core temperature in Fahrenheit. */
	temperatureF: number;
	/** Minutes the core has been held at or above temperatureF. */
	holdMinutes: number;
	/** Protein table to use. Default: poultry. */
	protein?: Protein;
}

/** Result of a pasteurization assessment. */
export interface PasteurizationResult {
	protein: Protein;
	temperatureF: number;
	/** Required hold minutes at this temperature, or null when too low to pasteurize. */
	requiredMinutes: number | null;
	/** Minutes held so far, clamped to be non-negative. */
	heldMinutes: number;
	/** Minutes remaining until safe. 0 when safe now, null when too low to pasteurize. */
	remainingMinutes: number | null;
	/** True when the food is pasteurized (instant target reached or hold met). */
	safe: boolean;
	/** True when at or above the instant-safe temperature. */
	instant: boolean;
	/** Instant-safe target temperature (F) for this protein. */
	instantTempF: number;
}

/**
 * Assess pasteurization for a core temperature and how long it has been held.
 *
 * The model is intentionally simple: it compares the time held at or above the
 * current core temperature against the required hold time for that temperature.
 * It does not integrate accumulated lethality across a changing temperature.
 */
export function assessPasteurization(input: PasteurizationInput): PasteurizationResult {
	const protein = input.protein ?? "poultry";
	const table = getPasteurizationTable(protein);
	const temperatureF = input.temperatureF;
	const heldMinutes = Math.max(0, input.holdMinutes);
	const instant = temperatureF >= table.instantTempF;
	const requiredMinutes = requiredHoldMinutes(temperatureF, protein);

	if (instant) {
		return {
			protein,
			temperatureF,
			requiredMinutes: 0,
			heldMinutes,
			remainingMinutes: 0,
			safe: true,
			instant: true,
			instantTempF: table.instantTempF,
		};
	}

	if (requiredMinutes === null) {
		return {
			protein,
			temperatureF,
			requiredMinutes: null,
			heldMinutes,
			remainingMinutes: null,
			safe: false,
			instant: false,
			instantTempF: table.instantTempF,
		};
	}

	const remainingMinutes = Math.max(0, requiredMinutes - heldMinutes);
	return {
		protein,
		temperatureF,
		requiredMinutes,
		heldMinutes,
		remainingMinutes,
		safe: remainingMinutes <= 0,
		instant: false,
		instantTempF: table.instantTempF,
	};
}
