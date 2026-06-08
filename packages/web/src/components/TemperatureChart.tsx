import { RotateCcw } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	Brush,
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ReferenceArea,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { ArchiveChannel } from "thermoworks-sdk";
import { useTemperatureUnit } from "../hooks/useTemperatureUnit.ts";
import type { ChartDataPoint } from "../lib/export.ts";
import { ChartExport } from "./ChartExport.tsx";

export interface TemperatureChartProps {
	/** Primary session channels. */
	channels: ArchiveChannel[];
	/** Additional sessions to overlay (each entry is one session's channels). */
	overlayArchives?: ArchiveChannel[][];
}

/** Default channel colors when the API doesn't provide one. */
const FALLBACK_COLORS = [
	"#ef4444", // red
	"#3b82f6", // blue
	"#22c55e", // green
	"#f59e0b", // amber
	"#8b5cf6", // violet
	"#ec4899", // pink
	"#06b6d4", // cyan
	"#f97316", // orange
	"#14b8a6", // teal
];

/** Line dash patterns for overlay sessions. */
const OVERLAY_DASH_PATTERNS = ["8 4", "4 4", "2 4", "8 2 2 2"];

interface ThresholdLine {
	value: number;
	type: "high" | "low";
	label: string;
}

interface ZoomState {
	left: number | null;
	right: number | null;
}

function formatTime(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function formatTooltipTime(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

/**
 * Temperature history chart with zoom, pan (brush), and export capabilities.
 * Renders a line per channel with alarm threshold reference lines.
 * Supports overlaying multiple sessions for comparison.
 */
export function TemperatureChart({ channels, overlayArchives = [] }: TemperatureChartProps) {
	const { unit, convert } = useTemperatureUnit();
	const chartContainerRef = useRef<HTMLDivElement>(null);

	// Zoom via reference area selection
	const [zoomDomain, setZoomDomain] = useState<{ left: number; right: number } | null>(null);
	const [selecting, setSelecting] = useState<ZoomState>({ left: null, right: null });

	// Session visibility toggles
	const [visibleOverlays, setVisibleOverlays] = useState<Set<number>>(() => new Set());

	const enabledChannels = useMemo(
		() => channels.filter((ch) => ch.enabled !== false && ch.recentReadings.length > 0),
		[channels],
	);

	const { data, thresholds } = useMemo(() => {
		const timeMap = new Map<number, ChartDataPoint>();

		// Primary session channels
		for (let i = 0; i < enabledChannels.length; i++) {
			const ch = enabledChannels[i];
			if (!ch) continue;
			const key = `ch_${ch.number ?? i}`;
			const sourceUnit = ch.units ?? "F";

			for (const reading of ch.recentReadings) {
				const time = reading.timestamp.getTime();
				const convertedValue = convert(reading.value, sourceUnit);
				const existing = timeMap.get(time);
				if (existing) {
					existing[key] = convertedValue;
				} else {
					timeMap.set(time, { time, [key]: convertedValue });
				}
			}
		}

		// Overlay session channels
		for (const sessionIdx of visibleOverlays) {
			const sessionChannels = overlayArchives[sessionIdx];
			if (!sessionChannels) continue;

			for (let i = 0; i < sessionChannels.length; i++) {
				const ch = sessionChannels[i];
				if (!ch || ch.enabled === false || ch.recentReadings.length === 0) continue;
				const key = `s${sessionIdx}_ch_${ch.number ?? i}`;
				const sourceUnit = ch.units ?? "F";

				for (const reading of ch.recentReadings) {
					const time = reading.timestamp.getTime();
					const convertedValue = convert(reading.value, sourceUnit);
					const existing = timeMap.get(time);
					if (existing) {
						existing[key] = convertedValue;
					} else {
						timeMap.set(time, { time, [key]: convertedValue });
					}
				}
			}
		}

		const sorted = Array.from(timeMap.values()).sort((a, b) => a.time - b.time);

		// Collect alarm thresholds
		const thresholdLines: ThresholdLine[] = [];
		for (const ch of enabledChannels) {
			const label = ch.label ?? `Ch ${ch.number ?? "?"}`;
			const sourceUnit = ch.units ?? "F";
			if (ch.alarmHigh?.enabled && ch.alarmHigh.value != null) {
				thresholdLines.push({
					value: convert(ch.alarmHigh.value, sourceUnit),
					type: "high",
					label: `${label} high`,
				});
			}
			if (ch.alarmLow?.enabled && ch.alarmLow.value != null) {
				thresholdLines.push({
					value: convert(ch.alarmLow.value, sourceUnit),
					type: "low",
					label: `${label} low`,
				});
			}
		}

		return { data: sorted, thresholds: thresholdLines };
	}, [enabledChannels, overlayArchives, visibleOverlays, convert]);

	// Compute the displayed data slice based on zoom domain
	const displayData = useMemo(() => {
		if (!zoomDomain) return data;
		return data.filter((d) => d.time >= zoomDomain.left && d.time <= zoomDomain.right);
	}, [data, zoomDomain]);

	const handleMouseDown = useCallback((e: { activeLabel?: string | number }) => {
		if (e.activeLabel != null) {
			setSelecting({ left: Number(e.activeLabel), right: null });
		}
	}, []);

	const handleMouseMove = useCallback(
		(e: { activeLabel?: string | number }) => {
			if (selecting.left != null && e.activeLabel != null) {
				setSelecting((prev) => ({ ...prev, right: Number(e.activeLabel) }));
			}
		},
		[selecting.left],
	);

	const handleMouseUp = useCallback(() => {
		if (selecting.left != null && selecting.right != null) {
			const left = Math.min(selecting.left, selecting.right);
			const right = Math.max(selecting.left, selecting.right);
			if (right - left > 0) {
				setZoomDomain({ left, right });
			}
		}
		setSelecting({ left: null, right: null });
	}, [selecting]);

	const handleResetZoom = useCallback(() => {
		setZoomDomain(null);
	}, []);

	const toggleOverlay = useCallback((sessionIdx: number) => {
		setVisibleOverlays((prev) => {
			const next = new Set(prev);
			if (next.has(sessionIdx)) {
				next.delete(sessionIdx);
			} else {
				next.add(sessionIdx);
			}
			return next;
		});
	}, []);

	if (enabledChannels.length === 0 || data.length === 0) {
		return (
			<div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
				No temperature history available
			</div>
		);
	}

	const isZoomed = zoomDomain !== null;

	return (
		<div className="space-y-2">
			{/* Toolbar: zoom reset, session selector, export */}
			<div className="flex items-center justify-between gap-2 flex-wrap">
				<div className="flex items-center gap-2">
					{isZoomed && (
						<button
							type="button"
							onClick={handleResetZoom}
							className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
							title="Reset zoom"
							data-testid="reset-zoom"
						>
							<RotateCcw size={14} />
							<span>Reset zoom</span>
						</button>
					)}
				</div>

				<div className="flex items-center gap-2">
					{/* Session overlay selector */}
					{overlayArchives.length > 0 && (
						<div className="flex items-center gap-1 text-xs">
							<span className="text-muted-foreground">Sessions:</span>
							{overlayArchives.map((_, idx) => (
								<label
									key={idx}
									className="inline-flex items-center gap-0.5 cursor-pointer"
								>
									<input
										type="checkbox"
										checked={visibleOverlays.has(idx)}
										onChange={() => toggleOverlay(idx)}
										className="rounded border-border"
									/>
									<span className="text-muted-foreground">#{idx + 1}</span>
								</label>
							))}
						</div>
					)}

					<ChartExport
						chartRef={chartContainerRef}
						data={displayData}
						filename="temperature-data"
					/>
				</div>
			</div>

			{/* Chart */}
			<div className="w-full h-64 sm:h-72" ref={chartContainerRef}>
				<ResponsiveContainer width="100%" height="100%">
					<LineChart
						data={displayData}
						margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
						onMouseDown={handleMouseDown}
						onMouseMove={handleMouseMove}
						onMouseUp={handleMouseUp}
					>
						<CartesianGrid strokeDasharray="3 3" className="stroke-border" opacity={0.5} />
						<XAxis
							dataKey="time"
							type="number"
							domain={["dataMin", "dataMax"]}
							tickFormatter={formatTime}
							className="text-xs fill-muted-foreground"
							tick={{ fontSize: 11 }}
							stroke="currentColor"
							opacity={0.4}
						/>
						<YAxis
							className="text-xs fill-muted-foreground"
							tick={{ fontSize: 11 }}
							stroke="currentColor"
							opacity={0.4}
							unit={`°${unit}`}
						/>
						<Tooltip
							labelFormatter={(label) => formatTooltipTime(Number(label))}
							contentStyle={{
								backgroundColor: "var(--color-card, #fff)",
								borderColor: "var(--color-border, #e5e5e5)",
								borderRadius: "0.375rem",
								fontSize: "0.75rem",
							}}
							formatter={(value) => [`${(value as number).toFixed(1)}°${unit}`, undefined]}
						/>
						<Legend wrapperStyle={{ fontSize: "0.75rem", paddingTop: "0.5rem" }} />

						{/* Alarm threshold reference lines */}
						{thresholds.map((threshold) => (
							<ReferenceLine
								key={`${threshold.type}-${threshold.value}-${threshold.label}`}
								y={threshold.value}
								stroke={threshold.type === "high" ? "#ef4444" : "#3b82f6"}
								strokeDasharray="4 4"
								strokeWidth={1.5}
								label={{
									value: threshold.label,
									position: "right",
									fontSize: 10,
									fill: threshold.type === "high" ? "#ef4444" : "#3b82f6",
								}}
							/>
						))}

						{/* Primary session channel lines */}
						{enabledChannels.map((ch, idx) => {
							const key = `ch_${ch.number ?? idx}`;
							const color = ch.color ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length] ?? "#6b7280";
							const name = ch.label ?? `Ch ${ch.number ?? idx + 1}`;

							return (
								<Line
									key={key}
									type="monotone"
									dataKey={key}
									name={name}
									stroke={color}
									strokeWidth={2}
									dot={false}
									activeDot={{ r: 3, strokeWidth: 1 }}
									connectNulls
								/>
							);
						})}

						{/* Overlay session lines */}
						{Array.from(visibleOverlays).flatMap((sessionIdx) => {
							const sessionChannels = overlayArchives[sessionIdx];
							if (!sessionChannels) return [];
							const dashPattern = OVERLAY_DASH_PATTERNS[sessionIdx % OVERLAY_DASH_PATTERNS.length] ?? "4 4";

							return sessionChannels
								.filter((ch) => ch.enabled !== false && ch.recentReadings.length > 0)
								.map((ch, chIdx) => {
									const key = `s${sessionIdx}_ch_${ch.number ?? chIdx}`;
									const color = ch.color ?? FALLBACK_COLORS[chIdx % FALLBACK_COLORS.length] ?? "#6b7280";
									const name = `S${sessionIdx + 1}: ${ch.label ?? `Ch ${ch.number ?? chIdx + 1}`}`;

									return (
										<Line
											key={key}
											type="monotone"
											dataKey={key}
											name={name}
											stroke={color}
											strokeWidth={1.5}
											strokeDasharray={dashPattern}
											dot={false}
											activeDot={{ r: 2, strokeWidth: 1 }}
											connectNulls
											opacity={0.7}
										/>
									);
								});
						})}

						{/* Zoom selection area */}
						{selecting.left != null && selecting.right != null && (
							<ReferenceArea
								x1={selecting.left}
								x2={selecting.right}
								strokeOpacity={0.3}
								fill="#3b82f6"
								fillOpacity={0.1}
							/>
						)}

						{/* Brush for panning when not zoomed */}
						{!isZoomed && (
							<Brush
								dataKey="time"
								height={24}
								stroke="#6b7280"
								tickFormatter={formatTime}
							/>
						)}
					</LineChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}

export default TemperatureChart;
