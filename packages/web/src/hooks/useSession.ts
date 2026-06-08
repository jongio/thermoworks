import { useCallback, useEffect, useRef, useState } from "react";
import type { ThermoworksWebClient } from "../lib/api.ts";

export interface UseSessionResult {
	isActive: boolean;
	elapsed: string;
	label: string;
	startSession: (label?: string) => Promise<void>;
	endSession: () => Promise<void>;
	error: string | null;
}

function formatElapsed(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return [
		hours.toString().padStart(2, "0"),
		minutes.toString().padStart(2, "0"),
		seconds.toString().padStart(2, "0"),
	].join(":");
}

/**
 * Hook managing session state for a device.
 * Tracks elapsed time with a 1-second interval while a session is active.
 */
export function useSession(
	client: ThermoworksWebClient | null,
	serial: string,
	sessionStart: Date | null,
	sessionLabel: string | null,
): UseSessionResult {
	const [isActive, setIsActive] = useState(sessionStart !== null);
	const [startTime, setStartTime] = useState<Date | null>(sessionStart);
	const [label, setLabel] = useState(sessionLabel ?? "");
	const [elapsed, setElapsed] = useState("00:00:00");
	const [error, setError] = useState<string | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Sync with external device data (e.g., when device re-fetched)
	useEffect(() => {
		setIsActive(sessionStart !== null);
		setStartTime(sessionStart);
		setLabel(sessionLabel ?? "");
	}, [sessionStart, sessionLabel]);

	// Elapsed time ticker
	useEffect(() => {
		if (isActive && startTime) {
			const tick = () => {
				const diff = Date.now() - startTime.getTime();
				setElapsed(formatElapsed(Math.max(0, diff)));
			};
			tick();
			intervalRef.current = setInterval(tick, 1000);
			return () => {
				if (intervalRef.current) clearInterval(intervalRef.current);
			};
		}
		setElapsed("00:00:00");
		return undefined;
	}, [isActive, startTime]);

	const startSession = useCallback(
		async (newLabel?: string) => {
			if (!client?.isAuthenticated) return;
			setError(null);
			try {
				const result = await client.startSession(serial, newLabel);
				if (result.success) {
					const now = new Date();
					setIsActive(true);
					setStartTime(now);
					setLabel(newLabel ?? "");
				} else {
					setError("Failed to start session");
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to start session");
			}
		},
		[client, serial],
	);

	const endSession = useCallback(async () => {
		if (!client?.isAuthenticated) return;
		setError(null);
		try {
			const result = await client.endSession(serial);
			if (result.success) {
				setIsActive(false);
				setStartTime(null);
			} else {
				setError("Failed to end session");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to end session");
		}
	}, [client, serial]);

	return { isActive, elapsed, label, startSession, endSession, error };
}
