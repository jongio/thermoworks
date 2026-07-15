import { useCallback, useEffect, useState } from "react";

/** localStorage key for the snooze map. */
export const ALARM_SNOOZE_STORAGE_KEY = "thermoworks-alarm-snooze";

/** Preset snooze durations in minutes. */
export const SNOOZE_PRESETS = [15, 30, 60] as const;

type SnoozeMap = Record<string, number>;

/** Composite key for a snoozed alarm: serial + channel number + direction. */
export function snoozeKey(
	serial: string,
	channelNumber: string,
	direction: "high" | "low",
): string {
	return `${serial}:${channelNumber}:${direction}`;
}

/** Read the snooze map from localStorage. Returns empty object on any error. */
function loadSnoozeMap(): SnoozeMap {
	try {
		const raw = localStorage.getItem(ALARM_SNOOZE_STORAGE_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
		const map: SnoozeMap = {};
		for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof value === "number" && value > 0) {
				map[key] = value;
			}
		}
		return map;
	} catch {
		return {};
	}
}

/** Persist the snooze map to localStorage. Removes the key when the map is empty. */
function saveSnoozeMap(map: SnoozeMap): void {
	try {
		const entries = Object.entries(map).filter(([, v]) => v > 0);
		if (entries.length === 0) {
			localStorage.removeItem(ALARM_SNOOZE_STORAGE_KEY);
		} else {
			localStorage.setItem(ALARM_SNOOZE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
		}
	} catch {
		// Storage unavailable or full.
	}
}

/** Add or update a snooze entry with the given duration in minutes. */
export function snoozeAlarm(key: string, durationMinutes: number): void {
	const map = loadSnoozeMap();
	map[key] = Date.now() + durationMinutes * 60 * 1000;
	saveSnoozeMap(map);
}

/** Remove a snooze entry. */
export function unsnoozeAlarm(key: string): void {
	const map = loadSnoozeMap();
	delete map[key];
	saveSnoozeMap(map);
}

/** Check whether an alarm key is currently snoozed (expiry still in the future). */
export function isAlarmSnoozed(key: string, now?: number): boolean {
	const map = loadSnoozeMap();
	const expiry = map[key];
	if (expiry == null) return false;
	return expiry > (now ?? Date.now());
}

/** Get the expiry timestamp (epoch ms) for a snoozed alarm, or null if absent. */
export function getSnoozeExpiry(key: string): number | null {
	const map = loadSnoozeMap();
	return map[key] ?? null;
}

/** Format remaining milliseconds as a compact human-readable string. */
export function formatSnoozeRemaining(ms: number): string {
	if (ms <= 0) return "0s";
	const totalSeconds = Math.ceil(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes === 0) return `${seconds}s`;
	if (seconds === 0) return `${minutes}m`;
	return `${minutes}m ${seconds}s`;
}

// ─── React Hook ──────────────────────────────────────────────────────────────

interface UseAlarmSnoozeResult {
	/** Snooze a specific alarm for the given number of minutes. */
	snooze: (
		serial: string,
		channelNumber: string,
		direction: "high" | "low",
		minutes: number,
	) => void;
	/** Cancel snooze for a specific alarm. */
	unsnooze: (serial: string, channelNumber: string, direction: "high" | "low") => void;
	/** Check if an alarm is currently snoozed (not expired). */
	isSnoozed: (serial: string, channelNumber: string, direction: "high" | "low") => boolean;
	/** Get remaining snooze time in milliseconds. Returns 0 if not snoozed or expired. */
	getRemainingMs: (serial: string, channelNumber: string, direction: "high" | "low") => number;
}

/**
 * Manages alarm snooze state with localStorage persistence.
 *
 * Provides snooze/unsnooze actions plus countdown-driven re-renders: while at
 * least one snooze is active the hook ticks every second so that `isSnoozed`
 * and `getRemainingMs` return fresh values on each render cycle.
 */
export function useAlarmSnooze(): UseAlarmSnoozeResult {
	const [tick, setTick] = useState(0);

	// Re-render every second while snoozes are active for countdown display.
	// biome-ignore lint/correctness/useExhaustiveDependencies: tick drives countdown timer lifecycle
	useEffect(() => {
		const map = loadSnoozeMap();
		const now = Date.now();

		// Prune expired entries on each cycle.
		let dirty = false;
		for (const [key, expiry] of Object.entries(map)) {
			if (expiry <= now) {
				delete map[key];
				dirty = true;
			}
		}
		if (dirty) saveSnoozeMap(map);

		const hasActive = Object.values(map).some((expiry) => expiry > now);
		if (!hasActive) return;

		const id = setInterval(() => setTick((t) => t + 1), 1000);
		return () => clearInterval(id);
	}, [tick]);

	const snooze = useCallback(
		(serial: string, channelNumber: string, direction: "high" | "low", minutes: number) => {
			snoozeAlarm(snoozeKey(serial, channelNumber, direction), minutes);
			setTick((t) => t + 1);
		},
		[],
	);

	const unsnoozeFn = useCallback(
		(serial: string, channelNumber: string, direction: "high" | "low") => {
			unsnoozeAlarm(snoozeKey(serial, channelNumber, direction));
			setTick((t) => t + 1);
		},
		[],
	);

	const isSnoozedFn = useCallback(
		(serial: string, channelNumber: string, direction: "high" | "low"): boolean => {
			return isAlarmSnoozed(snoozeKey(serial, channelNumber, direction));
		},
		[],
	);

	const getRemainingMsFn = useCallback(
		(serial: string, channelNumber: string, direction: "high" | "low"): number => {
			const expiry = getSnoozeExpiry(snoozeKey(serial, channelNumber, direction));
			if (expiry === null) return 0;
			const remaining = expiry - Date.now();
			return remaining > 0 ? remaining : 0;
		},
		[],
	);

	return {
		snooze,
		unsnooze: unsnoozeFn,
		isSnoozed: isSnoozedFn,
		getRemainingMs: getRemainingMsFn,
	};
}
