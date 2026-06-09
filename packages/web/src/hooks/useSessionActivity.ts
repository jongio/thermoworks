import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThermoworksWebClient } from "../lib/api.ts";
import {
	mergeItemsById,
	type SessionActivityItem,
	toSessionActivityItems,
} from "../lib/activity.ts";

const POLL_INTERVAL_MS = 30_000;
const MAX_ARCHIVE_PAGE_SIZE = 500;
const ARCHIVE_PAGE_STEP = 10;

interface UseSessionActivityResult {
	data: SessionActivityItem[];
	isLoading: boolean;
	isLoadingMore: boolean;
	hasMore: boolean;
	error: string | null;
	lastUpdated: Date | null;
	refresh: () => Promise<void>;
	loadMore: () => Promise<void>;
}

export function useSessionActivity(
	client: ThermoworksWebClient | null,
	serials: ReadonlyArray<string>,
): UseSessionActivityResult {
	const serialKey = useMemo(() => Array.from(new Set(serials)).sort().join("|"), [serials]);
	const sortedSerials = useMemo(() => (serialKey ? serialKey.split("|") : []), [serialKey]);

	const [data, setData] = useState<SessionActivityItem[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(sortedSerials.length > 0);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const requestIdRef = useRef(0);
	const limitRef = useRef(ARCHIVE_PAGE_STEP);

	const fetchActivity = useCallback(
		async (options: { limit?: number; merge?: boolean; loadingMore?: boolean } = {}) => {
			if (!client?.isAuthenticated || sortedSerials.length === 0) {
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

			setError(null);

			try {
				const results = await Promise.allSettled(
					sortedSerials.map(async (serial) => ({
						serial,
						archives: await client.getArchives(serial, limit),
					})),
				);
				if (requestId !== requestIdRef.current) return;

				const nextItems: SessionActivityItem[] = [];
				let nextHasMore = false;
				let failedCount = 0;

				for (const result of results) {
					if (result.status === "fulfilled") {
						const { serial, archives } = result.value;
						nextItems.push(...toSessionActivityItems(serial, archives));
						if (archives.length >= limit && limit < MAX_ARCHIVE_PAGE_SIZE) {
							nextHasMore = true;
						}
					} else {
						failedCount += 1;
					}
				}

				setData((current) => (options.merge ? mergeItemsById(current, nextItems) : nextItems));
				setHasMore(nextHasMore);
				setLastUpdated(new Date());
				setError(failedCount > 0 ? "Some session activity could not be loaded." : null);
			} catch (err) {
				if (requestId !== requestIdRef.current) return;

				setError(err instanceof Error ? err.message : "Failed to fetch session activity");
			} finally {
				if (requestId === requestIdRef.current) {
					setIsLoading(false);
					setIsLoadingMore(false);
				}
			}
		},
		[client, serialKey, sortedSerials],
	);

	const refresh = useCallback(() => fetchActivity({ merge: true }), [fetchActivity]);

	const loadMore = useCallback(async () => {
		if (isLoadingMore || !hasMore) return;

		const nextLimit = Math.min(limitRef.current + ARCHIVE_PAGE_STEP, MAX_ARCHIVE_PAGE_SIZE);
		if (nextLimit === limitRef.current) {
			setHasMore(false);
			return;
		}

		limitRef.current = nextLimit;
		await fetchActivity({ limit: nextLimit, loadingMore: true });
	}, [fetchActivity, hasMore, isLoadingMore]);

	useEffect(() => {
		limitRef.current = ARCHIVE_PAGE_STEP;
		setData([]);
		setError(null);
		setLastUpdated(null);
		setHasMore(sortedSerials.length > 0);
		setIsLoading(false);
		setIsLoadingMore(false);
	}, [client, serialKey, sortedSerials.length]);

	useEffect(() => {
		if (!client?.isAuthenticated || sortedSerials.length === 0) {
			return;
		}

		void fetchActivity();

		intervalRef.current = setInterval(() => {
			void fetchActivity({ merge: true });
		}, POLL_INTERVAL_MS);

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
			requestIdRef.current += 1;
		};
	}, [client, fetchActivity, serialKey, sortedSerials.length]);

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
