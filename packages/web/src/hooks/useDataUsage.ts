import { useCallback, useEffect, useState } from "react";
import type { BillingPlan, DataUsage, DeviceDataUsage, ThermoworksWebClient } from "../lib/api.ts";

interface UseDataUsageResult {
	usage: DataUsage | null;
	deviceUsage: DeviceDataUsage[];
	plan: BillingPlan | null;
	isLoading: boolean;
	error: string | null;
	lastUpdated: Date | null;
	refresh: () => void;
}

export function useDataUsage(client: ThermoworksWebClient | null): UseDataUsageResult {
	const [usage, setUsage] = useState<DataUsage | null>(null);
	const [deviceUsage, setDeviceUsage] = useState<DeviceDataUsage[]>([]);
	const [plan, setPlan] = useState<BillingPlan | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

	const fetchUsage = useCallback(async () => {
		if (!client?.isAuthenticated) return;

		setIsLoading(true);
		setError(null);

		try {
			const [nextUsage, nextDeviceUsage, nextPlan] = await Promise.all([
				client.getDataUsage(),
				client.getDataUsageByDevice(),
				client.getBillingPlan(),
			]);

			setUsage(nextUsage);
			setDeviceUsage(nextDeviceUsage);
			setPlan(nextPlan);
			setLastUpdated(new Date());
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load data usage");
		} finally {
			setIsLoading(false);
		}
	}, [client]);

	useEffect(() => {
		if (!client?.isAuthenticated) {
			setUsage(null);
			setDeviceUsage([]);
			setPlan(null);
			setError(null);
			setLastUpdated(null);
			return;
		}

		const authenticatedClient = client;
		let cancelled = false;

		async function load() {
			setIsLoading(true);
			setError(null);

			try {
				const [nextUsage, nextDeviceUsage, nextPlan] = await Promise.all([
					authenticatedClient.getDataUsage(),
					authenticatedClient.getDataUsageByDevice(),
					authenticatedClient.getBillingPlan(),
				]);

				if (cancelled) return;

				setUsage(nextUsage);
				setDeviceUsage(nextDeviceUsage);
				setPlan(nextPlan);
				setLastUpdated(new Date());
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to load data usage");
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		load();

		return () => {
			cancelled = true;
		};
	}, [client]);

	return { usage, deviceUsage, plan, isLoading, error, lastUpdated, refresh: fetchUsage };
}
