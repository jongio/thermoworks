// Pure, dependency-free contract shared by the extension host (chart-panel.ts) and the
// React webview (webview/). This module MUST NOT import vscode, node, react, or the SDK so
// it can be bundled into the webview and unit-tested in the extension test suite.

/** A single time/value point. `t` is epoch milliseconds. */
export interface ChartPoint {
	t: number;
	y: number;
}

/** One labelled data series (a channel, or the full-session history line). */
export interface ChartSeries {
	id: string;
	label: string;
	color: string;
	units: string;
	points: ChartPoint[];
}

/** Alarm threshold reference lines. */
export interface ChartThresholds {
	high: number | null;
	low: number | null;
}

/** Where the chart data originated. */
export type ChartSource = "history" | "archive";

/** Full payload sent from the extension host to the webview. */
export interface ChartPayload {
	deviceLabel: string;
	units: string;
	source: ChartSource;
	series: ChartSeries[];
	thresholds: ChartThresholds;
}

/** Messages sent from the extension host to the webview. */
export type ChartInbound =
	| { type: "chart-data"; payload: ChartPayload }
	| { type: "live-point"; seriesId: string; point: ChartPoint }
	| { type: "live-status"; streaming: boolean }
	| { type: "error"; message: string };

/** Messages sent from the webview to the extension host. */
export type ChartOutbound = { type: "ready" } | { type: "refresh" };

/** A recharts-friendly row: time plus one numeric key per series id. */
export type ChartRow = { t: number } & Record<string, number>;

/** Maximum points rendered before downsampling kicks in. */
export const MAX_VISIBLE_POINTS = 500;

/** Merge series into time-aligned rows for recharts, sorted ascending by time. */
export function seriesToRows(series: ChartSeries[]): ChartRow[] {
	const byTime = new Map<number, ChartRow>();
	for (const s of series) {
		for (const p of s.points) {
			if (!Number.isFinite(p.t) || !Number.isFinite(p.y)) continue;
			const existing = byTime.get(p.t);
			if (existing) {
				existing[s.id] = p.y;
			} else {
				byTime.set(p.t, { t: p.t, [s.id]: p.y });
			}
		}
	}
	return Array.from(byTime.values()).sort((a, b) => a.t - b.t);
}

/**
 * Append a live point for a series, keeping rows sorted and deduplicated by time.
 * Returns a new array (does not mutate the input).
 */
export function appendLivePoint(rows: ChartRow[], seriesId: string, point: ChartPoint): ChartRow[] {
	if (!Number.isFinite(point.t) || !Number.isFinite(point.y)) return rows;

	// Fast path: most live points append to the end (monotonically increasing time)
	const lastRow = rows.length > 0 ? rows[rows.length - 1] : undefined;
	if (lastRow && point.t === lastRow.t) {
		const next = rows.slice();
		next[rows.length - 1] = { ...lastRow, [seriesId]: point.y };
		return next;
	}
	if (!lastRow || point.t > lastRow.t) {
		return rows.concat({ t: point.t, [seriesId]: point.y });
	}

	// Slow path: out-of-order point (rare)
	const existingIndex = rows.findIndex((r) => r.t === point.t);
	if (existingIndex >= 0) {
		const next = rows.slice();
		next[existingIndex] = { ...next[existingIndex], t: point.t, [seriesId]: point.y };
		return next;
	}

	const row: ChartRow = { t: point.t, [seriesId]: point.y };
	const next = rows.concat(row);
	next.sort((a, b) => a.t - b.t);
	return next;
}

/** Find the first numeric series key in a set of rows (the value dimension for LTTB). */
function primaryKey(rows: ChartRow[]): string | null {
	for (const row of rows) {
		for (const key of Object.keys(row)) {
			if (key !== "t" && Number.isFinite(row[key])) return key;
		}
	}
	return null;
}

/**
 * Downsample rows using Largest-Triangle-Three-Buckets, preserving visual shape.
 * The first numeric series key drives bucket selection; full rows are returned intact.
 */
export function downsampleRows(rows: ChartRow[], targetPoints: number): ChartRow[] {
	if (targetPoints <= 0) return [];
	if (rows.length <= targetPoints || targetPoints < 3) return rows;

	const key = primaryKey(rows);
	if (!key) return rows;

	const valueAt = (i: number): number => rows[i]?.[key] ?? 0;
	const timeAt = (i: number): number => rows[i]?.t ?? 0;

	const sampled: ChartRow[] = [];
	const every = (rows.length - 2) / (targetPoints - 2);

	let selectedIndex = 0;
	const first = rows[0];
	if (first) sampled.push(first);

	for (let bucket = 0; bucket < targetPoints - 2; bucket++) {
		const avgRangeStart = Math.floor((bucket + 1) * every) + 1;
		const avgRangeEnd = Math.min(Math.floor((bucket + 2) * every) + 1, rows.length);
		const avgRangeLength = Math.max(avgRangeEnd - avgRangeStart, 1);

		let avgX = 0;
		let avgY = 0;
		for (let i = avgRangeStart; i < avgRangeEnd; i++) {
			avgX += timeAt(i);
			avgY += valueAt(i);
		}
		avgX /= avgRangeLength;
		avgY /= avgRangeLength;

		const rangeStart = Math.floor(bucket * every) + 1;
		const rangeEnd = Math.min(Math.floor((bucket + 1) * every) + 1, rows.length - 1);
		const pointAX = timeAt(selectedIndex);
		const pointAY = valueAt(selectedIndex);

		let maxArea = -1;
		let maxAreaIndex = Math.min(rangeStart, rows.length - 2);
		for (let i = rangeStart; i < rangeEnd; i++) {
			const area = Math.abs(
				(pointAX - avgX) * (valueAt(i) - pointAY) - (pointAX - timeAt(i)) * (avgY - pointAY),
			);
			if (area > maxArea) {
				maxArea = area;
				maxAreaIndex = i;
			}
		}

		const chosen = rows[maxAreaIndex];
		if (chosen) sampled.push(chosen);
		selectedIndex = maxAreaIndex;
	}

	const last = rows[rows.length - 1];
	if (last) sampled.push(last);
	return sampled;
}
