import { useCallback, useEffect, useRef, useState } from "react";
import type { CalibrationRecord } from "../lib/api.ts";
import type { ThermoworksWebClient } from "../lib/api.ts";

interface UseCalibrationResult {
	data: CalibrationRecord[];
	isLoading: boolean;
	error: string | null;
	refresh: () => void;
}

/**
 * Hook that fetches calibration records for a device.
 * Calibration data is static (factory data), so no polling is needed.
 * Only fetches when `enabled` is true (device is loaded).
 */
export function useCalibration(
	client: ThermoworksWebClient | null,
	serial: string,
	enabled: boolean,
): UseCalibrationResult {
	const [data, setData] = useState<CalibrationRecord[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const fetchCalibration = useCallback(async () => {
		if (!client?.isAuthenticated || !serial || !enabled) return;

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setIsLoading(true);
		setError(null);

		try {
			const records = await client.getCalibration(serial);
			if (!controller.signal.aborted) {
				setData(records);
			}
		} catch (err) {
			if (!controller.signal.aborted) {
				setError(err instanceof Error ? err.message : "Failed to fetch calibration data");
			}
		} finally {
			if (!controller.signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [client, serial, enabled]);

	useEffect(() => {
		if (!enabled) {
			setData([]);
			setError(null);
			return;
		}

		fetchCalibration();

		return () => {
			abortRef.current?.abort();
		};
	}, [enabled, fetchCalibration]);

	return { data, isLoading, error, refresh: fetchCalibration };
}
