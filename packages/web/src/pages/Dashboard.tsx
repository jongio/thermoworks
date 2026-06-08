import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { DeviceList } from "../components/DeviceList.tsx";
import { useDevices } from "../hooks/useDevices.ts";

export function Dashboard() {
	const { client } = useOutletContext<AppOutletContext>();
	const { data, isLoading, error, lastUpdated, refresh } = useDevices(client);

	return (
		<DeviceList
			data={data}
			isLoading={isLoading}
			error={error}
			lastUpdated={lastUpdated}
			onRefresh={refresh}
			client={client}
		/>
	);
}
