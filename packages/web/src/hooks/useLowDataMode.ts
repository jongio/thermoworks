import { useCallback, useState } from "react";

export const LOW_DATA_STORAGE_KEY = "thermoworks-low-data-mode";

/**
 * The polling interval used when low-data mode is active (60 seconds).
 * Chosen to cut network traffic by ~6x compared to the default 10s interval
 * while still keeping temperatures reasonably fresh during a long cook.
 */
export const LOW_DATA_INTERVAL_MS = 60_000;

function getInitialValue(): boolean {
	if (typeof window === "undefined") return false;
	return window.localStorage.getItem(LOW_DATA_STORAGE_KEY) === "true";
}

export interface UseLowDataModeResult {
	/** Whether low-data mode is currently active. */
	isLowData: boolean;
	/** Set low-data mode on or off explicitly. */
	setLowData: (enabled: boolean) => void;
	/** Toggle low-data mode between on and off. */
	toggleLowData: () => void;
}

/**
 * Hook that manages the low-data mode preference.
 * Persists the selection to localStorage so it survives page reloads.
 */
export function useLowDataMode(): UseLowDataModeResult {
	const [isLowData, setIsLowData] = useState<boolean>(getInitialValue);

	const setLowData = useCallback((enabled: boolean) => {
		setIsLowData(enabled);
		window.localStorage.setItem(LOW_DATA_STORAGE_KEY, String(enabled));
	}, []);

	const toggleLowData = useCallback(() => {
		setIsLowData((prev) => {
			const next = !prev;
			window.localStorage.setItem(LOW_DATA_STORAGE_KEY, String(next));
			return next;
		});
	}, []);

	return { isLowData, setLowData, toggleLowData };
}
