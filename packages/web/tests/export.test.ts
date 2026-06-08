import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type ChartDataPoint,
	type ExportColumn,
	buildExportFilename,
	downloadBlob,
	downloadCSV,
	downloadPNG,
	exportToCSV,
	exportToJSON,
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

describe("downloadBlob", () => {
	let mockClick: ReturnType<typeof vi.fn>;
	let mockCreateObjectURL: ReturnType<typeof vi.fn>;
	let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
	let createdAnchor: HTMLAnchorElement;

	beforeEach(() => {
		mockClick = vi.fn();
		mockCreateObjectURL = vi.fn(() => "blob:mock-url");
		mockRevokeObjectURL = vi.fn();

		vi.stubGlobal("URL", {
			createObjectURL: mockCreateObjectURL,
			revokeObjectURL: mockRevokeObjectURL,
		});

		createdAnchor = { click: mockClick, href: "", download: "" } as unknown as HTMLAnchorElement;
		vi.spyOn(document, "createElement").mockReturnValue(createdAnchor as unknown as HTMLElement);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("creates a blob and triggers download", () => {
		downloadBlob("hello,world", "test.csv", "text/csv");

		expect(mockCreateObjectURL).toHaveBeenCalledOnce();
		const blobArg = mockCreateObjectURL.mock.calls[0][0] as Blob;
		expect(blobArg).toBeInstanceOf(Blob);
		expect(blobArg.type).toBe("text/csv");
	});

	it("sets anchor href and download attributes", () => {
		downloadBlob("content", "file.json", "application/json");

		expect(createdAnchor.href).toBe("blob:mock-url");
		expect(createdAnchor.download).toBe("file.json");
	});

	it("clicks the anchor to initiate download", () => {
		downloadBlob("data", "output.txt", "text/plain");

		expect(mockClick).toHaveBeenCalledOnce();
	});

	it("revokes the object URL after download", () => {
		downloadBlob("data", "output.txt", "text/plain");

		expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
	});
});

describe("downloadCSV", () => {
	let mockClick: ReturnType<typeof vi.fn>;
	let mockCreateObjectURL: ReturnType<typeof vi.fn>;
	let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockClick = vi.fn();
		mockCreateObjectURL = vi.fn(() => "blob:csv-url");
		mockRevokeObjectURL = vi.fn();

		vi.stubGlobal("URL", {
			createObjectURL: mockCreateObjectURL,
			revokeObjectURL: mockRevokeObjectURL,
		});

		const anchor = { click: mockClick, href: "", download: "" };
		vi.spyOn(document, "createElement").mockReturnValue(anchor as unknown as HTMLElement);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("generates CSV from ChartDataPoint array and triggers download", () => {
		const data: ChartDataPoint[] = [
			{ time: 1000, probe1: 72.5, probe2: 68.0 },
			{ time: 2000, probe1: 73.0, probe2: 69.0 },
		];

		downloadCSV(data, "chart-data.csv");

		expect(mockCreateObjectURL).toHaveBeenCalledOnce();
		const blob = mockCreateObjectURL.mock.calls[0][0] as Blob;
		expect(blob.type).toBe("text/csv;charset=utf-8");
		expect(mockClick).toHaveBeenCalledOnce();
	});

	it("does nothing for empty data array", () => {
		downloadCSV([], "empty.csv");

		expect(mockCreateObjectURL).not.toHaveBeenCalled();
		expect(mockClick).not.toHaveBeenCalled();
	});

	it("handles sparse array where first element is undefined", () => {
		// Exercise the defensive `if (!firstRow)` guard (line 84)
		const sparse = new Array(1) as unknown as ChartDataPoint[];
		downloadCSV(sparse, "sparse.csv");

		expect(mockCreateObjectURL).not.toHaveBeenCalled();
	});

	it("includes all object keys as headers", async () => {
		const data: ChartDataPoint[] = [
			{ time: 500, channel_a: 100, channel_b: 200 },
		];

		downloadCSV(data, "multi-channel.csv");

		const blob = mockCreateObjectURL.mock.calls[0][0] as Blob;
		const text = await blob.text();
		const headerLine = text.split("\n")[0];
		expect(headerLine).toBe("time,channel_a,channel_b");
	});

	it("handles null/undefined values in data points", async () => {
		const data = [
			{ time: 100, probe1: 65, probe2: null },
		] as unknown as ChartDataPoint[];

		downloadCSV(data, "nulls.csv");

		const blob = mockCreateObjectURL.mock.calls[0][0] as Blob;
		const text = await blob.text();
		const dataLine = text.split("\n")[1];
		expect(dataLine).toBe("100,65,");
	});

	it("escapes special characters in values", async () => {
		const data = [
			{ time: 1, "name,with,commas": 42 },
		] as unknown as ChartDataPoint[];

		downloadCSV(data, "escaped.csv");

		const blob = mockCreateObjectURL.mock.calls[0][0] as Blob;
		const text = await blob.text();
		expect(text).toContain('"name,with,commas"');
	});
});

describe("exportToCSV", () => {
	let mockClick: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockClick = vi.fn();
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn(() => "blob:url"),
			revokeObjectURL: vi.fn(),
		});
		vi.spyOn(document, "createElement").mockReturnValue(
			{ click: mockClick, href: "", download: "" } as unknown as HTMLElement,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("exports structured data as CSV download", () => {
		const data = [{ name: "Probe 1", temp: 72.5, unit: "F" }];
		exportToCSV(data, columns, "temps.csv");

		expect(mockClick).toHaveBeenCalledOnce();
	});
});

describe("exportToJSON", () => {
	let mockClick: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockClick = vi.fn();
		vi.stubGlobal("URL", {
			createObjectURL: vi.fn(() => "blob:url"),
			revokeObjectURL: vi.fn(),
		});
		vi.spyOn(document, "createElement").mockReturnValue(
			{ click: mockClick, href: "", download: "" } as unknown as HTMLElement,
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("exports data as JSON download", () => {
		const data = [{ device: "TW-100", temp: 225 }];
		exportToJSON(data, "devices.json");

		expect(mockClick).toHaveBeenCalledOnce();
	});
});

describe("downloadPNG", () => {
	let mockClick: ReturnType<typeof vi.fn>;
	let mockCreateObjectURL: ReturnType<typeof vi.fn>;
	let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
	let mockToBlob: ReturnType<typeof vi.fn>;
	let mockGetContext: ReturnType<typeof vi.fn>;
	let imageInstance: { onload?: () => void; onerror?: () => void; crossOrigin: string; src: string };

	beforeEach(() => {
		mockClick = vi.fn();
		mockCreateObjectURL = vi.fn(() => "blob:svg-url");
		mockRevokeObjectURL = vi.fn();

		vi.stubGlobal("URL", {
			createObjectURL: mockCreateObjectURL,
			revokeObjectURL: mockRevokeObjectURL,
		});

		const mockCtx = {
			scale: vi.fn(),
			fillStyle: "",
			fillRect: vi.fn(),
			drawImage: vi.fn(),
		};
		mockGetContext = vi.fn(() => mockCtx);
		mockToBlob = vi.fn((cb: (blob: Blob | null) => void) => {
			cb(new Blob(["png-data"], { type: "image/png" }));
		});

		const realCreateElement = document.createElement.bind(document);
		vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
			if (tag === "canvas") {
				return { width: 0, height: 0, getContext: mockGetContext, toBlob: mockToBlob } as unknown as HTMLElement;
			}
			if (tag === "a") {
				return { click: mockClick, href: "", download: "" } as unknown as HTMLElement;
			}
			return realCreateElement(tag);
		});

		imageInstance = { crossOrigin: "", src: "" };
		vi.stubGlobal("Image", class MockImage {
			crossOrigin = "";
			naturalWidth = 800;
			naturalHeight = 600;
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			private _src = "";
			constructor() {
				imageInstance = this as unknown as typeof imageInstance;
				Object.defineProperty(this, "src", {
					set(value: string) {
						this._src = value;
						Promise.resolve().then(() => this.onload?.());
					},
					get() {
						return this._src;
					},
				});
			}
		});

		vi.stubGlobal("XMLSerializer", class MockXMLSerializer {
			serializeToString() {
				return '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
			}
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("does nothing if container has no SVG element", async () => {
		const container = document.createElement("div");
		await downloadPNG(container, "chart.png");

		expect(mockCreateObjectURL).not.toHaveBeenCalled();
	});

	it("serializes SVG and renders to canvas", async () => {
		const container = document.createElement("div");
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		container.appendChild(svg);

		await downloadPNG(container, "chart.png");

		// Should have created object URL for the SVG blob
		expect(mockCreateObjectURL).toHaveBeenCalled();
		// Should have gotten 2d context from canvas
		expect(mockGetContext).toHaveBeenCalledWith("2d");
		// Should have called toBlob on canvas
		expect(mockToBlob).toHaveBeenCalled();
	});

	it("triggers download with the generated PNG blob", async () => {
		const container = document.createElement("div");
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		container.appendChild(svg);

		await downloadPNG(container, "export.png");

		expect(mockClick).toHaveBeenCalledOnce();
	});

	it("revokes the SVG object URL after export", async () => {
		const container = document.createElement("div");
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		container.appendChild(svg);

		await downloadPNG(container, "export.png");

		expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:svg-url");
	});

	it("does not trigger download if toBlob returns null", async () => {
		mockToBlob.mockImplementation((cb: (blob: Blob | null) => void) => {
			cb(null);
		});

		const container = document.createElement("div");
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		container.appendChild(svg);

		await downloadPNG(container, "no-blob.png");

		// triggerDownload should NOT be called (no anchor click)
		expect(mockClick).not.toHaveBeenCalled();
	});

	it("rejects if canvas 2d context is unavailable", async () => {
		mockGetContext.mockReturnValue(null);

		const container = document.createElement("div");
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		container.appendChild(svg);

		await expect(downloadPNG(container, "fail.png")).rejects.toThrow(
			"Failed to get canvas 2d context",
		);
	});

	it("rejects if image fails to load", async () => {
		// Override Image to trigger onerror
		vi.stubGlobal("Image", class MockImageError {
			crossOrigin = "";
			naturalWidth = 0;
			naturalHeight = 0;
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			set src(_value: string) {
				Promise.resolve().then(() => this.onerror?.());
			}
			get src() {
				return "";
			}
		});

		const container = document.createElement("div");
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		container.appendChild(svg);

		await expect(downloadPNG(container, "fail.png")).rejects.toThrow(
			"Failed to load SVG as image",
		);
	});
});
