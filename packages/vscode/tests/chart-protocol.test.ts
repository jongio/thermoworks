import { describe, expect, it } from "vitest";
import {
	appendLivePoint,
	type ChartRow,
	type ChartSeries,
	downsampleRows,
	seriesToRows,
} from "../src/chart-protocol";

function series(id: string, points: Array<[number, number]>): ChartSeries {
	return {
		id,
		label: id,
		color: "#fff",
		units: "F",
		points: points.map(([t, y]) => ({ t, y })),
	};
}

describe("seriesToRows", () => {
	it("returns empty for no series", () => {
		expect(seriesToRows([])).toEqual([]);
	});

	it("merges multiple series by timestamp", () => {
		const rows = seriesToRows([
			series("a", [
				[1000, 10],
				[2000, 20],
			]),
			series("b", [[1000, 5]]),
		]);
		expect(rows).toEqual([
			{ t: 1000, a: 10, b: 5 },
			{ t: 2000, a: 20 },
		]);
	});

	it("sorts rows ascending by time", () => {
		const rows = seriesToRows([
			series("a", [
				[3000, 30],
				[1000, 10],
				[2000, 20],
			]),
		]);
		expect(rows.map((r) => r.t)).toEqual([1000, 2000, 3000]);
	});

	it("skips non-finite points", () => {
		const rows = seriesToRows([
			series("a", [
				[Number.NaN, 10],
				[1000, Number.POSITIVE_INFINITY],
				[2000, 20],
			]),
		]);
		expect(rows).toEqual([{ t: 2000, a: 20 }]);
	});
});

describe("appendLivePoint", () => {
	it("appends a newer point to the end", () => {
		const rows: ChartRow[] = [{ t: 1000, a: 10 }];
		const next = appendLivePoint(rows, "a", { t: 2000, y: 20 });
		expect(next).toEqual([
			{ t: 1000, a: 10 },
			{ t: 2000, a: 20 },
		]);
	});

	it("merges a point with the same timestamp into the existing row", () => {
		const rows: ChartRow[] = [{ t: 1000, a: 10 }];
		const next = appendLivePoint(rows, "b", { t: 1000, y: 5 });
		expect(next).toEqual([{ t: 1000, a: 10, b: 5 }]);
	});

	it("inserts an out-of-order point and keeps rows sorted", () => {
		const rows: ChartRow[] = [
			{ t: 1000, a: 10 },
			{ t: 3000, a: 30 },
		];
		const next = appendLivePoint(rows, "a", { t: 2000, y: 20 });
		expect(next.map((r) => r.t)).toEqual([1000, 2000, 3000]);
	});

	it("does not mutate the input array", () => {
		const rows: ChartRow[] = [{ t: 1000, a: 10 }];
		appendLivePoint(rows, "a", { t: 2000, y: 20 });
		expect(rows).toHaveLength(1);
	});

	it("ignores non-finite points", () => {
		const rows: ChartRow[] = [{ t: 1000, a: 10 }];
		expect(appendLivePoint(rows, "a", { t: Number.NaN, y: 5 })).toBe(rows);
	});
});

describe("downsampleRows", () => {
	const many: ChartRow[] = Array.from({ length: 1000 }, (_, i) => ({ t: i, a: Math.sin(i / 10) }));

	it("returns the input unchanged when under target", () => {
		const rows: ChartRow[] = [
			{ t: 0, a: 1 },
			{ t: 1, a: 2 },
		];
		expect(downsampleRows(rows, 500)).toBe(rows);
	});

	it("reduces to the target point count", () => {
		const result = downsampleRows(many, 100);
		expect(result).toHaveLength(100);
	});

	it("preserves first and last points", () => {
		const result = downsampleRows(many, 100);
		expect(result[0]).toEqual(many[0]);
		expect(result[result.length - 1]).toEqual(many[many.length - 1]);
	});

	it("returns empty for non-positive target", () => {
		expect(downsampleRows(many, 0)).toEqual([]);
	});
});
