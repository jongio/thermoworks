import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { DeviceGroups } from "../components/DeviceGroups.tsx";
import { DeviceList } from "../components/DeviceList.tsx";
import { useDeviceGroups } from "../hooks/useDeviceGroups.ts";
import { useDevices } from "../hooks/useDevices.ts";
import { useSubscription } from "../hooks/useSubscription.ts";

export function Dashboard() {
	const { client } = useOutletContext<AppOutletContext>();
	const { data, isLoading, error, lastUpdated, refresh } = useDevices(client);
	const { groups, createGroup, deleteGroup } = useDeviceGroups(client);
	const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

	const filteredData = useMemo(() => {
		if (!activeGroupId) return data;
		const group = groups.find((g) => g.id === activeGroupId);
		if (!group) return data;
		const deviceSet = new Set(group.devices);
		return data.filter((item) => deviceSet.has(item.device.serial));
	}, [data, groups, activeGroupId]);

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
			<DeviceList
				data={filteredData}
				isLoading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
				onRefresh={refresh}
				client={client}
			/>
		</div>
	);
}
