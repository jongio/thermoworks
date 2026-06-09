import {
	Activity,
	AlertTriangle,
	Battery,
	Info,
	Loader2,
	Play,
	RefreshCw,
	Square,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import type { EventFilter } from "thermoworks-sdk";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { useDevices } from "../hooks/useDevices.ts";
import { useEvents } from "../hooks/useEvents.ts";
import { useSessionActivity } from "../hooks/useSessionActivity.ts";
import {
	type ActivityItem,
	mergeActivityItems,
	SESSION_ENDED_TYPE,
	SESSION_STARTED_TYPE,
	type SessionActivityItem,
	toEventActivityItems,
} from "../lib/activity.ts";
import { cn } from "../lib/utils.ts";

function getActivityIcon(item: ActivityItem) {
	if (item.kind === "session") {
		return item.phase === "start" ? Play : Square;
	}

	const lower = item.event.eventType.toLowerCase();
	if (lower.includes("battery")) return Battery;
	if (lower.includes("alarm")) return AlertTriangle;
	return Info;
}

function getActivityBadgeClasses(activityType: string): string {
	const lower = activityType.toLowerCase();
	if (lower === SESSION_STARTED_TYPE.toLowerCase()) {
		return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
	}
	if (lower === SESSION_ENDED_TYPE.toLowerCase()) {
		return "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30";
	}
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

function formatActivityTime(date: Date): string {
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

function formatDuration(start: Date, end: Date): string {
	const totalMinutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));
	if (totalMinutes < 60) return `${totalMinutes}m`;

	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function getActivityMessage(item: ActivityItem): string {
	if (item.kind === "event") {
		return (
			[item.event.valueBefore, item.event.valueAfter].filter(Boolean).join(" → ") ||
			item.event.eventType
		);
	}

	return getSessionMessage(item);
}

function getSessionMessage(item: SessionActivityItem): string {
	const label =
		item.archive.label?.trim() || item.archive.deviceLabel?.trim() || "monitoring session";

	if (item.phase === "start") {
		return `Started ${label}`;
	}

	if (item.archive.start) {
		return `Ended ${label} • ${formatDuration(item.archive.start, item.timestamp)}`;
	}

	return `Ended ${label}`;
}

function ActivityRow({
	item,
	deviceLabel,
	onSelect,
}: {
	item: ActivityItem;
	deviceLabel: string;
	onSelect: (deviceId: string) => void;
}) {
	const Icon = getActivityIcon(item);
	const badgeClasses = getActivityBadgeClasses(item.activityType);

	return (
		<li>
			<button
				type="button"
				onClick={() => onSelect(item.deviceId)}
				className={cn(
					"flex w-full items-start gap-3 rounded-md border border-border p-3 text-left",
					"transition-colors hover:bg-muted/50",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				)}
			>
				<Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span
							className={cn(
								"inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
								badgeClasses,
							)}
						>
							{item.activityType}
						</span>
						<span className="text-xs text-muted-foreground">{deviceLabel}</span>
						{item.kind === "event" && item.event.channelId && (
							<span className="text-xs text-muted-foreground">Ch {item.event.channelId}</span>
						)}
					</div>
					<p className="mt-1 text-sm text-foreground">{getActivityMessage(item)}</p>
				</div>
				<time
					className="shrink-0 text-xs text-muted-foreground"
					dateTime={item.timestamp.toISOString()}
				>
					{formatActivityTime(item.timestamp)}
				</time>
			</button>
		</li>
	);
}

export function Events() {
	const navigate = useNavigate();
	const { client } = useOutletContext<AppOutletContext>();
	const { data: devices } = useDevices(client);

	const [deviceFilter, setDeviceFilter] = useState("");
	const [typeFilter, setTypeFilter] = useState("");
	const loadMoreRef = useRef<HTMLDivElement | null>(null);

	const eventFilter: EventFilter | undefined = useMemo(() => {
		const nextFilter: EventFilter = { limit: 200 };
		if (deviceFilter) nextFilter.deviceId = deviceFilter;
		return nextFilter;
	}, [deviceFilter]);

	const {
		data: events,
		isLoading: isEventsLoading,
		isLoadingMore: isEventsLoadingMore,
		hasMore: hasMoreEvents,
		error: eventsError,
		lastUpdated: eventsLastUpdated,
		refresh: refreshEvents,
		loadMore: loadMoreEvents,
	} = useEvents(client, eventFilter);

	const selectedSerials = useMemo(() => {
		if (deviceFilter) return [deviceFilter];
		return devices.map((device) => device.device.serial);
	}, [deviceFilter, devices]);

	const {
		data: sessionActivity,
		isLoading: isSessionLoading,
		isLoadingMore: isSessionLoadingMore,
		hasMore: hasMoreSessions,
		error: sessionsError,
		lastUpdated: sessionsLastUpdated,
		refresh: refreshSessions,
		loadMore: loadMoreSessions,
	} = useSessionActivity(client, selectedSerials);

	const activityItems = useMemo(
		() => mergeActivityItems(toEventActivityItems(events), sessionActivity),
		[events, sessionActivity],
	);

	const filteredActivity = useMemo(() => {
		if (!typeFilter) return activityItems;
		return activityItems.filter((item) => item.activityType === typeFilter);
	}, [activityItems, typeFilter]);

	const typeOptions = useMemo(() => {
		const types = new Set<string>();
		for (const item of activityItems) {
			if (item.activityType) types.add(item.activityType);
		}
		return Array.from(types).sort();
	}, [activityItems]);

	const deviceLabelMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const device of devices) {
			map.set(device.device.serial, device.device.label ?? device.device.serial);
		}
		return map;
	}, [devices]);

	const error = useMemo(
		() => [eventsError, sessionsError].filter(Boolean).join(" "),
		[eventsError, sessionsError],
	);
	const isLoading = isEventsLoading || isSessionLoading;
	const isLoadingMore = isEventsLoadingMore || isSessionLoadingMore;
	const hasMore = hasMoreEvents || hasMoreSessions;
	const lastUpdated = useMemo(() => {
		if (!eventsLastUpdated) return sessionsLastUpdated;
		if (!sessionsLastUpdated) return eventsLastUpdated;
		return eventsLastUpdated > sessionsLastUpdated ? eventsLastUpdated : sessionsLastUpdated;
	}, [eventsLastUpdated, sessionsLastUpdated]);

	const refresh = useCallback(() => {
		void Promise.all([refreshEvents(), refreshSessions()]);
	}, [refreshEvents, refreshSessions]);

	const loadMore = useCallback(() => {
		if (isLoadingMore || !hasMore) return;

		const nextLoads: Array<Promise<void>> = [];
		if (hasMoreEvents) nextLoads.push(loadMoreEvents());
		if (hasMoreSessions) nextLoads.push(loadMoreSessions());
		if (nextLoads.length > 0) {
			void Promise.all(nextLoads);
		}
	}, [hasMore, hasMoreEvents, hasMoreSessions, isLoadingMore, loadMoreEvents, loadMoreSessions]);

	useEffect(() => {
		const target = loadMoreRef.current;
		if (!target || !hasMore || isLoadingMore || typeof IntersectionObserver === "undefined") {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					loadMore();
				}
			},
			{ rootMargin: "300px 0px" },
		);

		observer.observe(target);
		return () => observer.disconnect();
	}, [hasMore, isLoadingMore, loadMore]);

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Activity className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
					<h1 className="text-lg font-semibold tracking-tight">Activity</h1>
				</div>
				<button
					type="button"
					onClick={refresh}
					disabled={isLoading || isLoadingMore}
					title="Refresh now"
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5",
						"text-sm text-muted-foreground hover:text-foreground",
						"border border-border hover:bg-muted",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:pointer-events-none disabled:opacity-50",
					)}
				>
					<RefreshCw
						className={cn("h-3.5 w-3.5", (isLoading || isLoadingMore) && "animate-spin")}
					/>
					Refresh
				</button>
			</div>

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
						{devices.map((device) => (
							<option key={device.device.serial} value={device.device.serial}>
								{device.device.label ?? device.device.serial}
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

			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4" role="alert">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			)}

			{isLoading && filteredActivity.length === 0 && !error && (
				<div className="flex items-center justify-center py-12">
					<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					<span className="ml-2 text-sm text-muted-foreground">Loading activity...</span>
				</div>
			)}

			{!isLoading && filteredActivity.length === 0 && !error && (
				<div className="py-12 text-center">
					<Activity className="mx-auto h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
					<p className="mt-3 text-muted-foreground">No activity found.</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{deviceFilter || typeFilter
							? "Try adjusting your filters."
							: "Events, alarms, and session activity will appear here."}
					</p>
				</div>
			)}

			{filteredActivity.length > 0 && (
				<ul className="space-y-2" aria-label="Activity feed">
					{filteredActivity.map((item) => (
						<ActivityRow
							key={item.id}
							item={item}
							deviceLabel={deviceLabelMap.get(item.deviceId) ?? item.deviceId}
							onSelect={(deviceId) => navigate(`/device/${deviceId}`)}
						/>
					))}
				</ul>
			)}

			{(filteredActivity.length > 0 || hasMore) && (
				<div ref={loadMoreRef} className="flex justify-center py-2">
					{isLoadingMore && (
						<span className="text-sm text-muted-foreground">Loading more activity...</span>
					)}
				</div>
			)}
		</div>
	);
}
