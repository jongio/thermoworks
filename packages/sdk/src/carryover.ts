// ─── Carryover / Pull-Early Prediction ───────────────────────────────────────

/**
 * Relative cut size, used to pick a default carryover rise when the caller does
 * not know the exact number. Small cuts (steaks, chops) hold little residual
 * heat; large cuts (brisket, pork butt, roasts) hold a lot.
 */
export type CarryoverSize = "small" | "medium" | "large";

/** Default carryover rise in Fahrenheit for each cut size. */
const RISE_BY_SIZE: Record<CarryoverSize, number> = {
	small: 3,
	medium: 6,
	large: 10,
};

/** Input for a carryover assessment. All temperatures are in Fahrenheit. */
export interface CarryoverInput {
	/** Current probe temperature. */
	currentTempF: number;
	/** Desired final temperature after resting. */
	targetTempF: number;
	/** Expected carryover rise while the food rests, in Fahrenheit. */
	riseF: number;
}

/** Result of a carryover assessment. All temperatures are in Fahrenheit. */
export interface CarryoverResult {
	currentTempF: number;
	targetTempF: number;
	riseF: number;
	/** Temperature to pull at so the food lands on the target after resting. */
	pullTempF: number;
	/** Final temperature the food is projected to reach if pulled right now. */
	projectedFinalF: number;
	/** Degrees left before reaching the pull temperature. Negative once past it. */
	remainingF: number;
	/** True when the current temperature is at or above the pull temperature. */
	pullNow: boolean;
	/** True when pulling now would overshoot the target after resting. */
	overshoot: boolean;
}

/**
 * Return the default carryover rise in Fahrenheit for a cut size. Use this when
 * the caller picks a size preset instead of giving an exact rise.
 */
export function carryoverRiseForSize(size: CarryoverSize): number {
	return RISE_BY_SIZE[size];
}

/**
 * Work out when to pull food off the heat so that carryover cooking lands it on
 * the target temperature after resting. Meat keeps rising after it comes off the
 * heat, so pulling at the target temperature overshoots. This computes the lower
 * pull temperature and how far the current reading is from it.
 *
 * @param input - Current temperature, desired final temperature, and expected rise.
 * @returns A carryover result with the pull temperature and remaining degrees.
 */
export function assessCarryover(input: CarryoverInput): CarryoverResult {
	const { currentTempF, targetTempF } = input;
	const riseF = Math.max(0, input.riseF);

	const pullTempF = targetTempF - riseF;
	const projectedFinalF = currentTempF + riseF;
	const remainingF = pullTempF - currentTempF;
	const pullNow = currentTempF >= pullTempF;

	return {
		currentTempF,
		targetTempF,
		riseF,
		pullTempF,
		projectedFinalF,
		remainingF,
		pullNow,
		overshoot: projectedFinalF > targetTempF,
	};
}
