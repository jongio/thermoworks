import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { DeviceList } from "../components/DeviceList.tsx";
import { StreamingIndicator } from "../components/StreamingIndicator.tsx";
import { useDevices } from "../hooks/useDevices.ts";
import { useSubscription } from "../hooks/useSubscription.ts";

export function Dashboard() {
	const { client } = useOutletContext<AppOutletContext>();
	const subscription = useSubscription({ enabled: client.isAuthenticated });
	const { data, isLoading, error, lastUpdated, refresh } = useDevices(client, {
		pollingInterval: subscription.intervalMs,
	});

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Dashboard</h1>
				<StreamingIndicator
					mode={subscription.mode}
					isStreaming={subscription.isStreaming}
					onToggle={subscription.toggleMode}
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
