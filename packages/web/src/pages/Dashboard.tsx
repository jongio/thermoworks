import { useCallback, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { DeviceGroups } from "../components/DeviceGroups.tsx";
import { DeviceList } from "../components/DeviceList.tsx";
import { RefreshSelector } from "../components/RefreshSelector.tsx";
import { SearchBar } from "../components/SearchBar.tsx";
import { StreamingIndicator } from "../components/StreamingIndicator.tsx";
import { useDeviceGroups } from "../hooks/useDeviceGroups.ts";
import { useDevices } from "../hooks/useDevices.ts";
import { useRefreshInterval } from "../hooks/useRefreshInterval.ts";
import { useSearch } from "../hooks/useSearch.ts";
import { useSubscription } from "../hooks/useSubscription.ts";
import type { DeviceWithChannels } from "../lib/api.ts";

/** Match device name, serial, or type against a lowercased query. */
function matchDevice(item: DeviceWithChannels, query: string): boolean {
	const name = item.device.label ?? item.device.serial;
	if (name.toLowerCase().includes(query)) return true;
	if (item.device.serial.toLowerCase().includes(query)) return true;
	const type = item.device.type ?? item.device.device ?? "";
	if (type.toLowerCase().includes(query)) return true;
	return false;
}

export function Dashboard() {
	const { client } = useOutletContext<AppOutletContext>();
	const { data, isLoading, error, lastUpdated, refresh } = useDevices(client);
	const { groups, createGroup, deleteGroup } = useDeviceGroups(client);
	const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

	const groupFilteredData = useMemo(() => {
		if (!activeGroupId) return data;
		const group = groups.find((g) => g.id === activeGroupId);
		if (!group) return data;
		const deviceSet = new Set(group.devices);
		return data.filter((item) => deviceSet.has(item.device.serial));
	}, [data, groups, activeGroupId]);

	const searchMatchDevice = useCallback(matchDevice, []);
	const { query, setQuery, results: filteredData, isFiltering } = useSearch(
		groupFilteredData,
		searchMatchDevice,
	);

	return (
		<div className="space-y-4">
			{data.length > 0 && (
				<DeviceGroups
					groups={groups}
					devices={data}
					activeGroupId={activeGroupId}
					onSelectGroup={setActiveGroupId}
					onCreateGroup={createGroup}
					onDeleteGroup={deleteGroup}
				/>
			)}

			{data.length > 0 && <SearchBar value={query} onChange={setQuery} />}

			<DeviceList
				data={filteredData}
				isLoading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
				onRefresh={refresh}
				client={client}
				isFiltering={isFiltering}
			/>
		</div>
	);
}
