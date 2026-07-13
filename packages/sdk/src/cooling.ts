// ─── Cooling Safety (FDA two-stage rule) ─────────────────────────────────────

/**
 * The FDA Food Code two-stage cooling rule. Cooked food must drop from
 * {@link FDA_STAGE1_START_F} to {@link FDA_STAGE1_END_F} within two hours, and
 * all the way to {@link FDA_STAGE2_END_F} within six hours total, both measured
 * from the moment the food first drops into the danger zone.
 */
export const FDA_STAGE1_START_F = 135;
export const FDA_STAGE1_END_F = 70;
export const FDA_STAGE2_END_F = 41;
const DEFAULT_STAGE1_LIMIT_HOURS = 2;
const DEFAULT_STAGE2_LIMIT_HOURS = 6;

/** A single cooling data point: a Fahrenheit reading at an elapsed minute mark. */
export interface CoolingSample {
	/** Temperature in Fahrenheit. */
	tempF: number;
	/** Minutes elapsed on a shared, non-decreasing timeline (>= 0). */
	minutes: number;
}

/** Options for {@link assessCooling}. */
export interface CoolingOptions {
	/** Stage one deadline in hours (135F to 70F). Default: 2. */
	stage1LimitHours?: number;
	/** Total deadline in hours (135F to 41F). Default: 6. */
	stage2LimitHours?: number;
}

/** Outcome for one stage of the cooling rule. */
export interface CoolingStageResult {
	/** Target temperature in Fahrenheit the food must reach for this stage. */
	targetF: number;
	/** Deadline in minutes, measured from danger-zone entry. */
	limitMinutes: number;
	/** Whether the target was reached within the supplied data. */
	reached: boolean;
	/** Minutes from entry to reaching the target, or null if not reached. */
	elapsedMinutes: number | null;
	/** Whether the target was reached at or before the deadline. */
	withinLimit: boolean;
	/**
	 * Deadline minus elapsed minutes. Positive means time to spare, negative
	 * means over the deadline. Null if the target was not reached.
	 */
	marginMinutes: number | null;
}

/** Result of a two-stage cooling assessment. */
export interface CoolingAssessment {
	/** Whether any reading was at or below the danger-zone entry temperature. */
	entered: boolean;
	/** Minute mark of the entry reading, or null if the food never entered. */
	entryMinutes: number | null;
	/** Temperature at entry in Fahrenheit, or null if the food never entered. */
	entryTempF: number | null;
	/**
	 * True when the first reading was already in the danger zone, so the real
	 * entry time may be earlier than the data shows.
	 */
	entryUncertain: boolean;
	/** Stage one: 135F down to 70F. */
	stage1: CoolingStageResult;
	/** Stage two: 135F down to 41F. */
	stage2: CoolingStageResult;
	/** True only when both stages were reached within their deadlines. */
	safe: boolean;
}

function missedStage(targetF: number, limitMinutes: number): CoolingStageResult {
	return {
		targetF,
		limitMinutes,
		reached: false,
		elapsedMinutes: null,
		withinLimit: false,
		marginMinutes: null,
	};
}

/**
 * Find the first sample at or after `fromIndex` whose temperature has fallen to
 * or below `targetF`, and describe how it fared against the deadline.
 */
function evaluateStage(
	samples: CoolingSample[],
	fromIndex: number,
	entryMinutes: number,
	targetF: number,
	limitMinutes: number,
): CoolingStageResult {
	for (let i = fromIndex; i < samples.length; i++) {
		const sample = samples[i];
		if (!sample) continue;
		if (sample.tempF <= targetF) {
			const elapsed = Math.round(sample.minutes - entryMinutes);
			return {
				targetF,
				limitMinutes,
				reached: true,
				elapsedMinutes: elapsed,
				withinLimit: elapsed <= limitMinutes,
				marginMinutes: limitMinutes - elapsed,
			};
		}
	}
	return missedStage(targetF, limitMinutes);
}

/**
 * Assess a cooling curve against the FDA two-stage rule.
 *
 * The clock starts at the first reading that has dropped to or below
 * {@link FDA_STAGE1_START_F} (the danger-zone entry). Stage one measures the
 * time to reach {@link FDA_STAGE1_END_F}; stage two measures the time to reach
 * {@link FDA_STAGE2_END_F}. Readings must be in chronological order (oldest
 * first) and use Fahrenheit.
 *
 * @throws RangeError when no samples are provided or a limit is not positive.
 */
export function assessCooling(
	samples: CoolingSample[],
	options?: CoolingOptions,
): CoolingAssessment {
	if (samples.length === 0) {
		throw new RangeError("cooling assessment needs at least one reading");
	}

	const stage1LimitHours = options?.stage1LimitHours ?? DEFAULT_STAGE1_LIMIT_HOURS;
	const stage2LimitHours = options?.stage2LimitHours ?? DEFAULT_STAGE2_LIMIT_HOURS;
	if (stage1LimitHours <= 0) {
		throw new RangeError(`stage1LimitHours must be positive, got ${stage1LimitHours}`);
	}
	if (stage2LimitHours <= 0) {
		throw new RangeError(`stage2LimitHours must be positive, got ${stage2LimitHours}`);
	}

	const stage1Limit = Math.round(stage1LimitHours * 60);
	const stage2Limit = Math.round(stage2LimitHours * 60);

	let entryIndex = -1;
	for (let i = 0; i < samples.length; i++) {
		const sample = samples[i];
		if (sample && sample.tempF <= FDA_STAGE1_START_F) {
			entryIndex = i;
			break;
		}
	}

	if (entryIndex === -1) {
		return {
			entered: false,
			entryMinutes: null,
			entryTempF: null,
			entryUncertain: false,
			stage1: missedStage(FDA_STAGE1_END_F, stage1Limit),
			stage2: missedStage(FDA_STAGE2_END_F, stage2Limit),
			safe: false,
		};
	}

	const entry = samples[entryIndex];
	if (!entry) {
		throw new RangeError("cooling assessment could not resolve the entry reading");
	}

	const stage1 = evaluateStage(samples, entryIndex, entry.minutes, FDA_STAGE1_END_F, stage1Limit);
	const stage2 = evaluateStage(samples, entryIndex, entry.minutes, FDA_STAGE2_END_F, stage2Limit);

	return {
		entered: true,
		entryMinutes: entry.minutes,
		entryTempF: entry.tempF,
		entryUncertain: entryIndex === 0,
		stage1,
		stage2,
		safe: stage1.withinLimit && stage2.withinLimit,
	};
}
