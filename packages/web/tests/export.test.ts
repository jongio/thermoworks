import { describe, expect, it, vi } from "vitest";
import {
	type ExportColumn,
	buildExportFilename,
	toCSV,
	toJSON,
} from "../src/lib/export.ts";

const columns: ExportColumn[] = [
	{ key: "name", label: "Name" },
	{ key: "temp", label: "Temperature" },
	{ key: "unit", label: "Unit" },
];

describe("toCSV", () => {
	it("generates header row from column labels", () => {
		const result = toCSV([], columns);
		expect(result).toBe("Name,Temperature,Unit");
	});

	it("generates rows from data objects", () => {
		const data = [
			{ name: "Probe 1", temp: 72.5, unit: "F" },
			{ name: "Probe 2", temp: 100, unit: "C" },
		];
		const result = toCSV(data, columns);
		const lines = result.split("\n");
		expect(lines).toHaveLength(3);
		expect(lines[0]).toBe("Name,Temperature,Unit");
		expect(lines[1]).toBe("Probe 1,72.5,F");
		expect(lines[2]).toBe("Probe 2,100,C");
	});

	it("handles null and undefined values as empty strings", () => {
		const data = [{ name: null, temp: undefined, unit: "F" }];
		const result = toCSV(data as unknown as Record<string, unknown>[], columns);
		const lines = result.split("\n");
		expect(lines[1]).toBe(",,F");
	});

	it("escapes fields containing commas", () => {
		const data = [{ name: "Smoker, Grill", temp: 225, unit: "F" }];
		const result = toCSV(data, columns);
		const lines = result.split("\n");
		expect(lines[1]).toBe('"Smoker, Grill",225,F');
	});

	it("escapes fields containing double quotes", () => {
		const data = [{ name: 'The "Best" Probe', temp: 165, unit: "F" }];
		const result = toCSV(data, columns);
		const lines = result.split("\n");
		expect(lines[1]).toBe('"The ""Best"" Probe",165,F');
	});

	it("escapes fields containing newlines", () => {
		const data = [{ name: "Line1\nLine2", temp: 50, unit: "C" }];
		const result = toCSV(data, columns);
		const lines = result.split("\n");
		// The field with embedded newline is quoted, so splitting on \n gives 3 parts
		expect(result).toContain('"Line1\nLine2"');
	});

	it("escapes header labels with special characters", () => {
		const specialColumns: ExportColumn[] = [{ key: "x", label: 'Temp, "inner"' }];
		const data = [{ x: "val" }];
		const result = toCSV(data, specialColumns);
		const firstLine = result.split("\n")[0];
		expect(firstLine).toBe('"Temp, ""inner"""');
	});

	it("handles empty data array", () => {
		const result = toCSV([], columns);
		expect(result).toBe("Name,Temperature,Unit");
	});
});

describe("toJSON", () => {
	it("generates formatted JSON", () => {
		const data = [{ name: "Probe 1", temp: 72.5 }];
		const result = toJSON(data);
		expect(result).toBe(JSON.stringify(data, null, 2));
	});

	it("handles empty data array", () => {
		const result = toJSON([]);
		expect(result).toBe("[]");
	});

	it("handles nested objects", () => {
		const data = [{ device: { serial: "TW-001" }, temp: 100 }];
		const result = toJSON(data);
		const parsed = JSON.parse(result);
		expect(parsed[0].device.serial).toBe("TW-001");
	});
});

describe("buildExportFilename", () => {
	it("generates filename with csv extension", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-08T12:00:00Z"));

		const result = buildExportFilename("temperatures", "csv");
		expect(result).toBe("temperatures-2026-06-08.csv");

		vi.useRealTimers();
	});

	it("generates filename with json extension", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2025-12-25T00:00:00Z"));

		const result = buildExportFilename("archive-data", "json");
		expect(result).toBe("archive-data-2025-12-25.json");

		vi.useRealTimers();
	});

	it("preserves prefix with hyphens and underscores", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-15T08:30:00Z"));

		const result = buildExportFilename("my_device-readings", "csv");
		expect(result).toBe("my_device-readings-2026-01-15.csv");

		vi.useRealTimers();
	});
});
