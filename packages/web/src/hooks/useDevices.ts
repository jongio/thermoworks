import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceWithChannels, ThermoworksWebClient } from "../lib/api.ts";

const DEFAULT_POLL_INTERVAL_MS = 10_000;

interface UseDevicesResult {
	data: DeviceWithChannels[];
	isLoading: boolean;
	error: string | null;
	lastUpdated: Date | null;
	refresh: () => void;
}

/**
 * Hook that polls for device data at the specified interval.
 * Only active when a client is provided (authenticated).
 */
export function useDevices(
	client: ThermoworksWebClient | null,
	pollInterval = DEFAULT_POLL_INTERVAL_MS,
): UseDevicesResult {
	const [data, setData] = useState<DeviceWithChannels[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const fetchDevices = useCallback(async () => {
		if (!client?.isAuthenticated) return;

		// Cancel any in-flight request
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setIsLoading(true);
		setError(null);

		try {
			const devices = await client.getDevicesWithChannels();
			if (!controller.signal.aborted) {
				setData(devices);
				setLastUpdated(new Date());
			}
		} catch (err) {
			if (!controller.signal.aborted) {
				setError(err instanceof Error ? err.message : "Failed to fetch devices");
			}
		} finally {
			if (!controller.signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [client]);

	// Initial fetch + polling
	useEffect(() => {
		if (!client?.isAuthenticated) {
			setData([]);
			setError(null);
			setLastUpdated(null);
			return;
		}

		fetchDevices();

		intervalRef.current = setInterval(fetchDevices, pollInterval);

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
			abortRef.current?.abort();
		};
	}, [client, fetchDevices, pollInterval]);

	return { data, isLoading, error, lastUpdated, refresh: fetchDevices };
}
