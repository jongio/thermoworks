import type { ChartDataPoint } from "./export.ts";

function getPrimaryMetricKey<T extends ChartDataPoint>(data: T[]): Exclude<keyof T, "time"> | null {
	for (const point of data) {
		for (const [key, value] of Object.entries(point)) {
			if (key !== "time" && typeof value === "number" && Number.isFinite(value)) {
				return key as Exclude<keyof T, "time">;
			}
		}
	}

	return null;
}

function buildMetricSeries<T extends ChartDataPoint>(
	data: T[],
	valueKey: Exclude<keyof T, "time">,
): number[] {
	const values: Array<number | null> = data.map((point) => {
		const value = point[valueKey];
		return typeof value === "number" && Number.isFinite(value) ? value : null;
	});

	let lastKnown: number | null = null;
	for (let i = 0; i < values.length; i++) {
		const currentValue = values[i] ?? null;
		if (currentValue != null) {
			lastKnown = currentValue;
		} else if (lastKnown != null) {
			values[i] = lastKnown;
		}
	}

	let nextKnown: number | null = null;
	for (let i = values.length - 1; i >= 0; i--) {
		const currentValue = values[i] ?? null;
		if (currentValue != null) {
			nextKnown = currentValue;
		} else if (nextKnown != null) {
			values[i] = nextKnown;
		}
	}

	return values.map((value) => value ?? 0);
}

/**
 * Downsample a time series using Largest-Triangle-Three-Buckets.
 * For multi-channel data, the first numeric key (excluding `time`) is used as the
 * value dimension for bucket selection while returning the original objects intact.
 */
export function downsampleLTTB<T extends ChartDataPoint>(data: T[], targetPoints: number): T[] {
	if (data.length === 0 || targetPoints <= 0) {
		return [];
	}

	if (targetPoints === 1) {
		return [data[0]].filter((point): point is T => point != null);
	}

	if (data.length <= targetPoints) {
		return data;
	}

	if (targetPoints === 2) {
		const firstPoint = data[0];
		const lastPoint = data[data.length - 1];
		return [firstPoint, lastPoint].filter((point): point is T => point != null);
	}

	const valueKey = getPrimaryMetricKey(data);
	if (!valueKey) {
		return data;
	}

	const metricValues = buildMetricSeries(data, valueKey);
	const sampled: T[] = [];
	const every = (data.length - 2) / (targetPoints - 2);

	let selectedIndex = 0;
	sampled.push(data[selectedIndex] as T);

	for (let bucket = 0; bucket < targetPoints - 2; bucket++) {
		const avgRangeStart = Math.floor((bucket + 1) * every) + 1;
		const avgRangeEnd = Math.min(Math.floor((bucket + 2) * every) + 1, data.length);

		let avgX = 0;
		let avgY = 0;
		const avgRangeLength = Math.max(avgRangeEnd - avgRangeStart, 1);

		for (let i = avgRangeStart; i < avgRangeEnd; i++) {
			avgX += data[i]?.time ?? 0;
			avgY += metricValues[i] ?? 0;
		}

		avgX /= avgRangeLength;
		avgY /= avgRangeLength;

		const rangeStart = Math.floor(bucket * every) + 1;
		const rangeEnd = Math.min(Math.floor((bucket + 1) * every) + 1, data.length - 1);
		const pointAX = data[selectedIndex]?.time ?? 0;
		const pointAY = metricValues[selectedIndex] ?? 0;

		let maxArea = -1;
		let maxAreaIndex = Math.min(rangeStart, data.length - 2);

		for (let i = rangeStart; i < rangeEnd; i++) {
			const point = data[i];
			if (!point) {
				continue;
			}

			const area = Math.abs(
				(pointAX - avgX) * ((metricValues[i] ?? 0) - pointAY) -
					(pointAX - point.time) * (avgY - pointAY),
			);

			if (area > maxArea) {
				maxArea = area;
				maxAreaIndex = i;
			}
		}

		sampled.push(data[maxAreaIndex] as T);
		selectedIndex = maxAreaIndex;
	}

	const lastPoint = data[data.length - 1];
	if (lastPoint) {
		sampled.push(lastPoint);
	}

	return sampled;
}
