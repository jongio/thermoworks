import { useCallback, useEffect, useRef, useState } from "react";
import type { FirmwareInfo } from "thermoworks-sdk";
import type { ThermoworksWebClient } from "../lib/api.ts";

export type FirmwareState = "up-to-date" | "update-available" | "unknown";

export interface UseFirmwareStatusResult {
	state: FirmwareState;
	latestVersion: string | null;
	isLoading: boolean;
}

/**
 * Compare two semver-like version strings.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 * Handles dotted numeric segments (e.g. "2.1.0" vs "2.2.0").
 */
export function compareVersions(a: string, b: string): number {
	const partsA = a.split(".").map(Number);
	const partsB = b.split(".").map(Number);
	const len = Math.max(partsA.length, partsB.length);

	for (let i = 0; i < len; i++) {
		const segA = partsA[i] ?? 0;
		const segB = partsB[i] ?? 0;
		if (segA !== segB) return segA - segB;
	}
	return 0;
}

/**
 * Hook that fetches the latest firmware info for a device type and compares
 * it against the device's current firmware version.
 *
 * Returns "unknown" if firmware info can't be fetched (graceful degradation).
 */
export function useFirmwareStatus(
	client: ThermoworksWebClient | null,
	deviceType: string | null,
	currentVersion: string | null,
): UseFirmwareStatusResult {
	const [state, setState] = useState<FirmwareState>("unknown");
	const [latestVersion, setLatestVersion] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	const fetchFirmware = useCallback(async () => {
		if (!client?.isAuthenticated || !deviceType || !currentVersion) return;

		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;

		setIsLoading(true);

		try {
			const info: FirmwareInfo | null = await client.getFirmwareInfo(deviceType);
			if (controller.signal.aborted) return;

			if (!info || !info.version) {
				setState("unknown");
				setLatestVersion(null);
			} else {
				setLatestVersion(info.version);
				const cmp = compareVersions(currentVersion, info.version);
				setState(cmp < 0 ? "update-available" : "up-to-date");
			}
		} catch {
			if (!controller.signal.aborted) {
				setState("unknown");
				setLatestVersion(null);
			}
		} finally {
			if (!controller.signal.aborted) {
				setIsLoading(false);
			}
		}
	}, [client, deviceType, currentVersion]);

	useEffect(() => {
		if (!client?.isAuthenticated || !deviceType || !currentVersion) {
			setState("unknown");
			setLatestVersion(null);
			return;
		}

		fetchFirmware();

		return () => {
			abortRef.current?.abort();
		};
	}, [client, deviceType, currentVersion, fetchFirmware]);

	return { state, latestVersion, isLoading };
}
