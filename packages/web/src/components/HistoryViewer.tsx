import { Calendar, Clock } from "lucide-react";
import React, { Suspense, useMemo, useState } from "react";
import type { ArchiveChannel, TemperatureReading } from "thermoworks-sdk";
import type { DeviceHistory, ThermoworksWebClient } from "../lib/api.ts";
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
	client?: ThermoworksWebClient | null;
	deviceId?: string | null;
}

/**
 * Historical data viewer with time range selection.
 * Transforms flat HistoricalReading[] (value/timestamp/units per reading)
 * into ArchiveChannel format for display via TemperatureChart.
 */
export function HistoryViewer({ history, client, deviceId }: HistoryViewerProps) {
	const [timeRange, setTimeRange] = useState<TimeRange>("1d");

	const { channels, pointCount, dateRange } = useMemo(() => {
		if (history.readings.length === 0) {
			return { channels: null, pointCount: 0, dateRange: null };
		}

		// Parse timestamps and filter invalid
		const parsed: Array<{ value: number; timestamp: Date; units: string }> = [];
		for (const r of history.readings) {
			const date = new Date(r.timestamp);
			if (!Number.isNaN(date.getTime())) {
				parsed.push({ value: r.value, timestamp: date, units: r.units });
			}
		}

		if (parsed.length === 0) {
			return { channels: null, pointCount: 0, dateRange: null };
		}

		// Sort ascending by timestamp
		parsed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

		// Apply time range filter
		const rangeOption = TIME_RANGES.find((r) => r.value === timeRange);
		let filtered = parsed;
		if (rangeOption?.ms != null) {
			const cutoff = Date.now() - rangeOption.ms;
			filtered = parsed.filter((r) => r.timestamp.getTime() >= cutoff);
		}

		if (filtered.length === 0) {
			return { channels: null, pointCount: 0, dateRange: null };
		}

		// Determine units from first reading
		const units = filtered[0]?.units ?? "F";
		// biome-ignore lint/style/noNonNullAssertion: guarded by length check above
		const lastReading = filtered[filtered.length - 1]!;

		// Build a single ArchiveChannel with all readings
		const recentReadings: TemperatureReading[] = filtered.map((r) => ({
			value: r.value,
			timestamp: r.timestamp,
			units: r.units,
		}));

		const channel: ArchiveChannel = {
			number: "1",
			label: "Temperature",
			units,
			value: lastReading.value,
			status: null,
			enabled: true,
			color: null,
			type: "temperature",
			alarmHigh: null,
			alarmLow: null,
			minimum: null,
			maximum: null,
			recentReadings,
		};

		// biome-ignore lint/style/noNonNullAssertion: guarded by length check above
		const first = filtered[0]!;

		return {
			channels: [channel],
			pointCount: filtered.length,
			dateRange: { start: first.timestamp, end: lastReading.timestamp },
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
									: "bg-muted text-foreground hover:bg-muted/80"
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
					<TemperatureChart channels={channels} client={client} deviceId={deviceId} />
				</Suspense>
			) : (
				<div className="text-sm text-muted-foreground text-center py-8 border border-border rounded-md">
					No data in selected time range
				</div>
			)}
		</div>
	);
}
