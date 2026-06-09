import { useCallback, useEffect, useRef, useState } from "react";
import type { TemperatureGuide, ThermoworksWebClient } from "../lib/api.ts";

interface UseTemperatureGuideResult {
	data: TemperatureGuide | null;
	isLoading: boolean;
	error: string | null;
}

/**
 * Fetches temperature guide data from the API and caches the result.
 * Falls through to null (triggering fallback in the UI) if the
 * document doesn't exist or the user isn't authenticated.
 */
export function useTemperatureGuide(
	client: ThermoworksWebClient | null,
): UseTemperatureGuideResult {
	const [data, setData] = useState<TemperatureGuide | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const cacheRef = useRef<TemperatureGuide | null>(null);

	const fetchGuide = useCallback(async () => {
		if (!client?.isAuthenticated) return;
		if (cacheRef.current) {
			setData(cacheRef.current);
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			const guide = await client.getTemperatureGuide();
			cacheRef.current = guide;
			setData(guide);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch temperature guide");
		} finally {
			setIsLoading(false);
		}
	}, [client]);

	useEffect(() => {
		if (!client?.isAuthenticated) {
			setData(null);
			setError(null);
			return;
		}
		fetchGuide();
	}, [client, fetchGuide]);

	return { data, isLoading, error };
}
