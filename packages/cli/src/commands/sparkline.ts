import type { DeviceChannel, HistoricalReading } from "thermoworks-sdk";

const SPARKLINE_BARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"] as const;

type RecentReading = Pick<HistoricalReading, "value">;
type ChannelWithRecentReadings = DeviceChannel & {
	readonly recentReadings?: RecentReading[] | null;
};

function finiteValues(values: Array<number | null | undefined>): number[] {
	return values.filter(
		(value): value is number => typeof value === "number" && Number.isFinite(value),
	);
}

function takeRecentValues(values: number[], width: number): number[] {
	if (values.length <= width) return values;
	return values.slice(-width);
}

export function formatSparkline(values: Array<number | null | undefined>, width = 8): string {
	const recent = takeRecentValues(finiteValues(values), width);
	if (recent.length === 0) return "";

	const min = Math.min(...recent);
	const max = Math.max(...recent);
	if (min === max) return SPARKLINE_BARS[0].repeat(recent.length);

	return recent
		.map((value) => {
			const index = Math.round(((value - min) / (max - min)) * (SPARKLINE_BARS.length - 1));
			return SPARKLINE_BARS[index] ?? SPARKLINE_BARS[0];
		})
		.join("");
}

export function formatHistoryTrend(
	readings: HistoricalReading[],
	index: number,
	width = 8,
): string {
	return formatSparkline(
		readings.slice(Math.max(0, index - width + 1), index + 1).map((reading) => reading.value),
		width,
	);
}

export function formatChannelTrend(channel: DeviceChannel, width = 8): string | null {
	const recentReadings = (channel as ChannelWithRecentReadings).recentReadings;
	if (!recentReadings || recentReadings.length === 0) return null;

	const sparkline = formatSparkline(
		recentReadings.map((reading) => reading.value),
		width,
	);
	return sparkline ? `trend ${sparkline}` : null;
}
