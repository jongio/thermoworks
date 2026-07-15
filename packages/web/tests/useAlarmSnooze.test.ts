import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ALARM_SNOOZE_STORAGE_KEY,
	formatSnoozeRemaining,
	getSnoozeExpiry,
	isAlarmSnoozed,
	SNOOZE_PRESETS,
	snoozeAlarm,
	snoozeKey,
	unsnoozeAlarm,
	useAlarmSnooze,
} from "../src/hooks/useAlarmSnooze.ts";

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

// ─── snoozeKey ───────────────────────────────────────────────────────────────

describe("snoozeKey", () => {
	it("builds key from serial, channelNumber, and direction", () => {
		expect(snoozeKey("ABC123", "1", "high")).toBe("ABC123:1:high");
		expect(snoozeKey("XYZ", "3", "low")).toBe("XYZ:3:low");
	});
});

// ─── snoozeAlarm / unsnoozeAlarm ─────────────────────────────────────────────

describe("snoozeAlarm", () => {
	it("writes an expiry timestamp to localStorage", () => {
		const before = Date.now();
		snoozeAlarm("S1:1:high", 15);
		const after = Date.now();

		const raw = localStorage.getItem(ALARM_SNOOZE_STORAGE_KEY);
		expect(raw).not.toBeNull();

		const map = JSON.parse(raw!);
		const expiry = map["S1:1:high"];
		expect(expiry).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
		expect(expiry).toBeLessThanOrEqual(after + 15 * 60 * 1000);
	});

	it("overwrites existing snooze for the same key", () => {
		snoozeAlarm("S1:1:high", 15);
		const firstRaw = localStorage.getItem(ALARM_SNOOZE_STORAGE_KEY)!;
		const firstExpiry = JSON.parse(firstRaw)["S1:1:high"];

		snoozeAlarm("S1:1:high", 60);
		const secondRaw = localStorage.getItem(ALARM_SNOOZE_STORAGE_KEY)!;
		const secondExpiry = JSON.parse(secondRaw)["S1:1:high"];

		expect(secondExpiry).toBeGreaterThan(firstExpiry);
	});

	it("preserves other keys when adding a new snooze", () => {
		snoozeAlarm("S1:1:high", 15);
		snoozeAlarm("S2:2:low", 30);

		const raw = localStorage.getItem(ALARM_SNOOZE_STORAGE_KEY)!;
		const map = JSON.parse(raw);
		expect(Object.keys(map)).toHaveLength(2);
		expect(map["S1:1:high"]).toBeGreaterThan(0);
		expect(map["S2:2:low"]).toBeGreaterThan(0);
	});
});

describe("unsnoozeAlarm", () => {
	it("removes the specified key from localStorage", () => {
		snoozeAlarm("S1:1:high", 15);
		snoozeAlarm("S2:2:low", 30);

		unsnoozeAlarm("S1:1:high");

		const raw = localStorage.getItem(ALARM_SNOOZE_STORAGE_KEY)!;
		const map = JSON.parse(raw);
		expect(map["S1:1:high"]).toBeUndefined();
		expect(map["S2:2:low"]).toBeGreaterThan(0);
	});

	it("removes the storage key entirely when the last entry is unsnoozed", () => {
		snoozeAlarm("S1:1:high", 15);
		unsnoozeAlarm("S1:1:high");

		expect(localStorage.getItem(ALARM_SNOOZE_STORAGE_KEY)).toBeNull();
	});

	it("does not crash when unsnozing an unknown key", () => {
		expect(() => unsnoozeAlarm("nope:0:high")).not.toThrow();
	});
});

// ─── isAlarmSnoozed ──────────────────────────────────────────────────────────

describe("isAlarmSnoozed", () => {
	it("returns false when no snooze exists", () => {
		expect(isAlarmSnoozed("S1:1:high")).toBe(false);
	});

	it("returns true for an active snooze", () => {
		const now = Date.now();
		const expiry = now + 15 * 60 * 1000;
		localStorage.setItem(ALARM_SNOOZE_STORAGE_KEY, JSON.stringify({ "S1:1:high": expiry }));

		expect(isAlarmSnoozed("S1:1:high", now)).toBe(true);
		expect(isAlarmSnoozed("S1:1:high", now + 14 * 60 * 1000)).toBe(true);
	});

	it("returns false for an expired snooze", () => {
		const now = Date.now();
		const expiry = now + 15 * 60 * 1000;
		localStorage.setItem(ALARM_SNOOZE_STORAGE_KEY, JSON.stringify({ "S1:1:high": expiry }));

		expect(isAlarmSnoozed("S1:1:high", expiry)).toBe(false);
		expect(isAlarmSnoozed("S1:1:high", expiry + 1000)).toBe(false);
	});

	it("returns false for a different key", () => {
		snoozeAlarm("S1:1:high", 15);
		expect(isAlarmSnoozed("S1:1:low")).toBe(false);
		expect(isAlarmSnoozed("S2:1:high")).toBe(false);
	});
});

// ─── getSnoozeExpiry ─────────────────────────────────────────────────────────

describe("getSnoozeExpiry", () => {
	it("returns null when no snooze exists", () => {
		expect(getSnoozeExpiry("S1:1:high")).toBeNull();
	});

	it("returns the expiry timestamp for an active snooze", () => {
		const expiry = Date.now() + 30 * 60 * 1000;
		localStorage.setItem(ALARM_SNOOZE_STORAGE_KEY, JSON.stringify({ "S1:1:high": expiry }));

		expect(getSnoozeExpiry("S1:1:high")).toBe(expiry);
	});
});

// ─── formatSnoozeRemaining ───────────────────────────────────────────────────

describe("formatSnoozeRemaining", () => {
	it("formats zero as '0s'", () => {
		expect(formatSnoozeRemaining(0)).toBe("0s");
	});

	it("formats negative values as '0s'", () => {
		expect(formatSnoozeRemaining(-5000)).toBe("0s");
	});

	it("formats seconds only", () => {
		expect(formatSnoozeRemaining(45_000)).toBe("45s");
	});

	it("formats minutes only when seconds are zero", () => {
		expect(formatSnoozeRemaining(5 * 60 * 1000)).toBe("5m");
	});

	it("formats minutes and seconds", () => {
		expect(formatSnoozeRemaining(14 * 60 * 1000 + 30_000)).toBe("14m 30s");
	});

	it("rounds up fractional seconds", () => {
		// 1500ms rounds to 2s
		expect(formatSnoozeRemaining(1500)).toBe("2s");
	});
});

// ─── SNOOZE_PRESETS ──────────────────────────────────────────────────────────

describe("SNOOZE_PRESETS", () => {
	it("contains 15, 30, and 60 minute options", () => {
		expect([...SNOOZE_PRESETS]).toEqual([15, 30, 60]);
	});
});

// ─── Malformed localStorage ──────────────────────────────────────────────────

describe("malformed localStorage", () => {
	it("handles invalid JSON gracefully", () => {
		localStorage.setItem(ALARM_SNOOZE_STORAGE_KEY, "not-valid-json{{{");
		expect(isAlarmSnoozed("S1:1:high")).toBe(false);
		expect(getSnoozeExpiry("S1:1:high")).toBeNull();
	});

	it("handles non-object JSON gracefully", () => {
		localStorage.setItem(ALARM_SNOOZE_STORAGE_KEY, JSON.stringify([1, 2, 3]));
		expect(isAlarmSnoozed("S1:1:high")).toBe(false);
	});

	it("handles null JSON value gracefully", () => {
		localStorage.setItem(ALARM_SNOOZE_STORAGE_KEY, "null");
		expect(isAlarmSnoozed("S1:1:high")).toBe(false);
	});

	it("ignores non-numeric values in the map", () => {
		localStorage.setItem(
			ALARM_SNOOZE_STORAGE_KEY,
			JSON.stringify({ "S1:1:high": "not-a-number", "S2:2:low": Date.now() + 60000 }),
		);
		expect(isAlarmSnoozed("S1:1:high")).toBe(false);
		expect(isAlarmSnoozed("S2:2:low")).toBe(true);
	});

	it("ignores negative or zero values in the map", () => {
		localStorage.setItem(
			ALARM_SNOOZE_STORAGE_KEY,
			JSON.stringify({ "S1:1:high": -100, "S2:2:low": 0 }),
		);
		expect(isAlarmSnoozed("S1:1:high")).toBe(false);
		expect(isAlarmSnoozed("S2:2:low")).toBe(false);
	});
});

describe("localStorage write failure", () => {
	it("does not crash when storage is unavailable", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("QuotaExceededError");
		});

		expect(() => snoozeAlarm("S1:1:high", 15)).not.toThrow();
		expect(() => unsnoozeAlarm("S1:1:high")).not.toThrow();
	});
});

// ─── useAlarmSnooze hook ─────────────────────────────────────────────────────

describe("useAlarmSnooze", () => {
	it("isSnoozed returns false when nothing is snoozed", () => {
		const { result } = renderHook(() => useAlarmSnooze());
		expect(result.current.isSnoozed("S1", "1", "high")).toBe(false);
	});

	it("snooze activates and isSnoozed returns true", () => {
		const { result } = renderHook(() => useAlarmSnooze());

		act(() => {
			result.current.snooze("S1", "1", "high", 15);
		});

		expect(result.current.isSnoozed("S1", "1", "high")).toBe(true);
	});

	it("unsnooze deactivates and isSnoozed returns false", () => {
		const { result } = renderHook(() => useAlarmSnooze());

		act(() => {
			result.current.snooze("S1", "1", "high", 15);
		});

		expect(result.current.isSnoozed("S1", "1", "high")).toBe(true);

		act(() => {
			result.current.unsnooze("S1", "1", "high");
		});

		expect(result.current.isSnoozed("S1", "1", "high")).toBe(false);
	});

	it("getRemainingMs returns positive value for active snooze", () => {
		const { result } = renderHook(() => useAlarmSnooze());

		act(() => {
			result.current.snooze("S1", "1", "high", 15);
		});

		const remaining = result.current.getRemainingMs("S1", "1", "high");
		expect(remaining).toBeGreaterThan(0);
		expect(remaining).toBeLessThanOrEqual(15 * 60 * 1000);
	});

	it("getRemainingMs returns 0 for unsnoozed key", () => {
		const { result } = renderHook(() => useAlarmSnooze());
		expect(result.current.getRemainingMs("S1", "1", "high")).toBe(0);
	});

	it("tracks multiple independent snooze entries", () => {
		const { result } = renderHook(() => useAlarmSnooze());

		act(() => {
			result.current.snooze("S1", "1", "high", 15);
			result.current.snooze("S2", "2", "low", 30);
		});

		expect(result.current.isSnoozed("S1", "1", "high")).toBe(true);
		expect(result.current.isSnoozed("S2", "2", "low")).toBe(true);

		act(() => {
			result.current.unsnooze("S1", "1", "high");
		});

		expect(result.current.isSnoozed("S1", "1", "high")).toBe(false);
		expect(result.current.isSnoozed("S2", "2", "low")).toBe(true);
	});

	it("countdown expires snooze after duration elapses", () => {
		vi.useFakeTimers({ shouldAdvanceTime: false });
		vi.setSystemTime(new Date("2025-06-01T00:00:00Z"));

		const { result } = renderHook(() => useAlarmSnooze());

		act(() => {
			result.current.snooze("S1", "1", "high", 1); // 1 minute for speed
		});

		expect(result.current.isSnoozed("S1", "1", "high")).toBe(true);
		expect(result.current.getRemainingMs("S1", "1", "high")).toBe(60_000);

		// Advance 30 seconds
		act(() => {
			vi.advanceTimersByTime(30_000);
		});

		expect(result.current.isSnoozed("S1", "1", "high")).toBe(true);
		expect(result.current.getRemainingMs("S1", "1", "high")).toBe(30_000);

		// Advance past expiry
		act(() => {
			vi.advanceTimersByTime(31_000);
		});

		expect(result.current.isSnoozed("S1", "1", "high")).toBe(false);
		expect(result.current.getRemainingMs("S1", "1", "high")).toBe(0);
	});

	it("prunes expired entries from localStorage", () => {
		vi.useFakeTimers({ shouldAdvanceTime: false });
		vi.setSystemTime(new Date("2025-06-01T00:00:00Z"));

		const { result } = renderHook(() => useAlarmSnooze());

		act(() => {
			result.current.snooze("S1", "1", "high", 1); // 1 minute
		});

		// Advance past expiry
		act(() => {
			vi.advanceTimersByTime(61_000);
		});

		// Storage should be cleaned up
		expect(localStorage.getItem(ALARM_SNOOZE_STORAGE_KEY)).toBeNull();
	});
});
