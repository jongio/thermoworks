import { useMemo } from "react";
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { ArchiveChannel } from "thermoworks-sdk";
import { useTemperatureUnit } from "../hooks/useTemperatureUnit.ts";

interface TemperatureChartProps {
	channels: ArchiveChannel[];
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

interface ChartDataPoint {
	time: number;
	[channelKey: string]: number;
}

interface ThresholdLine {
	value: number;
	type: "high" | "low";
	label: string;
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
 * Temperature history chart using Recharts.
 * Renders a line per channel with alarm threshold reference lines.
 */
export function TemperatureChart({ channels }: TemperatureChartProps) {
	const { unit, convert } = useTemperatureUnit();

	const enabledChannels = useMemo(
		() => channels.filter((ch) => ch.enabled !== false && ch.recentReadings.length > 0),
		[channels],
	);

	const { data, thresholds } = useMemo(() => {
		// Build a time-indexed map for all readings across channels
		const timeMap = new Map<number, ChartDataPoint>();

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

		// Sort by time
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
	}, [enabledChannels, convert]);

	if (enabledChannels.length === 0 || data.length === 0) {
		return (
			<div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
				No temperature history available
			</div>
		);
	}

	return (
		<div className="w-full h-64 sm:h-72">
			<ResponsiveContainer width="100%" height="100%">
				<LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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

					{/* Channel lines */}
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
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}

export default TemperatureChart;
