import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceEvent, EventFilter } from "thermoworks-sdk";
import type { ThermoworksWebClient } from "../lib/api.ts";

const POLL_INTERVAL_MS = 30_000;

interface UseEventsResult {
	data: DeviceEvent[];
	isLoading: boolean;
	error: string | null;
	lastUpdated: Date | null;
	refresh: () => void;
}

/**
 * Hook that polls for device events every 30 seconds.
 * Supports optional filtering by deviceId and eventType.
 */
export function useEvents(
	client: ThermoworksWebClient | null,
	filter?: EventFilter,
): UseEventsResult {
	const [data, setData] = useState<DeviceEvent[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const fetchEvents = useCallback(async () => {
		if (!client?.isAuthenticated) return;

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setIsLoading(true);
		setError(null);

		try {
			const events = await client.getEvents(filter);
			if (!controller.signal.aborted) {
				setData(events);
				setLastUpdated(new Date());
			}
		} catch (err) {
			if (!controller.signal.aborted) {
				setError(err instanceof Error ? err.message : "Failed to fetch events");
			}
		} finally {
			if (!controller.signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [client, filter]);

	useEffect(() => {
		if (!client?.isAuthenticated) {
			setData([]);
			setError(null);
			setLastUpdated(null);
			return;
		}

		fetchEvents();

		intervalRef.current = setInterval(fetchEvents, POLL_INTERVAL_MS);

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
			abortRef.current?.abort();
		};
	}, [client, fetchEvents]);

	return { data, isLoading, error, lastUpdated, refresh: fetchEvents };
}
