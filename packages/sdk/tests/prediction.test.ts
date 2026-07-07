import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { predictDoneTime } from "../src/prediction.js";

describe("predictDoneTime", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ─── Already at target ────────────────────────────────────────────────────

	it("returns 0 minutes when current equals target", () => {
		const result = predictDoneTime(225, 225, 1.5);
		expect(result.estimatedMinutes).toBe(0);
		expect(result.confidence).toBe("high");
		expect(result.method).toBe("linear");
	});

	it("returns 0 minutes when current exceeds target", () => {
		const result = predictDoneTime(230, 225, 1.5);
		expect(result.estimatedMinutes).toBe(0);
		expect(result.confidence).toBe("high");
	});

	// ─── Zero/negative rate ──────────────────────────────────────────────────

	it("returns null estimates when rate is zero", () => {
		const result = predictDoneTime(180, 225, 0);
		expect(result.estimatedMinutes).toBeNull();
		expect(result.estimatedTime).toBeNull();
		expect(result.confidence).toBe("low");
	});

	it("returns null estimates when rate is negative", () => {
		const result = predictDoneTime(180, 225, -0.5);
		expect(result.estimatedMinutes).toBeNull();
		expect(result.estimatedTime).toBeNull();
		expect(result.confidence).toBe("low");
	});

	// ─── Linear prediction ───────────────────────────────────────────────────

	it("calculates correct linear prediction", () => {
		// 45 degrees remaining at 1.5 degrees/min = 30 min
		const result = predictDoneTime(180, 225, 1.5);
		expect(result.estimatedMinutes).toBe(30);
		expect(result.method).toBe("linear");
		expect(result.confidence).toBe("medium");
	});

	it("produces correct ISO timestamp for linear prediction", () => {
		// 45 degrees remaining at 1.5 degrees/min = 30 min from now
		const result = predictDoneTime(180, 225, 1.5);
		const expected = new Date("2026-07-01T12:30:00Z").toISOString();
		expect(result.estimatedTime).toBe(expected);
	});

	it("handles fractional minutes by rounding", () => {
		// 10 degrees remaining at 3 degrees/min = 3.33 min, rounds to 3
		const result = predictDoneTime(215, 225, 3);
		expect(result.estimatedMinutes).toBe(3);
	});

	it("handles very large time estimates", () => {
		// 100 degrees remaining at 0.2 degrees/min = 500 min
		const result = predictDoneTime(125, 225, 0.2);
		expect(result.estimatedMinutes).toBe(500);
	});

	// ─── Weighted prediction ─────────────────────────────────────────────────

	it("uses weighted blend of recent and overall rate", () => {
		// recent=2.0 (70%) + overall=1.0 (30%) = 1.4 + 0.3 = 1.7 effective rate
		// 45 degrees / 1.7 = ~26.47 min, rounds to 26
		const result = predictDoneTime(180, 225, 1.0, {
			method: "weighted",
			recentRate: 2.0,
		});
		expect(result.estimatedMinutes).toBe(26);
		expect(result.method).toBe("weighted");
	});

	it("falls back to overall rate when recentRate is not provided in weighted mode", () => {
		// Without recentRate, weighted mode uses overall rate only
		const result = predictDoneTime(180, 225, 1.5, { method: "weighted" });
		expect(result.estimatedMinutes).toBe(30);
		expect(result.method).toBe("weighted");
	});

	it("returns null when weighted effective rate is zero or negative", () => {
		// recent=-1.0 (70%) + overall=0.5 (30%) = -0.7 + 0.15 = -0.55
		const result = predictDoneTime(180, 225, 0.5, {
			method: "weighted",
			recentRate: -1.0,
		});
		expect(result.estimatedMinutes).toBeNull();
		expect(result.confidence).toBe("low");
	});

	// ─── Confidence levels ───────────────────────────────────────────────────

	it("returns low confidence for very slow rates", () => {
		// 0.05 deg/min is below 0.1 threshold
		const result = predictDoneTime(220, 225, 0.05);
		expect(result.confidence).toBe("low");
	});

	it("returns medium confidence for linear with reasonable rate", () => {
		const result = predictDoneTime(180, 225, 1.0);
		expect(result.confidence).toBe("medium");
	});

	it("returns high confidence for weighted with consistent rates", () => {
		// recent=1.5, overall=1.3: divergence is small
		const result = predictDoneTime(180, 225, 1.3, {
			method: "weighted",
			recentRate: 1.5,
		});
		expect(result.confidence).toBe("high");
	});

	it("returns low confidence for weighted with diverging rates", () => {
		// recent=3.0, overall=1.0: divergence/avg = 2/2 = 1.0 > 0.5
		const result = predictDoneTime(180, 225, 1.0, {
			method: "weighted",
			recentRate: 3.0,
		});
		expect(result.confidence).toBe("low");
	});

	// ─── Options ─────────────────────────────────────────────────────────────

	it("respects units option without affecting calculation", () => {
		// Units option is informational; calculation uses raw values
		const resultF = predictDoneTime(180, 225, 1.5, { units: "F" });
		const resultC = predictDoneTime(180, 225, 1.5, { units: "C" });
		expect(resultF.estimatedMinutes).toBe(resultC.estimatedMinutes);
	});

	it("defaults method to linear when not specified", () => {
		const result = predictDoneTime(180, 225, 1.5);
		expect(result.method).toBe("linear");
	});

	// ─── Edge cases ──────────────────────────────────────────────────────────

	it("handles 1 degree remaining", () => {
		// 1 degree at 1 deg/min = 1 min
		const result = predictDoneTime(224, 225, 1.0);
		expect(result.estimatedMinutes).toBe(1);
	});

	it("handles very small remaining distance", () => {
		// 0.1 degree at 2 deg/min = 0.05 min, rounds to 0
		const result = predictDoneTime(224.9, 225, 2.0);
		expect(result.estimatedMinutes).toBe(0);
	});
});
