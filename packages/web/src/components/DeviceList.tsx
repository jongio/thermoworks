import { RefreshCw } from "lucide-react";
import type { DeviceWithChannels, ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { DeviceCard } from "./DeviceCard.tsx";
import { DeviceListSkeleton } from "./Skeleton.tsx";

interface DeviceListProps {
	data: DeviceWithChannels[];
	isLoading: boolean;
	error: string | null;
	lastUpdated: Date | null;
	onRefresh: () => void;
	client: ThermoworksWebClient;
	/** When true, the empty state reflects a search filter with no matches. */
	isFiltering?: boolean;
}

export function DeviceList({
	data,
	isLoading,
	error,
	lastUpdated,
	onRefresh,
	client,
	isFiltering = false,
}: DeviceListProps) {
	return (
		<div className="space-y-4">
			{/* Status bar */}
			<div className="flex items-center justify-between">
				<div className="text-sm text-muted-foreground">
					{data.length > 0 && (
						<span>
							{data.length} device{data.length !== 1 ? "s" : ""}
						</span>
					)}
					{lastUpdated && (
						<span className="ml-2">- Updated {lastUpdated.toLocaleTimeString()}</span>
					)}
				</div>
				<button
					type="button"
					onClick={onRefresh}
					disabled={isLoading}
					title="Refresh now"
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5",
						"text-sm text-muted-foreground hover:text-foreground",
						"border border-border hover:bg-muted",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:opacity-50 disabled:pointer-events-none",
					)}
				>
					<RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
					Refresh
				</button>
			</div>

			{/* Error state */}
			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4" role="alert">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			)}

			{/* Loading state (initial) */}
			{isLoading && data.length === 0 && !error && <DeviceListSkeleton />}

			{/* Empty state */}
			{!isLoading && data.length === 0 && !error && (
				<div className="text-center py-12">
					<p className="text-muted-foreground">
						{isFiltering ? "No devices match your search." : "No devices found."}
					</p>
					{!isFiltering && (
						<p className="text-sm text-muted-foreground mt-1">
							Make sure your devices are registered in ThermoWorks Cloud.
						</p>
					)}
				</div>
			)}

			{/* Device grid */}
			{data.length > 0 && (
				<div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
					{data.map((item) => (
						<DeviceCard key={item.device.serial} item={item} client={client} />
					))}
				</div>
			)}
		</div>
	);
}
