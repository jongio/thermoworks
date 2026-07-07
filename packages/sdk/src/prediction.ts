// ─── Done-Time Prediction ────────────────────────────────────────────────────

/** Options for configuring prediction behavior. */
export interface PredictionOptions {
	/** Temperature units. Default: "F". */
	units?: "F" | "C";
	/** Prediction method. Default: "linear". */
	method?: "linear" | "weighted";
	/**
	 * Recent rate (degrees per minute) used for weighted prediction.
	 * When method is "weighted" and this value is provided, the prediction
	 * blends recentRate (70%) with the overall rate (30%).
	 */
	recentRate?: number;
}

/** Result of a done-time prediction. */
export interface PredictionResult {
	/** Estimated minutes remaining, or null if rate is zero/negative with target above current. */
	estimatedMinutes: number | null;
	/** ISO timestamp of predicted completion, or null if estimate is unavailable. */
	estimatedTime: string | null;
	/** Confidence level based on rate stability. */
	confidence: "high" | "medium" | "low";
	/** Prediction method used. */
	method: "linear" | "weighted";
}

/**
 * Predict when a probe will reach its target temperature based on the
 * current rate of temperature change.
 *
 * @param current - Current temperature reading.
 * @param target - Target temperature (e.g., high alarm value).
 * @param rateOfChange - Rate of change in degrees per minute.
 * @param options - Optional prediction configuration.
 * @returns A prediction result with estimated time and confidence.
 */
export function predictDoneTime(
	current: number,
	target: number,
	rateOfChange: number,
	options?: PredictionOptions,
): PredictionResult {
	const method = options?.method ?? "linear";

	// Already at or past target: done now.
	if (current >= target) {
		return {
			estimatedMinutes: 0,
			estimatedTime: new Date().toISOString(),
			confidence: "high",
			method,
		};
	}

	// Determine the effective rate to use.
	let effectiveRate: number;
	if (method === "weighted" && options?.recentRate != null) {
		// Blend recent rate (70%) with overall rate (30%).
		effectiveRate = options.recentRate * 0.7 + rateOfChange * 0.3;
	} else {
		effectiveRate = rateOfChange;
	}

	// If rate is zero or negative, we cannot predict done time.
	if (effectiveRate <= 0) {
		return {
			estimatedMinutes: null,
			estimatedTime: null,
			confidence: "low",
			method,
		};
	}

	const remaining = target - current;
	const minutes = remaining / effectiveRate;
	const estimatedMinutes = Math.round(minutes);

	const estimatedTime = new Date(Date.now() + minutes * 60 * 1000).toISOString();

	// Determine confidence based on rate magnitude and method.
	const confidence = determineConfidence(effectiveRate, rateOfChange, method, options?.recentRate);

	return {
		estimatedMinutes,
		estimatedTime,
		confidence,
		method,
	};
}

/**
 * Determine confidence level for a prediction.
 *
 * - "high": rate is stable and using weighted method with consistent rates
 * - "medium": reasonable rate with linear method
 * - "low": rate is very slow or weighted rates diverge significantly
 */
function determineConfidence(
	effectiveRate: number,
	overallRate: number,
	method: "linear" | "weighted",
	recentRate?: number,
): "high" | "medium" | "low" {
	// Very slow rate: low confidence (more susceptible to stalls).
	if (effectiveRate < 0.1) {
		return "low";
	}

	if (method === "weighted" && recentRate != null) {
		// If recent and overall rates diverge significantly, lower confidence.
		const divergence = Math.abs(recentRate - overallRate);
		const avgRate = (Math.abs(recentRate) + Math.abs(overallRate)) / 2;
		if (avgRate > 0 && divergence / avgRate > 0.5) {
			return "low";
		}
		return "high";
	}

	// Linear method: medium confidence (simple extrapolation).
	return "medium";
}
