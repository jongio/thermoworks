import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { DeviceEvent, EventFilter } from "thermoworks-sdk";
import { Activity, AlertTriangle, Battery, Info, Loader2, RefreshCw } from "lucide-react";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { useDevices } from "../hooks/useDevices.ts";
import { useEvents } from "../hooks/useEvents.ts";
import { cn } from "../lib/utils.ts";

function getEventIcon(eventType: string) {
	const lower = eventType.toLowerCase();
	if (lower.includes("battery")) return Battery;
	if (lower.includes("alarm")) return AlertTriangle;
	return Info;
}

function getEventBadgeClasses(eventType: string): string {
	const lower = eventType.toLowerCase();
	if (lower.includes("alarm")) {
		return "bg-destructive/10 text-destructive border-destructive/30";
	}
	if (lower.includes("battery")) {
		return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
	}
	if (lower.includes("connection")) {
		return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30";
	}
	return "bg-muted text-muted-foreground border-border";
}

function formatEventTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMin = Math.floor(diffMs / 60_000);

	if (diffMin < 1) return "Just now";
	if (diffMin < 60) return `${diffMin}m ago`;

	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;

	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function EventRow({ event, deviceLabel }: { event: DeviceEvent; deviceLabel: string }) {
	const Icon = getEventIcon(event.eventType);
	const badgeClasses = getEventBadgeClasses(event.eventType);

	const message = [event.valueBefore, event.valueAfter]
		.filter(Boolean)
		.join(" → ") || event.eventType;

	return (
		<li className="flex items-start gap-3 rounded-md border border-border p-3">
			<Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2 flex-wrap">
					<span
						className={cn(
							"inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
							badgeClasses,
						)}
					>
						{event.eventType}
					</span>
					<span className="text-xs text-muted-foreground">{deviceLabel}</span>
					{event.channelId && (
						<span className="text-xs text-muted-foreground">Ch {event.channelId}</span>
					)}
				</div>
				<p className="mt-1 text-sm text-foreground">{message}</p>
			</div>
			<time
				className="shrink-0 text-xs text-muted-foreground"
				dateTime={event.eventTime.toISOString()}
			>
				{formatEventTime(event.eventTime)}
			</time>
		</li>
	);
}

export function Events() {
	const { client } = useOutletContext<AppOutletContext>();
	const { data: devices } = useDevices(client);

	const [deviceFilter, setDeviceFilter] = useState("");
	const [typeFilter, setTypeFilter] = useState("");

	// Only pass device filter to the API (server-side); type filter is client-side
	const filter: EventFilter | undefined = useMemo(() => {
		const f: EventFilter = { limit: 200 };
		if (deviceFilter) f.deviceId = deviceFilter;
		return f;
	}, [deviceFilter]);

	const { data: events, isLoading, error, lastUpdated, refresh } = useEvents(client, filter);

	// Client-side type filtering (avoids Firestore composite index requirement)
	const filteredEvents = useMemo(() => {
		if (!typeFilter) return events;
		return events.filter((e) =>
			e.eventType.toLowerCase().includes(typeFilter.toLowerCase()),
		);
	}, [events, typeFilter]);

	// Build dynamic type options from actual event data
	const typeOptions = useMemo(() => {
		const types = new Set<string>();
		for (const e of events) {
			if (e.eventType) types.add(e.eventType);
		}
		return Array.from(types).sort();
	}, [events]);

	const deviceLabelMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const d of devices) {
			map.set(d.device.serial, d.device.label ?? d.device.serial);
		}
		return map;
	}, [devices]);

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Activity className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
					<h1 className="text-lg font-semibold tracking-tight">Events</h1>
				</div>
				<button
					type="button"
					onClick={refresh}
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

			{/* Filters */}
			<div className="flex flex-wrap items-center gap-3">
				<label className="flex items-center gap-2 text-sm text-muted-foreground">
					<span>Device:</span>
					<select
						value={deviceFilter}
						onChange={(e) => setDeviceFilter(e.target.value)}
						className={cn(
							"rounded-md border border-border bg-background px-2 py-1 text-sm",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
					>
						<option value="">All devices</option>
						{devices.map((d) => (
							<option key={d.device.serial} value={d.device.serial}>
								{d.device.label ?? d.device.serial}
							</option>
						))}
					</select>
				</label>
				<label className="flex items-center gap-2 text-sm text-muted-foreground">
					<span>Type:</span>
					<select
						value={typeFilter}
						onChange={(e) => setTypeFilter(e.target.value)}
						className={cn(
							"rounded-md border border-border bg-background px-2 py-1 text-sm",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
					>
						<option value="">All types</option>
						{typeOptions.map((type) => (
							<option key={type} value={type}>
								{type}
							</option>
						))}
					</select>
				</label>
				{lastUpdated && (
					<span className="ml-auto text-xs text-muted-foreground">
						Updated {lastUpdated.toLocaleTimeString()}
					</span>
				)}
			</div>

			{/* Error */}
			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4" role="alert">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			)}

			{/* Loading */}
			{isLoading && filteredEvents.length === 0 && !error && (
				<div className="flex items-center justify-center py-12">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					<span className="ml-2 text-sm text-muted-foreground">Loading events...</span>
				</div>
			)}

			{/* Empty state */}
			{!isLoading && filteredEvents.length === 0 && !error && (
				<div className="text-center py-12">
					<Activity className="mx-auto h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
					<p className="mt-3 text-muted-foreground">No events found.</p>
					<p className="text-sm text-muted-foreground mt-1">
						{deviceFilter || typeFilter
							? "Try adjusting your filters."
							: "Alarms, alerts, and status changes will appear here."}
					</p>
				</div>
			)}

			{/* Event list */}
			{filteredEvents.length > 0 && (
				<ul className="space-y-2" aria-label="Event history">
					{filteredEvents.map((event) => (
						<EventRow
							key={event.id}
							event={event}
							deviceLabel={deviceLabelMap.get(event.deviceId) ?? event.deviceId}
						/>
					))}
				</ul>
			)}
		</div>
	);
}

