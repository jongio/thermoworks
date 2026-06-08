import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "thermoworks-streaming-mode";
const STREAM_INTERVAL_MS = 2_000;
const POLL_INTERVAL_MS = 10_000;

export type StreamingMode = "stream" | "poll";

interface UseSubscriptionOptions {
	enabled: boolean;
}

interface UseSubscriptionResult {
	mode: StreamingMode;
	intervalMs: number;
	isStreaming: boolean;
	switchMode: (mode: StreamingMode) => void;
	toggleMode: () => void;
}

function loadPersistedMode(): StreamingMode {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === "stream" || stored === "poll") return stored;
	} catch {
		// localStorage unavailable (SSR, private browsing)
	}
	return "stream";
}

function persistMode(mode: StreamingMode): void {
	try {
		localStorage.setItem(STORAGE_KEY, mode);
	} catch {
		// Silently ignore write failures
	}
}

/**
 * Manages streaming mode preference with localStorage persistence.
 * - "stream" mode uses a 2s fast-poll interval for near real-time updates.
 * - "poll" mode uses the standard 10s interval to reduce network usage.
 */
export function useSubscription(options: UseSubscriptionOptions): UseSubscriptionResult {
	const { enabled } = options;
	const [mode, setMode] = useState<StreamingMode>(loadPersistedMode);

	const intervalMs = mode === "stream" ? STREAM_INTERVAL_MS : POLL_INTERVAL_MS;
	const isStreaming = enabled && mode === "stream";

	const switchMode = useCallback((newMode: StreamingMode) => {
		setMode(newMode);
		persistMode(newMode);
	}, []);

	const toggleMode = useCallback(() => {
		const next: StreamingMode = mode === "stream" ? "poll" : "stream";
		switchMode(next);
	}, [mode, switchMode]);

	// Sync persisted mode on mount (handles cross-tab changes)
	useEffect(() => {
		const handleStorage = (e: StorageEvent) => {
			if (e.key === STORAGE_KEY && (e.newValue === "stream" || e.newValue === "poll")) {
				setMode(e.newValue);
			}
		};
		window.addEventListener("storage", handleStorage);
		return () => window.removeEventListener("storage", handleStorage);
	}, []);

	return { mode, intervalMs, isStreaming, switchMode, toggleMode };
}
