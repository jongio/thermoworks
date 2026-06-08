import { useCallback, useEffect, useState } from "react";
import type { DeviceGroup, ThermoworksWebClient } from "../lib/api.ts";

interface UseDeviceGroupsResult {
	groups: DeviceGroup[];
	isLoading: boolean;
	error: string | null;
	createGroup: (name: string, devices: string[]) => Promise<void>;
	deleteGroup: (groupId: string) => Promise<void>;
	refresh: () => void;
}

/**
 * Hook that fetches and manages device groups.
 * Provides create/delete operations with optimistic UI updates.
 */
export function useDeviceGroups(client: ThermoworksWebClient | null): UseDeviceGroupsResult {
	const [groups, setGroups] = useState<DeviceGroup[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchGroups = useCallback(async () => {
		if (!client?.isAuthenticated) return;

		setIsLoading(true);
		setError(null);

		try {
			const result = await client.getDeviceGroups();
			setGroups(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to fetch device groups");
		} finally {
			setIsLoading(false);
		}
	}, [client]);

	useEffect(() => {
		if (!client?.isAuthenticated) {
			setGroups([]);
			setError(null);
			return;
		}
		fetchGroups();
	}, [client, fetchGroups]);

	const createGroup = useCallback(
		async (name: string, devices: string[]) => {
			if (!client?.isAuthenticated) return;

			try {
				const newGroup = await client.createDeviceGroup(name, devices);
				setGroups((prev) => [...prev, newGroup]);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to create group");
				throw err;
			}
		},
		[client],
	);

	const deleteGroup = useCallback(
		async (groupId: string) => {
			if (!client?.isAuthenticated) return;

			const previous = groups;
			setGroups((prev) => prev.filter((g) => g.id !== groupId));

			try {
				await client.deleteDeviceGroup(groupId);
			} catch (err) {
				setGroups(previous);
				setError(err instanceof Error ? err.message : "Failed to delete group");
				throw err;
			}
		},
		[client, groups],
	);

	return { groups, isLoading, error, createGroup, deleteGroup, refresh: fetchGroups };
}
