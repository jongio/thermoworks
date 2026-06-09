import { Battery, ChevronDown, ChevronUp, Thermometer, Wifi } from "lucide-react";
import React, { Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { useArchiveData } from "../hooks/useArchiveData.ts";
import type { DeviceWithChannels, ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { ChannelReading } from "./ChannelReading.tsx";
import { FirmwareStatus } from "./FirmwareStatus.tsx";
import { SessionControls } from "./SessionControls.tsx";
import { ShareButton } from "./ShareButton.tsx";
import { ChartSkeleton } from "./Skeleton.tsx";

const TemperatureChart = React.lazy(() => import("./TemperatureChart"));

interface DeviceCardProps {
	item: DeviceWithChannels;
	client: ThermoworksWebClient;
}

function statusIndicator(status: string | null): { color: string; label: string } {
	switch (status) {
		case "online":
			return { color: "bg-green-500", label: "Online" };
		case "offline":
			return { color: "bg-neutral-400", label: "Offline" };
		default:
			return { color: "bg-yellow-500", label: status ?? "Unknown" };
	}
}

function batteryIcon(level: number | null): string {
	if (level == null) return "";
	if (level > 75) return "text-green-500";
	if (level > 25) return "text-yellow-500";
	return "text-red-500";
}

export function DeviceCard({ item, client }: DeviceCardProps) {
	const { device, channels } = item;
	const name = device.label ?? device.serial;
	const status = statusIndicator(device.status);
	const enabledChannels = channels.filter((ch) => ch.enabled !== false);
	const [showChart, setShowChart] = useState(false);
	const {
		archives,
		isLoading: archiveLoading,
		error: archiveError,
	} = useArchiveData(client, device.serial, showChart);

	const archiveChannels = archives[0]?.channels ?? null;

	return (
		<article
			className={cn(
				"rounded-lg border border-border bg-card p-4 shadow-sm",
				"transition-shadow hover:shadow-md",
			)}
		>
			{/* Header */}
			<div className="flex items-start justify-between gap-2 mb-3">
				<div className="min-w-0 flex-1">
					<h3 className="font-semibold truncate" title={name}>
						<Link
							to={`/device/${device.serial}`}
							className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
						>
							{name}
						</Link>
					</h3>
					<div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
						<Thermometer className="h-3 w-3 shrink-0" />
						<span className="truncate">{device.type ?? device.device ?? "Device"}</span>
						<span className="text-border">|</span>
						<span className="font-mono">{device.serial}</span>
					</div>
				</div>
				<div
					className="flex items-center gap-1.5 shrink-0"
					aria-label={`Status: ${status.label}`}
					role="status"
				>
					<ShareButton serial={device.serial} client={client} />
					<span className={cn("h-2 w-2 rounded-full", status.color)} title={status.label} />
					<span className="text-xs text-muted-foreground">{status.label}</span>
				</div>
			</div>

			{/* Device info badges */}
			<div className="flex flex-wrap gap-2 mb-3 text-xs text-muted-foreground">
				{device.battery != null && (
					<span className="inline-flex items-center gap-1">
						<Battery className={cn("h-3 w-3", batteryIcon(device.battery))} />
						{device.battery}%
					</span>
				)}
				{device.wifiStrength != null && (
					<span className="inline-flex items-center gap-1">
						<Wifi className="h-3 w-3" />
						{device.wifiStrength}dBm
					</span>
				)}
				{device.firmware && (
					<FirmwareStatus
						currentVersion={device.firmware}
						deviceType={device.type ?? device.device}
						client={client}
					/>
				)}
			</div>

			{/* Channel readings */}
			{enabledChannels.length > 0 ? (
				<div className="space-y-2">
					{enabledChannels.map((channel, idx) => (
						<ChannelReading key={channel.number ?? idx} channel={channel} />
					))}
				</div>
			) : (
				<p className="text-sm text-muted-foreground italic">No active channels</p>
			)}

			{/* Session controls */}
			<SessionControls
				client={client}
				serial={device.serial}
				sessionStart={device.sessionStart}
				sessionLabel={device.sessionLabel}
			/>

			{/* View details link */}
			<Link
				to={`/device/${device.serial}`}
				className={cn(
					"mt-3 w-full flex items-center justify-center rounded-md px-3 py-1.5",
					"text-xs text-muted-foreground hover:text-foreground",
					"hover:bg-muted transition-colors",
				)}
			>
				View details
			</Link>

			{/* History toggle button */}
			<button
				type="button"
				onClick={() => setShowChart((prev) => !prev)}
				className={cn(
					"mt-3 w-full flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5",
					"text-xs text-muted-foreground hover:text-foreground",
					"border border-border hover:bg-muted",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					"transition-colors",
				)}
			>
				{showChart ? (
					<>
						<ChevronUp className="h-3.5 w-3.5" />
						Hide History
					</>
				) : (
					<>
						<ChevronDown className="h-3.5 w-3.5" />
						Show History
					</>
				)}
			</button>

			{/* Chart panel */}
			{showChart && (
				<div className="mt-3 pt-3 border-t border-border">
					{archiveLoading && <ChartSkeleton />}
					{archiveError && <div className="text-xs text-destructive py-2">{archiveError}</div>}
					{!archiveLoading && !archiveError && archiveChannels && (
						<Suspense fallback={<ChartSkeleton />}>
							<TemperatureChart channels={archiveChannels} />
						</Suspense>
					)}
					{!archiveLoading && !archiveError && !archiveChannels && (
						<div className="text-xs text-muted-foreground text-center py-4">
							No temperature history available
						</div>
					)}
				</div>
			)}
		</article>
	);
}
