import { useEffect, useRef } from "react";

export const WAKE_LOCK_PREFERENCE_STORAGE_KEY = "thermoworks-wake-lock-enabled";

/** Whether the browser exposes the Screen Wake Lock API. */
export function isWakeLockSupported(): boolean {
	return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/** Read the user's wake lock preference from localStorage. Defaults to off. */
export function getWakeLockEnabled(): boolean {
	try {
		return localStorage.getItem(WAKE_LOCK_PREFERENCE_STORAGE_KEY) === "true";
	} catch {
		return false;
	}
}

/** Persist the user's wake lock preference to localStorage. */
export function setWakeLockEnabled(enabled: boolean): void {
	try {
		localStorage.setItem(WAKE_LOCK_PREFERENCE_STORAGE_KEY, String(enabled));
	} catch {
		// Storage unavailable - ignore.
	}
}

/**
 * Holds a screen wake lock while `enabled` is true.
 *
 * The browser releases wake locks automatically when the page is hidden
 * (tab switch, minimize), so this re-acquires the lock when the page
 * becomes visible again. Does nothing when the API is unavailable.
 */
export function useWakeLock(enabled: boolean): void {
	const sentinelRef = useRef<WakeLockSentinel | null>(null);

	useEffect(() => {
		if (!enabled || !isWakeLockSupported()) return;

		let cancelled = false;

		const acquire = async () => {
			if (cancelled || sentinelRef.current) return;
			try {
				const sentinel = await navigator.wakeLock.request("screen");
				if (cancelled) {
					sentinel.release().catch(() => {});
					return;
				}
				sentinelRef.current = sentinel;
				sentinel.addEventListener("release", () => {
					sentinelRef.current = null;
				});
			} catch {
				// Request can reject (e.g. page not visible, low battery) - ignore.
			}
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") void acquire();
		};

		void acquire();
		document.addEventListener("visibilitychange", onVisibilityChange);

		return () => {
			cancelled = true;
			document.removeEventListener("visibilitychange", onVisibilityChange);
			const sentinel = sentinelRef.current;
			sentinelRef.current = null;
			sentinel?.release().catch(() => {});
		};
	}, [enabled]);
}
