import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceEvent, EventFilter } from "thermoworks-sdk";
import { mergeItemsById, toEventActivityItems } from "../lib/activity.ts";
import type { ThermoworksWebClient } from "../lib/api.ts";

const POLL_INTERVAL_MS = 30_000;
const MAX_PAGE_SIZE = 500;
const PAGE_SIZE_STEP = 200;

function mergeDeviceEvents(
	current: ReadonlyArray<DeviceEvent>,
	next: ReadonlyArray<DeviceEvent>,
): DeviceEvent[] {
	return mergeItemsById(toEventActivityItems(current), toEventActivityItems(next)).map(
		(item) => item.event,
	);
}

interface UseEventsResult {
	data: DeviceEvent[];
	isLoading: boolean;
	isLoadingMore: boolean;
	hasMore: boolean;
	error: string | null;
	lastUpdated: Date | null;
	refresh: () => Promise<void>;
	loadMore: () => Promise<void>;
}

/**
 * Hook that polls for device events every 30 seconds.
 * Supports optional filtering by deviceId and eventType.
 */
export function useEvents(
	client: ThermoworksWebClient | null,
	filter?: EventFilter,
): UseEventsResult {
	const baseLimit = filter?.limit ?? PAGE_SIZE_STEP;
	const filterDeviceId = filter?.deviceId;
	const filterEventType = filter?.eventType;
	const [data, setData] = useState<DeviceEvent[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const requestIdRef = useRef(0);
	const limitRef = useRef(baseLimit);

	const fetchEvents = useCallback(
		async (options: { limit?: number; merge?: boolean; loadingMore?: boolean } = {}) => {
			if (!client?.isAuthenticated) {
				setData([]);
				setError(null);
				setLastUpdated(null);
				setHasMore(false);
				setIsLoading(false);
				setIsLoadingMore(false);
				return;
			}

			const limit = options.limit ?? limitRef.current;
			const requestId = ++requestIdRef.current;

			if (options.loadingMore) {
				setIsLoadingMore(true);
			} else {
				setIsLoading(true);
			}

			const nextFilter: EventFilter = { limit };
			if (filterDeviceId) nextFilter.deviceId = filterDeviceId;
			if (filterEventType) nextFilter.eventType = filterEventType;

			setError(null);

			try {
				const events = await client.getEvents(nextFilter);
				if (requestId !== requestIdRef.current) return;

				setData((current) => (options.merge ? mergeDeviceEvents(current, events) : events));
				setHasMore(limit < MAX_PAGE_SIZE && events.length >= limit);
				setLastUpdated(new Date());
			} catch (err) {
				if (requestId !== requestIdRef.current) return;

				setError(err instanceof Error ? err.message : "Failed to fetch events");
			} finally {
				if (requestId === requestIdRef.current) {
					setIsLoading(false);
					setIsLoadingMore(false);
				}
			}
		},
		[client, filterDeviceId, filterEventType],
	);

	const refresh = useCallback(() => fetchEvents({ merge: true }), [fetchEvents]);

	const loadMore = useCallback(async () => {
		if (isLoadingMore || !hasMore) return;

		const nextLimit = Math.min(limitRef.current + PAGE_SIZE_STEP, MAX_PAGE_SIZE);
		if (nextLimit === limitRef.current) {
			setHasMore(false);
			return;
		}

		limitRef.current = nextLimit;
		await fetchEvents({ limit: nextLimit, loadingMore: true });
	}, [fetchEvents, hasMore, isLoadingMore]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset state on filter change
	useEffect(() => {
		limitRef.current = baseLimit;
		setData([]);
		setError(null);
		setLastUpdated(null);
		setHasMore(true);
		setIsLoading(false);
		setIsLoadingMore(false);
	}, [baseLimit, client, filterDeviceId, filterEventType]);

	useEffect(() => {
		if (!client?.isAuthenticated) {
			setData([]);
			setError(null);
			setLastUpdated(null);
			setHasMore(false);
			return;
		}

		void fetchEvents();

		intervalRef.current = setInterval(() => {
			void fetchEvents({ merge: true });
		}, POLL_INTERVAL_MS);

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
			requestIdRef.current += 1;
		};
	}, [client, fetchEvents]);

	return {
		data,
		isLoading,
		isLoadingMore,
		hasMore,
		error,
		lastUpdated,
		refresh,
		loadMore,
	};
}
