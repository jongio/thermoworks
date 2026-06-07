import { useCallback, useEffect, useRef, useState } from "react";
import type { Archive } from "thermoworks-sdk";
import type { ThermoworksWebClient } from "../lib/api.ts";

interface UseArchiveDataResult {
	archives: Archive[];
	isLoading: boolean;
	error: string | null;
	refresh: () => void;
}

/**
 * Hook that fetches archive data for a device.
 * Only fetches when `enabled` is true (device chart is expanded).
 */
export function useArchiveData(
	client: ThermoworksWebClient | null,
	serial: string,
	enabled: boolean,
): UseArchiveDataResult {
	const [archives, setArchives] = useState<Archive[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const fetchArchives = useCallback(async () => {
		if (!client?.isAuthenticated || !serial || !enabled) return;

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setIsLoading(true);
		setError(null);

		try {
			const data = await client.getArchives(serial, 5);
			if (!controller.signal.aborted) {
				setArchives(data);
			}
		} catch (err) {
			if (!controller.signal.aborted) {
				setError(err instanceof Error ? err.message : "Failed to fetch archives");
			}
		} finally {
			if (!controller.signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [client, serial, enabled]);

	useEffect(() => {
		if (!enabled) {
			setArchives([]);
			setError(null);
			return;
		}

		fetchArchives();

		return () => {
			abortRef.current?.abort();
		};
	}, [enabled, fetchArchives]);

	return { archives, isLoading, error, refresh: fetchArchives };
}
