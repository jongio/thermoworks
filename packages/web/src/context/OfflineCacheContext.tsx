import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface OfflineCacheState {
	/** Timestamp of when the cached data was originally fetched. Null if no cache. */
	cachedAt: Date | null;
	/** Whether the currently-displayed data came from IndexedDB cache. */
	isFromCache: boolean;
	/** Update cache state — called by hooks that manage offline data. */
	setCacheState: (cachedAt: Date | null, isFromCache: boolean) => void;
}

const OfflineCacheContext = createContext<OfflineCacheState>({
	cachedAt: null,
	isFromCache: false,
	setCacheState: () => {},
});

export function OfflineCacheProvider({ children }: { children: ReactNode }) {
	const [cachedAt, setCachedAt] = useState<Date | null>(null);
	const [isFromCache, setIsFromCache] = useState(false);

	const value = useMemo(
		() => ({
			cachedAt,
			isFromCache,
			setCacheState: (at: Date | null, fromCache: boolean) => {
				setCachedAt(at);
				setIsFromCache(fromCache);
			},
		}),
		[cachedAt, isFromCache],
	);

	return <OfflineCacheContext value={value}>{children}</OfflineCacheContext>;
}

export function useOfflineCacheContext(): OfflineCacheState {
	return useContext(OfflineCacheContext);
}
