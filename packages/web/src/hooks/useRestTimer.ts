import { useCallback, useEffect, useRef, useState } from "react";
import { getNotificationsEnabled } from "./useAlarmNotifications.ts";

/** localStorage key for the rest timer map. */
export const REST_TIMER_STORAGE_KEY = "thermoworks-rest-timers";

/** Preset rest durations in minutes. */
export const REST_TIMER_PRESETS = [10, 20, 30, 60] as const;

type RestTimerMap = Record<string, number>;

/** Read the rest timer map from localStorage. Returns empty object on any error. */
function loadRestTimerMap(): RestTimerMap {
	try {
		const raw = localStorage.getItem(REST_TIMER_STORAGE_KEY);
		if (!raw) return {};
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
		const map: RestTimerMap = {};
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

/** Persist the rest timer map to localStorage. Removes the key when the map is empty. */
function saveRestTimerMap(map: RestTimerMap): void {
	try {
		const now = Date.now();
		const entries = Object.entries(map).filter(([, v]) => v > now);
		if (entries.length === 0) {
			localStorage.removeItem(REST_TIMER_STORAGE_KEY);
		} else {
			localStorage.setItem(REST_TIMER_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
		}
	} catch {
		// Storage unavailable or full.
	}
}

/** Start a rest timer for a device serial with the given duration in minutes. */
export function startRestTimer(serial: string, durationMinutes: number): void {
	const map = loadRestTimerMap();
	map[serial] = Date.now() + durationMinutes * 60 * 1000;
	saveRestTimerMap(map);
}

/** Cancel a rest timer for a device serial. */
export function cancelRestTimer(serial: string): void {
	const map = loadRestTimerMap();
	delete map[serial];
	saveRestTimerMap(map);
}

/** Get the end timestamp (epoch ms) for a rest timer, or null if absent. */
export function getRestTimerEnd(serial: string): number | null {
	const map = loadRestTimerMap();
	return map[serial] ?? null;
}

/** Check whether a rest timer is currently active (end time still in the future). */
export function isRestTimerActive(serial: string, now?: number): boolean {
	const endTime = getRestTimerEnd(serial);
	if (endTime == null) return false;
	return endTime > (now ?? Date.now());
}

/**
 * Format remaining milliseconds as a countdown string.
 *
 * Under 1 hour: "M:SS" (e.g., "10:00", "5:23").
 * 1 hour or more: "H:MM:SS" (e.g., "1:00:00").
 */
export function formatRestRemaining(ms: number): string {
	if (ms <= 0) return "0:00";
	const totalSeconds = Math.ceil(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
	}
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Fire a browser notification when a rest timer completes. */
function fireRestCompleteNotification(serial: string): void {
	if (!getNotificationsEnabled()) return;
	if (typeof Notification === "undefined") return;
	if (Notification.permission === "denied") return;

	const title = "Rest Timer Complete";
	const body = `Rest period for ${serial} is done.`;
	const tag = `rest-complete:${serial}`;

	if (Notification.permission === "granted") {
		const n = new Notification(title, { body, tag, icon: "/favicon.svg" });
		n.onclick = () => {
			window.focus();
			n.close();
		};
	} else if (Notification.permission === "default") {
		Notification.requestPermission()
			.then((perm) => {
				if (perm === "granted") {
					const n = new Notification(title, { body, tag, icon: "/favicon.svg" });
					n.onclick = () => {
						window.focus();
						n.close();
					};
				}
			})
			.catch(() => {});
	}
}

export interface UseRestTimerResult {
	/** Whether a rest timer is currently counting down. */
	isResting: boolean;
	/** Remaining time in milliseconds. */
	remainingMs: number;
	/** Human-readable remaining time (e.g., "10:00"). */
	remainingFormatted: string;
	/** Start a rest timer with the given duration in minutes. */
	start: (durationMinutes: number) => void;
	/** Cancel the active rest timer. */
	cancel: () => void;
}

/**
 * Manages a rest timer for a single device serial with localStorage persistence.
 *
 * Provides start/cancel actions and a live countdown that ticks every second.
 * When the timer reaches zero, a browser notification fires (respecting the
 * user's notification preference) and the timer is cleaned up from storage.
 */
export function useRestTimer(serial: string): UseRestTimerResult {
	const [endTime, setEndTime] = useState<number | null>(() => {
		const end = getRestTimerEnd(serial);
		if (end != null && end > Date.now()) return end;
		return null;
	});
	const [remainingMs, setRemainingMs] = useState(0);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const notifiedRef = useRef(false);

	// Sync from localStorage when serial changes.
	useEffect(() => {
		const end = getRestTimerEnd(serial);
		if (end != null && end > Date.now()) {
			setEndTime(end);
			notifiedRef.current = false;
		} else {
			setEndTime(null);
			setRemainingMs(0);
		}
	}, [serial]);

	// Countdown ticker.
	useEffect(() => {
		if (endTime == null) {
			setRemainingMs(0);
			return undefined;
		}

		const tick = () => {
			const remaining = endTime - Date.now();
			if (remaining <= 0) {
				setRemainingMs(0);
				setEndTime(null);
				cancelRestTimer(serial);
				if (!notifiedRef.current) {
					notifiedRef.current = true;
					fireRestCompleteNotification(serial);
				}
				if (intervalRef.current) {
					clearInterval(intervalRef.current);
					intervalRef.current = null;
				}
			} else {
				setRemainingMs(remaining);
			}
		};

		tick();
		intervalRef.current = setInterval(tick, 1000);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [endTime, serial]);

	const start = useCallback(
		(durationMinutes: number) => {
			startRestTimer(serial, durationMinutes);
			const newEnd = Date.now() + durationMinutes * 60 * 1000;
			setEndTime(newEnd);
			notifiedRef.current = false;
		},
		[serial],
	);

	const cancel = useCallback(() => {
		cancelRestTimer(serial);
		setEndTime(null);
		notifiedRef.current = false;
	}, [serial]);

	return {
		isResting: endTime != null && remainingMs > 0,
		remainingMs,
		remainingFormatted: formatRestRemaining(remainingMs),
		start,
		cancel,
	};
}
