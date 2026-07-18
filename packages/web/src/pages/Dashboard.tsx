import { Monitor } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { DeviceGroups } from "../components/DeviceGroups.tsx";
import { DeviceList } from "../components/DeviceList.tsx";
import { LowDataToggle } from "../components/LowDataToggle.tsx";
import { SearchBar } from "../components/SearchBar.tsx";
import { useAlarmNotifications } from "../hooks/useAlarmNotifications.ts";
import { useDeviceGroups } from "../hooks/useDeviceGroups.ts";
import { useDevices } from "../hooks/useDevices.ts";
import { LOW_DATA_INTERVAL_MS, useLowDataMode } from "../hooks/useLowDataMode.ts";
import { useNotificationSettings } from "../hooks/useNotificationSettings.ts";
import { useSearch } from "../hooks/useSearch.ts";
import type { DeviceWithChannels } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

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
	const { isLowData, toggleLowData } = useLowDataMode();
	const pollingInterval = isLowData ? LOW_DATA_INTERVAL_MS : undefined;
	const { data, isLoading, error, lastUpdated, refresh } = useDevices(client, {
		pollingInterval,
	});
	const { groups, createGroup, deleteGroup } = useDeviceGroups(client);
	const notificationPrefs = useNotificationSettings(client);
	useAlarmNotifications(data, notificationPrefs.settings);
	const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

	const groupFilteredData = useMemo(() => {
		if (!activeGroupId) return data;
		const group = groups.find((g) => g.id === activeGroupId);
		if (!group) return data;
		const deviceSet = new Set(group.devices);
		return data.filter((item) => deviceSet.has(item.device.serial));
	}, [data, groups, activeGroupId]);

	const searchMatchDevice = useCallback(matchDevice, []);
	const {
		query,
		setQuery,
		results: filteredData,
		isFiltering,
	} = useSearch(groupFilteredData, searchMatchDevice);

	return (
		<div className="space-y-4">
			<h1 className="sr-only">Dashboard</h1>
			{data.length > 0 && (
				<div className="flex items-center justify-between gap-2">
					<DeviceGroups
						groups={groups}
						devices={data}
						activeGroupId={activeGroupId}
						onSelectGroup={setActiveGroupId}
						onCreateGroup={createGroup}
						onDeleteGroup={deleteGroup}
					/>
					<div className="flex items-center gap-2">
						<LowDataToggle isLowData={isLowData} onToggle={toggleLowData} />
						<Link
							to="/pit"
							className={cn(
								"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
								"border border-border text-muted-foreground",
								"hover:bg-muted hover:text-foreground transition-colors",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							)}
							title="Open pit display mode (f)"
						>
							<Monitor className="h-4 w-4" />
							<span className="hidden sm:inline">Pit Display</span>
						</Link>
					</div>
				</div>
			)}

			{data.length > 0 && <SearchBar value={query} onChange={setQuery} />}

			{isLowData && (
				<div
					role="status"
					aria-live="polite"
					className={cn(
						"flex items-center gap-2 rounded-lg px-4 py-2",
						"border border-green-200 bg-green-50 text-green-800",
						"dark:border-green-800 dark:bg-green-950/30 dark:text-green-300",
					)}
				>
					<span className="text-sm">Low-data mode active. Refreshing every 60 seconds.</span>
				</div>
			)}

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
