import { useEffect, useMemo, useState } from "react";
import type { CookAnnotation } from "../lib/cook-report.ts";
import { cn } from "../lib/utils.ts";
import type { VisibleTimeRange } from "./TemperatureEventMarkers.tsx";

export interface AnnotationMarkerItem {
	readonly annotation: CookAnnotation;
	readonly xPercent: number;
}

interface TemperatureAnnotationMarkersProps {
	readonly annotations: readonly CookAnnotation[];
	readonly timeRange: VisibleTimeRange | null;
	readonly visible?: boolean;
}

function formatAnnotationTime(date: Date): string {
	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function getAnnotationMarkerItems(
	annotations: readonly CookAnnotation[],
	timeRange: VisibleTimeRange,
): AnnotationMarkerItem[] {
	const rangeWidth = Math.max(1, timeRange.end - timeRange.start);
	return annotations
		.flatMap((annotation) => {
			const timestamp = annotation.timestamp.getTime();
			if (timestamp < timeRange.start || timestamp > timeRange.end) return [];
			return [
				{
					annotation,
					xPercent: Math.min(98, Math.max(2, ((timestamp - timeRange.start) / rangeWidth) * 100)),
				},
			];
		})
		.sort((a, b) => a.annotation.timestamp.getTime() - b.annotation.timestamp.getTime());
}

export function AnnotationMarkerLegend() {
	return (
		<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
			<span>Annotations:</span>
			<span className="inline-flex items-center gap-1">
				<span className="h-2 w-2 rounded-full bg-purple-500" aria-hidden="true" />
				Cook note
			</span>
		</div>
	);
}

export function TemperatureAnnotationMarkers({
	annotations,
	timeRange,
	visible = true,
}: TemperatureAnnotationMarkersProps) {
	const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
	const markers = useMemo(
		() => (timeRange ? getAnnotationMarkerItems(annotations, timeRange) : []),
		[annotations, timeRange],
	);
	const activeMarker = markers.find((marker) => marker.annotation.id === activeMarkerId) ?? null;

	useEffect(() => {
		if (!activeMarker) setActiveMarkerId(null);
	}, [activeMarker]);

	if (!visible || !timeRange || annotations.length === 0) return null;

	return (
		<div
			className="pointer-events-none absolute inset-0 z-20"
			data-testid="annotation-marker-layer"
		>
			{markers.map((marker) => {
				const tooltipId = `annotation-marker-${marker.annotation.id}-details`;
				const ariaLabel = [
					`Annotation: ${marker.annotation.label}`,
					formatAnnotationTime(marker.annotation.timestamp),
					marker.annotation.note ? `note ${marker.annotation.note}` : null,
				]
					.filter(Boolean)
					.join(", ");

				return (
					<button
						key={marker.annotation.id}
						type="button"
						className={cn(
							"pointer-events-auto absolute h-4 w-4 -translate-x-1/2 rounded-full border-2 border-background bg-purple-500",
							"shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						style={{ left: `${marker.xPercent}%`, top: "6%" }}
						aria-label={ariaLabel}
						aria-describedby={activeMarkerId === marker.annotation.id ? tooltipId : undefined}
						data-testid="annotation-marker"
						onClick={() => setActiveMarkerId(marker.annotation.id)}
						onFocus={() => setActiveMarkerId(marker.annotation.id)}
						onMouseEnter={() => setActiveMarkerId(marker.annotation.id)}
					/>
				);
			})}
			{activeMarker && (
				<div
					id={`annotation-marker-${activeMarker.annotation.id}-details`}
					role="tooltip"
					className="pointer-events-auto absolute z-30 max-w-64 rounded-md border border-border bg-card p-2 text-xs shadow-md"
					style={{
						left: `${activeMarker.xPercent}%`,
						top: "calc(6% + 1.25rem)",
						transform: "translateX(-50%)",
					}}
				>
					<div className="font-medium text-foreground">{activeMarker.annotation.label}</div>
					<div className="text-muted-foreground">
						{formatAnnotationTime(activeMarker.annotation.timestamp)}
					</div>
					{activeMarker.annotation.note && (
						<div className="text-muted-foreground">{activeMarker.annotation.note}</div>
					)}
				</div>
			)}
		</div>
	);
}
