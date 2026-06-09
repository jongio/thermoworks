import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceHistory, ThermoworksWebClient } from "../lib/api.ts";

interface UseHistoryResult {
	history: DeviceHistory | null;
	isLoading: boolean;
	error: string | null;
	refresh: () => void;
}

/**
 * Hook that fetches BigQuery historical data for a device.
 * Only fetches when `enabled` is true (device data has loaded).
 */
export function useHistory(
	client: ThermoworksWebClient | null,
	serial: string,
	enabled: boolean,
): UseHistoryResult {
	const [history, setHistory] = useState<DeviceHistory | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const fetchHistory = useCallback(async () => {
		if (!client?.isAuthenticated || !serial || !enabled) return;

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setIsLoading(true);
		setError(null);

		try {
			const data = await client.getHistory(serial);
			if (!controller.signal.aborted) {
				setHistory(data);
			}
		} catch (err) {
			if (!controller.signal.aborted) {
				setError(err instanceof Error ? err.message : "Failed to fetch history");
			}
		} finally {
			if (!controller.signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [client, serial, enabled]);

	useEffect(() => {
		if (!enabled) {
			setHistory(null);
			setError(null);
			return;
		}

		fetchHistory();

		return () => {
			abortRef.current?.abort();
		};
	}, [enabled, fetchHistory]);

	return { history, isLoading, error, refresh: fetchHistory };
}
