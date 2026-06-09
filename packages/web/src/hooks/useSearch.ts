import { useEffect, useMemo, useState } from "react";

const DEBOUNCE_MS = 300;

interface UseSearchResult<T> {
	query: string;
	setQuery: (query: string) => void;
	results: T[];
	isFiltering: boolean;
}

/**
 * Generic search hook with debounced filtering.
 *
 * Returns the full item list when the query is empty,
 * and a filtered subset after a 300ms debounce otherwise.
 */
export function useSearch<T>(
	items: T[],
	searchFn: (item: T, query: string) => boolean,
): UseSearchResult<T> {
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [query]);

	const results = useMemo(() => {
		const trimmed = debouncedQuery.trim();
		if (!trimmed) return items;
		const lower = trimmed.toLowerCase();
		return items.filter((item) => searchFn(item, lower));
	}, [items, debouncedQuery, searchFn]);

	return { query, setQuery, results, isFiltering: debouncedQuery.trim().length > 0 };
}
