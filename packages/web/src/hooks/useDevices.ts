import { useCallback, useEffect, useRef, useState } from "react";
import { useOfflineCacheContext } from "../context/OfflineCacheContext.tsx";
import type { DeviceWithChannels, ThermoworksWebClient } from "../lib/api.ts";
import { cacheDevices, getCachedDevices } from "../lib/offline-store.ts";
import { useOnlineStatus } from "./useOnlineStatus.ts";

const DEFAULT_POLL_INTERVAL_MS = 10_000;

interface UseDevicesOptions {
	/** Polling interval in milliseconds. Defaults to 10000ms. */
	pollingInterval?: number;
}

interface UseDevicesResult {
	data: DeviceWithChannels[];
	isLoading: boolean;
	error: string | null;
	lastUpdated: Date | null;
	/** True when serving data from IndexedDB cache instead of live API. */
	isFromCache: boolean;
	refresh: () => void;
}

/**
 * Hook that polls for device data at a configurable interval.
 * Only active when a client is provided (authenticated).
 *
 * On successful fetch, caches device data to IndexedDB.
 * When offline or on network error, serves cached data with a timestamp.
 */
export function useDevices(
	client: ThermoworksWebClient | null,
	options: UseDevicesOptions = {},
): UseDevicesResult {
	const { pollingInterval = DEFAULT_POLL_INTERVAL_MS } = options;
	const [data, setData] = useState<DeviceWithChannels[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
	const [isFromCache, setIsFromCache] = useState(false);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const isOnline = useOnlineStatus();
	const { setCacheState } = useOfflineCacheContext();

	const serveCachedData = useCallback(async (): Promise<boolean> => {
		try {
			const cached = await getCachedDevices();
			if (cached) {
				const cachedDate = new Date(cached.cachedAt);
				setData(cached.devices);
				setLastUpdated(cachedDate);
				setIsFromCache(true);
				setCacheState(cachedDate, true);
				return true;
			}
		} catch {
			// IndexedDB unavailable — silently ignore
		}
		return false;
	}, [setCacheState]);

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
				setIsFromCache(false);
				setCacheState(null, false);

				// Cache in background — don't block rendering
				cacheDevices(devices).catch(() => {});
			}
		} catch (err) {
			if (!controller.signal.aborted) {
				const message = err instanceof Error ? err.message : "Failed to fetch devices";
				setError(message);

				// Serve cached data when fetch fails
				await serveCachedData();
			}
		} finally {
			if (!controller.signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [client, serveCachedData, setCacheState]);

	// Initial fetch + polling
	useEffect(() => {
		if (!client?.isAuthenticated) {
			setData([]);
			setError(null);
			setLastUpdated(null);
			setIsFromCache(false);
			return;
		}

		fetchDevices();

		intervalRef.current = setInterval(fetchDevices, pollingInterval);

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
			abortRef.current?.abort();
		};
	}, [client, fetchDevices, pollingInterval]);

	// When going offline with no data yet, try to serve from cache
	useEffect(() => {
		if (!isOnline && data.length === 0 && client?.isAuthenticated) {
			serveCachedData();
		}
	}, [isOnline, data.length, client, serveCachedData]);

	return { data, isLoading, error, lastUpdated, isFromCache, refresh: fetchDevices };
}
