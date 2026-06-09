import { Calendar, Clock } from "lucide-react";
import React, { Suspense, useMemo, useState } from "react";
import type { ArchiveChannel, TemperatureReading } from "thermoworks-sdk";
import type { DeviceHistory } from "../lib/api.ts";
import { ChartSkeleton } from "./Skeleton.tsx";

const TemperatureChart = React.lazy(() => import("./TemperatureChart"));

// ─── Time range definitions ──────────────────────────────────────────────────

type TimeRange = "1h" | "6h" | "1d" | "1w" | "1m" | "all";

interface TimeRangeOption {
	value: TimeRange;
	label: string;
	ms: number | null; // null = show all
}

const TIME_RANGES: TimeRangeOption[] = [
	{ value: "1h", label: "1 Hour", ms: 60 * 60 * 1000 },
	{ value: "6h", label: "6 Hours", ms: 6 * 60 * 60 * 1000 },
	{ value: "1d", label: "1 Day", ms: 24 * 60 * 60 * 1000 },
	{ value: "1w", label: "1 Week", ms: 7 * 24 * 60 * 60 * 1000 },
	{ value: "1m", label: "1 Month", ms: 30 * 24 * 60 * 60 * 1000 },
	{ value: "all", label: "All", ms: null },
];

// ─── Component ───────────────────────────────────────────────────────────────

export interface HistoryViewerProps {
	history: DeviceHistory;
}

/**
 * Historical data viewer with time range selection.
 * Transforms flat HistoricalReading[] (per-timestamp, multi-channel)
 * into ArchiveChannel format for display via TemperatureChart.
 */
export function HistoryViewer({ history }: HistoryViewerProps) {
	const [timeRange, setTimeRange] = useState<TimeRange>("1d");

	const { channels, pointCount, dateRange } = useMemo(() => {
		if (history.readings.length === 0) {
			return { channels: null, pointCount: 0, dateRange: null };
		}

		// Sort by timestamp ascending
		// Filter out invalid timestamps and sort ascending
		const valid = history.readings.filter(
			(r) => r.timestamp instanceof Date && !Number.isNaN(r.timestamp.getTime()),
		);
		if (valid.length === 0) {
			return { channels: null, pointCount: 0, dateRange: null };
		}

		const sorted = [...valid].sort(
			(a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
		);

		// Apply time range filter
		const rangeOption = TIME_RANGES.find((r) => r.value === timeRange);
		let filtered = sorted;
		if (rangeOption?.ms != null) {
			const cutoff = Date.now() - rangeOption.ms;
			filtered = sorted.filter((r) => r.timestamp.getTime() >= cutoff);
		}

		if (filtered.length === 0) {
			return { channels: null, pointCount: 0, dateRange: null };
		}

		// Collect all channel keys across readings
		const channelKeys = new Set<string>();
		for (const reading of filtered) {
			for (const key of Object.keys(reading.channels)) {
				channelKeys.add(key);
			}
		}

		if (channelKeys.size === 0) {
			return { channels: null, pointCount: 0, dateRange: null };
		}

		// Build one ArchiveChannel per channel key
		const archiveChannels: ArchiveChannel[] = [];
		for (const key of channelKeys) {
			const readings: TemperatureReading[] = [];
			for (const r of filtered) {
				const value = r.channels[key];
				if (value != null) {
					readings.push({ value, timestamp: r.timestamp, units: "F" });
				}
			}
			if (readings.length > 0) {
				const lastReading = readings[readings.length - 1] as TemperatureReading;
				archiveChannels.push({
					number: key,
					label: `Channel ${key}`,
					units: "F",
					value: lastReading.value,
					status: null,
					enabled: true,
					color: null,
					type: "temperature",
					alarmHigh: null,
					alarmLow: null,
					minimum: null,
					maximum: null,
					recentReadings: readings,
				});
			}
		}

		if (archiveChannels.length === 0) {
			return { channels: null, pointCount: 0, dateRange: null };
		}

		const first = filtered[0] as { timestamp: Date };
		const last = filtered[filtered.length - 1] as { timestamp: Date };

		return {
			channels: archiveChannels,
			pointCount: filtered.length,
			dateRange: { start: first.timestamp, end: last.timestamp },
		};
	}, [history, timeRange]);

	if (history.readings.length === 0) {
		return (
			<div className="text-sm text-muted-foreground text-center py-8 border border-border rounded-md">
				No historical data available for this device
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{/* Time range selector and info */}
			<div className="flex items-center justify-between gap-2 flex-wrap">
				<fieldset
					className="flex items-center gap-1.5 border-0 p-0 m-0"
					aria-label="Time range selection"
				>
					{TIME_RANGES.map((option) => (
						<button
							key={option.value}
							type="button"
							onClick={() => setTimeRange(option.value)}
							className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
								timeRange === option.value
									? "bg-primary text-primary-foreground"
									: "bg-muted text-muted-foreground hover:bg-muted/80"
							}`}
							aria-pressed={timeRange === option.value}
						>
							{option.label}
						</button>
					))}
				</fieldset>

				{dateRange && (
					<div className="flex items-center gap-3 text-xs text-muted-foreground">
						<span className="inline-flex items-center gap-1">
							<Calendar className="h-3.5 w-3.5" />
							{dateRange.start.toLocaleDateString()} - {dateRange.end.toLocaleDateString()}
						</span>
						<span className="inline-flex items-center gap-1">
							<Clock className="h-3.5 w-3.5" />
							{pointCount.toLocaleString()} points
						</span>
					</div>
				)}
			</div>

			{/* Chart or empty state */}
			{channels ? (
				<Suspense fallback={<ChartSkeleton />}>
					<TemperatureChart channels={channels} />
				</Suspense>
			) : (
				<div className="text-sm text-muted-foreground text-center py-8 border border-border rounded-md">
					No data in selected time range
				</div>
			)}
		</div>
	);
}
