import { useCallback, useState } from "react";

const STORAGE_KEY = "thermoworks-refresh-interval";
const DEFAULT_INTERVAL = 10_000;
const INTERVALS = [5_000, 10_000, 30_000, 60_000] as const;

/**
 * Minimum polling interval enforced when low-data mode is active.
 * Re-exported from useLowDataMode for convenience.
 */
export { LOW_DATA_INTERVAL_MS } from "./useLowDataMode.ts";

export type RefreshInterval = (typeof INTERVALS)[number];

function getInitialInterval(): RefreshInterval {
	if (typeof window === "undefined") return DEFAULT_INTERVAL;
	const stored = window.localStorage.getItem(STORAGE_KEY);
	if (stored) {
		const parsed = Number(stored);
		if (INTERVALS.includes(parsed as RefreshInterval)) {
			return parsed as RefreshInterval;
		}
	}
	return DEFAULT_INTERVAL;
}

export interface UseRefreshIntervalResult {
	interval: RefreshInterval;
	updateInterval: (ms: RefreshInterval) => void;
	options: typeof INTERVALS;
}

/**
 * Hook that manages the user's preferred polling interval.
 * Persists selection to localStorage.
 */
export function useRefreshInterval(): UseRefreshIntervalResult {
	const [interval, setInterval] = useState<RefreshInterval>(getInitialInterval);

	const updateInterval = useCallback((ms: RefreshInterval) => {
		setInterval(ms);
		window.localStorage.setItem(STORAGE_KEY, String(ms));
	}, []);

	return { interval, updateInterval, options: INTERVALS };
}
