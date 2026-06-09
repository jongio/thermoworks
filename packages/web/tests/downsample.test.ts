import { describe, expect, it } from "vitest";
import { downsampleLTTB } from "../src/lib/downsample.ts";
import type { ChartDataPoint } from "../src/lib/export.ts";

function makeSeries(length: number): ChartDataPoint[] {
	return Array.from({ length }, (_, index) => ({
		time: index * 1000,
		ch_1: Math.sin(index / 8) * 20 + 150,
	}));
}

describe("downsampleLTTB", () => {
	it("returns an empty array for empty input", () => {
		expect(downsampleLTTB([], 500)).toEqual([]);
	});

	it("returns the same single point when only one point is provided", () => {
		const point = [{ time: 1_000, ch_1: 123 }];

		expect(downsampleLTTB(point, 500)).toBe(point);
	});

	it("returns the original array when the dataset is already below the target", () => {
		const data = makeSeries(10);

		expect(downsampleLTTB(data, 20)).toBe(data);
	});

	it("returns the requested number of points for larger datasets", () => {
		const data = makeSeries(1_000);
		const sampled = downsampleLTTB(data, 50);

		expect(sampled).toHaveLength(50);
	});

	it("always preserves the first and last points", () => {
		const data = makeSeries(250);
		const sampled = downsampleLTTB(data, 25);

		expect(sampled[0]).toBe(data[0]);
		expect(sampled[sampled.length - 1]).toBe(data[data.length - 1]);
	});

	it("handles multi-key chart rows using the first numeric key", () => {
		const data: ChartDataPoint[] = [
			{ time: 0, ch_1: 100, ch_2: 200 },
			{ time: 1_000, ch_2: 198 },
			{ time: 2_000, ch_1: 140, ch_2: 190 },
			{ time: 3_000, ch_2: 185 },
			{ time: 4_000, ch_1: 110, ch_2: 195 },
			{ time: 5_000, ch_2: 205 },
			{ time: 6_000, ch_1: 160, ch_2: 210 },
		];

		const sampled = downsampleLTTB(data, 4);

		expect(sampled).toHaveLength(4);
		expect(sampled[0]).toBe(data[0]);
		expect(sampled[sampled.length - 1]).toBe(data[data.length - 1]);
		expect(sampled.every((point) => data.includes(point))).toBe(true);
	});
});
