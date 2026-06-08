import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { DeviceList } from "../components/DeviceList.tsx";
import { RefreshSelector } from "../components/RefreshSelector.tsx";
import { useDevices } from "../hooks/useDevices.ts";
import { useRefreshInterval } from "../hooks/useRefreshInterval.ts";

export function Dashboard() {
	const { client } = useOutletContext<AppOutletContext>();
	const { interval, updateInterval, options } = useRefreshInterval();
	const { data, isLoading, error, lastUpdated, refresh } = useDevices(client, interval);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-end">
				<RefreshSelector
					interval={interval}
					options={options}
					onIntervalChange={updateInterval}
				/>
			</div>
			<DeviceList
				data={data}
				isLoading={isLoading}
				error={error}
				lastUpdated={lastUpdated}
				onRefresh={refresh}
				client={client}
			/>
		</div>
	);
}
