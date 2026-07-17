import { useEffect, useMemo, useState } from "react";
import type { DeviceEvent, EventFilter } from "thermoworks-sdk";
import { useEvents } from "../hooks/useEvents.ts";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

export type EventMarkerCategory = "alarm" | "status" | "connection" | "fan";

export interface VisibleTimeRange {
	start: number;
	end: number;
}

interface EventMarkerStyle {
	label: string;
	color: string;
	top: string;
}

export const EVENT_MARKER_STYLES: Record<EventMarkerCategory, EventMarkerStyle> = {
	alarm: { label: "Alarm", color: "#ef4444", top: "18%" },
	status: { label: "Status", color: "#f59e0b", top: "31%" },
	connection: { label: "Connection", color: "#3b82f6", top: "44%" },
	fan: { label: "Fan", color: "#22c55e", top: "57%" },
};

export interface EventMarkerItem {
	event: DeviceEvent;
	category: EventMarkerCategory;
	xPercent: number;
	label: string;
	valueChange: string | null;
}

interface TemperatureEventMarkersProps {
	client: ThermoworksWebClient | null | undefined;
	deviceId: string | null | undefined;
	timeRange: VisibleTimeRange | null;
	visible: boolean;
}

function formatEventTime(date: Date): string {
	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function getValueChange(event: DeviceEvent): string | null {
	const values = [event.valueBefore, event.valueAfter]
		.map((value) => value?.trim())
		.filter((value): value is string => Boolean(value));
	return values.length > 0 ? values.join(" → ") : null;
}

export function getEventMarkerCategory(event: DeviceEvent): EventMarkerCategory | null {
	const type = event.eventType.toLowerCase();
	if (type.includes("alarm") || type.includes("alert")) return "alarm";
	if (
		type.includes("connection") ||
		type.includes("connected") ||
		type.includes("disconnected") ||
		type.includes("online") ||
		type.includes("offline")
	) {
		return "connection";
	}
	if (type.includes("fan")) return "fan";
	if (
		type.includes("status") ||
		type.includes("battery") ||
		type.includes("firmware") ||
		type.includes("probe")
	) {
		return "status";
	}
	return null;
}

export function getEventMarkerItems(
	events: ReadonlyArray<DeviceEvent>,
	timeRange: VisibleTimeRange,
): EventMarkerItem[] {
	const rangeWidth = Math.max(1, timeRange.end - timeRange.start);

	return events
		.flatMap((event) => {
			const timestamp = event.eventTime.getTime();
			const category = getEventMarkerCategory(event);
			if (!category || timestamp < timeRange.start || timestamp > timeRange.end) return [];

			const style = EVENT_MARKER_STYLES[category];
			return [
				{
					event,
					category,
					xPercent: Math.min(98, Math.max(2, ((timestamp - timeRange.start) / rangeWidth) * 100)),
					label: `${style.label} event: ${event.eventType}`,
					valueChange: getValueChange(event),
				},
			];
		})
		.sort((a, b) => a.event.eventTime.getTime() - b.event.eventTime.getTime());
}

export function EventMarkerLegend() {
	return (
		<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
			<span>Events:</span>
			{Object.entries(EVENT_MARKER_STYLES).map(([category, style]) => (
				<span key={category} className="inline-flex items-center gap-1">
					<span
						className="h-2 w-2 rounded-full"
						style={{ backgroundColor: style.color }}
						aria-hidden="true"
					/>
					{style.label}
				</span>
			))}
		</div>
	);
}

export function TemperatureEventMarkers({
	client,
	deviceId,
	timeRange,
	visible,
}: TemperatureEventMarkersProps) {
	const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
	const filter: EventFilter | undefined = useMemo(() => {
		if (!visible || !deviceId || !timeRange) return undefined;
		return {
			deviceId,
			startTime: new Date(timeRange.start),
			endTime: new Date(timeRange.end),
			limit: 500,
		};
	}, [deviceId, timeRange, visible]);
	const { data: events, error } = useEvents(visible && filter ? (client ?? null) : null, filter);
	const markers = useMemo(
		() => (timeRange ? getEventMarkerItems(events, timeRange) : []),
		[events, timeRange],
	);
	const activeMarker = markers.find((marker) => marker.event.id === activeMarkerId) ?? null;

	useEffect(() => {
		if (!activeMarker) setActiveMarkerId(null);
	}, [activeMarker]);

	if (!visible || !timeRange || !deviceId) return null;

	return (
		<div className="pointer-events-none absolute inset-0 z-10" data-testid="event-marker-layer">
			{markers.map((marker) => {
				const style = EVENT_MARKER_STYLES[marker.category];
				const tooltipId = `event-marker-${marker.event.id}-details`;
				const ariaLabel = [
					marker.label,
					formatEventTime(marker.event.eventTime),
					`severity ${marker.event.severity}`,
					marker.valueChange ? `value ${marker.valueChange}` : null,
				]
					.filter(Boolean)
					.join(", ");

				return (
					<button
						key={marker.event.id}
						type="button"
						className={cn(
							"pointer-events-auto absolute h-3 w-3 -translate-x-1/2 rounded-full border-2 border-background",
							"shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						style={{
							backgroundColor: style.color,
							left: `${marker.xPercent}%`,
							top: style.top,
						}}
						aria-label={ariaLabel}
						aria-describedby={activeMarkerId === marker.event.id ? tooltipId : undefined}
						data-testid={`event-marker-${marker.category}`}
						onClick={() => setActiveMarkerId(marker.event.id)}
						onFocus={() => setActiveMarkerId(marker.event.id)}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								setActiveMarkerId(marker.event.id);
							}
						}}
						onMouseEnter={() => setActiveMarkerId(marker.event.id)}
					/>
				);
			})}
			{activeMarker && (
				<div
					id={`event-marker-${activeMarker.event.id}-details`}
					role="tooltip"
					className="pointer-events-auto absolute z-20 max-w-64 rounded-md border border-border bg-card p-2 text-xs shadow-md"
					style={{
						left: `${activeMarker.xPercent}%`,
						top: `calc(${EVENT_MARKER_STYLES[activeMarker.category].top} + 1rem)`,
						transform: "translateX(-50%)",
					}}
				>
					<div className="font-medium text-foreground">{activeMarker.event.eventType}</div>
					<div className="text-muted-foreground">
						{formatEventTime(activeMarker.event.eventTime)}
					</div>
					<div className="text-muted-foreground">Severity {activeMarker.event.severity}</div>
					{activeMarker.valueChange && (
						<div className="text-muted-foreground">Value {activeMarker.valueChange}</div>
					)}
					{activeMarker.event.channelId && (
						<div className="text-muted-foreground">Channel {activeMarker.event.channelId}</div>
					)}
				</div>
			)}
			{error && (
				<div className="pointer-events-auto absolute right-2 top-2 rounded bg-card px-2 py-1 text-xs text-destructive shadow">
					{error}
				</div>
			)}
		</div>
	);
}
