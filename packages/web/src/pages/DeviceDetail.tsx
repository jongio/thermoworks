import { ArrowLeft, Battery, Edit3, RotateCcw, Share2, Signal, Wifi } from "lucide-react";
import React, { Suspense } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { ChannelReading } from "../components/ChannelReading.tsx";
import { FanController } from "../components/FanController.tsx";
import { ChartSkeleton } from "../components/Skeleton.tsx";
import { useArchiveData } from "../hooks/useArchiveData.ts";
import { useDevice } from "../hooks/useDevice.ts";
import { cn } from "../lib/utils.ts";

const TemperatureChart = React.lazy(() => import("../components/TemperatureChart"));

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

export function DeviceDetail() {
	const { serial } = useParams<{ serial: string }>();
	const { client } = useOutletContext<AppOutletContext>();
	const { data, isLoading, error, refresh } = useDevice(client, serial ?? "");
	const {
		archives,
		isLoading: archiveLoading,
		error: archiveError,
	} = useArchiveData(client, serial ?? "", !!data);

	const archiveChannels = archives[0]?.channels ?? null;

	if (isLoading && !data) {
		return (
			<div className="space-y-6">
				<Link
					to="/"
					className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to devices
				</Link>
				<div className="animate-pulse space-y-4">
					<div className="h-8 w-48 bg-muted rounded" />
					<div className="h-4 w-32 bg-muted rounded" />
					<div className="grid gap-3 sm:grid-cols-2">
						{Array.from({ length: 4 }, (_, i) => (
							<div key={i} className="h-12 bg-muted rounded-md" />
						))}
					</div>
				</div>
			</div>
		);
	}

	if (error && !data) {
		return (
			<div className="space-y-6">
				<Link
					to="/"
					className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to devices
				</Link>
				<div
					className="rounded-md border border-destructive/50 bg-destructive/10 p-6 text-center"
					role="alert"
				>
					<p className="text-sm text-destructive font-medium">{error}</p>
					<p className="text-xs text-muted-foreground mt-1">
						Serial: <span className="font-mono">{serial}</span>
					</p>
				</div>
			</div>
		);
	}

	if (!data) return null;

	const { device, channels } = data;
	const name = device.label ?? device.serial;
	const status = statusIndicator(device.status);
	const enabledChannels = channels.filter((ch) => ch.enabled !== false);

	return (
		<div className="space-y-6">
			{/* Back navigation */}
			<Link
				to="/"
				className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
			>
				<ArrowLeft className="h-4 w-4" />
				Back to devices
			</Link>

			{/* Header */}
			<header className="space-y-2">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						<h1 className="text-2xl font-bold tracking-tight truncate">{name}</h1>
						<p className="text-sm text-muted-foreground mt-0.5">
							{device.type ?? device.device ?? "Device"} - <span className="font-mono">{device.serial}</span>
						</p>
					</div>
					<div
						className="flex items-center gap-1.5 shrink-0 mt-1"
						aria-label={`Status: ${status.label}`}
						role="status"
					>
						<span className={cn("h-2.5 w-2.5 rounded-full", status.color)} />
						<span className="text-sm font-medium">{status.label}</span>
					</div>
				</div>

				{/* Device info badges */}
				<div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
					{device.battery != null && (
						<span className="inline-flex items-center gap-1">
							<Battery className={cn("h-4 w-4", device.battery > 75 ? "text-green-500" : device.battery > 25 ? "text-yellow-500" : "text-red-500")} />
							{device.battery}%
						</span>
					)}
					{device.wifiStrength != null && (
						<span className="inline-flex items-center gap-1">
							<Wifi className="h-4 w-4" />
							{device.wifiStrength}dBm
						</span>
					)}
					{device.firmware && (
						<span className="inline-flex items-center gap-1">
							<Signal className="h-4 w-4" />
							v{device.firmware}
						</span>
					)}
				</div>
			</header>

			{/* Channels section */}
			<section aria-labelledby="channels-heading">
				<h2 id="channels-heading" className="text-lg font-semibold mb-3">
					Channels
				</h2>
				{enabledChannels.length > 0 ? (
					<div className="grid gap-3 sm:grid-cols-2">
						{enabledChannels.map((channel, idx) => (
							<ChannelReading key={channel.number ?? idx} channel={channel} />
						))}
					</div>
				) : (
					<p className="text-sm text-muted-foreground italic">No active channels</p>
				)}
			</section>

			{/* Fan controller section (Billows-compatible devices only) */}
			{device.fan && (
				<section aria-labelledby="fan-heading">
					<h2 id="fan-heading" className="text-lg font-semibold mb-3">
						Fan Controller
					</h2>
					<FanController client={client} serial={device.serial} fan={device.fan} onUpdated={refresh} />
				</section>
			)}

			{/* History section */}
			<section aria-labelledby="history-heading">
				<h2 id="history-heading" className="text-lg font-semibold mb-3">
					History
				</h2>
				{archiveLoading && <ChartSkeleton />}
				{archiveError && (
					<div className="text-sm text-destructive py-2">{archiveError}</div>
				)}
				{!archiveLoading && !archiveError && archiveChannels && (
					<Suspense fallback={<ChartSkeleton />}>
						<TemperatureChart channels={archiveChannels} />
					</Suspense>
				)}
				{!archiveLoading && !archiveError && !archiveChannels && (
					<div className="text-sm text-muted-foreground text-center py-8 border border-border rounded-md">
						No archive history found for this device
					</div>
				)}
			</section>

			{/* Quick actions */}
			<section aria-labelledby="actions-heading">
				<h2 id="actions-heading" className="text-lg font-semibold mb-3">
					Actions
				</h2>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						disabled
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md px-3 py-2",
							"text-sm border border-border",
							"disabled:opacity-50 disabled:cursor-not-allowed",
						)}
						title="Coming soon"
					>
						<Edit3 className="h-4 w-4" />
						Rename
					</button>
					<button
						type="button"
						disabled
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md px-3 py-2",
							"text-sm border border-border",
							"disabled:opacity-50 disabled:cursor-not-allowed",
						)}
						title="Coming soon"
					>
						<Share2 className="h-4 w-4" />
						Share
					</button>
					<button
						type="button"
						disabled
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md px-3 py-2",
							"text-sm border border-border",
							"disabled:opacity-50 disabled:cursor-not-allowed",
						)}
						title="Coming soon"
					>
						<RotateCcw className="h-4 w-4" />
						Reset
					</button>
				</div>
			</section>

			{/* Device settings */}
			<DeviceSettings
				client={client}
				serial={device.serial}
				timezone={null}
				preferredUnits={device.deviceDisplayUnits}
			/>
		</div>
	);
}
