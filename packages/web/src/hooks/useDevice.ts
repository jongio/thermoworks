import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceWithChannels, ThermoworksWebClient } from "../lib/api.ts";

const POLL_INTERVAL_MS = 10_000;

interface UseDeviceResult {
	data: DeviceWithChannels | null;
	isLoading: boolean;
	error: string | null;
	refresh: () => void;
}

/**
 * Hook that fetches a single device and all its channels, polling every 10 seconds.
 * Only active when a client is provided (authenticated) and serial is non-empty.
 */
export function useDevice(client: ThermoworksWebClient | null, serial: string): UseDeviceResult {
	const [data, setData] = useState<DeviceWithChannels | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const fetchDevice = useCallback(async () => {
		if (!client?.isAuthenticated || !serial) return;

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setIsLoading(true);
		setError(null);

		try {
			const devices = await client.getDevicesWithChannels();
			if (controller.signal.aborted) return;

			const match = devices.find((d) => d.device.serial === serial);
			if (match) {
				setData(match);
			} else {
				setData(null);
				setError("Device not found");
			}
		} catch (err) {
			if (!controller.signal.aborted) {
				setError(err instanceof Error ? err.message : "Failed to fetch device");
			}
		} finally {
			if (!controller.signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [client, serial]);

	useEffect(() => {
		if (!client?.isAuthenticated || !serial) {
			setData(null);
			setError(null);
			return;
		}

		fetchDevice();

		intervalRef.current = setInterval(fetchDevice, POLL_INTERVAL_MS);

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
			abortRef.current?.abort();
		};
	}, [client, serial, fetchDevice]);

	return { data, isLoading, error, refresh: fetchDevice };
}
