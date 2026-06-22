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
import {
	type ChartRow,
	type ChartSeries,
	type ChartThresholds,
	downsampleRows,
	MAX_VISIBLE_POINTS,
	seriesToRows,
} from "../src/chart-protocol";

export interface ChartProps {
	series: ChartSeries[];
	/** Live-updated rows; when provided they supersede `series` for rendering. */
	liveRows?: ChartRow[] | null;
	thresholds: ChartThresholds;
	units: string;
}

function cssVar(name: string, fallback: string): string {
	if (typeof document === "undefined") return fallback;
	const value = getComputedStyle(document.body).getPropertyValue(name).trim();
	return value || fallback;
}

function formatTime(t: number): string {
	return new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatTooltipTime(t: number): string {
	return new Date(t).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

/** Temperature chart: one line per series, with alarm threshold reference lines. */
export function Chart({ series, liveRows, thresholds, units }: ChartProps) {
	const rows = useMemo(
		() => downsampleRows(liveRows ?? seriesToRows(series), MAX_VISIBLE_POINTS),
		[series, liveRows],
	);

	const textColor = cssVar("--vscode-editor-foreground", "#d4d4d4");
	const gridColor = cssVar("--vscode-editorWidget-border", "rgba(255,255,255,0.1)");

	if (rows.length === 0) {
		return <div className="tw-message">No temperature readings to plot.</div>;
	}

	return (
		<div className="tw-chart">
			<ResponsiveContainer width="100%" height="100%">
				<LineChart data={rows} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
					<CartesianGrid stroke={gridColor} strokeDasharray="3 3" opacity={0.5} />
					<XAxis
						dataKey="t"
						type="number"
						domain={["dataMin", "dataMax"]}
						tickFormatter={formatTime}
						tick={{ fontSize: 11, fill: textColor }}
						stroke={gridColor}
						minTickGap={32}
					/>
					<YAxis
						tick={{ fontSize: 11, fill: textColor }}
						stroke={gridColor}
						width={48}
						unit={`\u00B0${units}`}
						domain={["auto", "auto"]}
					/>
					<Tooltip
						labelFormatter={(label) => formatTooltipTime(Number(label))}
						formatter={(value, name) => [`${Math.round(Number(value))}\u00B0${units}`, name]}
						contentStyle={{
							background: "var(--vscode-editorHoverWidget-background, rgba(30,30,30,0.95))",
							border: "1px solid var(--vscode-editorHoverWidget-border, #454545)",
							borderRadius: 4,
							fontSize: 12,
							color: textColor,
						}}
					/>
					<Legend wrapperStyle={{ fontSize: 12, color: textColor }} />

					{thresholds.high != null && (
						<ReferenceLine
							y={thresholds.high}
							stroke="#ff5252"
							strokeDasharray="6 3"
							strokeWidth={1.5}
							label={{ value: "High", position: "right", fill: "#ff5252", fontSize: 10 }}
						/>
					)}
					{thresholds.low != null && (
						<ReferenceLine
							y={thresholds.low}
							stroke="#448aff"
							strokeDasharray="6 3"
							strokeWidth={1.5}
							label={{ value: "Low", position: "right", fill: "#448aff", fontSize: 10 }}
						/>
					)}

					{series.map((s) => (
						<Line
							key={s.id}
							type="monotone"
							dataKey={s.id}
							name={s.label}
							stroke={s.color}
							strokeWidth={2}
							dot={rows.length <= 60 ? { r: 2, fill: s.color } : false}
							activeDot={{ r: 4 }}
							isAnimationActive={false}
							connectNulls
						/>
					))}
				</LineChart>
			</ResponsiveContainer>
		</div>
	);
}
