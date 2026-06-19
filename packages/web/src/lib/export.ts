/** Data export utilities. */

export type ExportFormat = "csv" | "json";

export interface ExportColumn {
	key: string;
	label: string;
}

export interface ChartDataPoint {
	time: number;
	[channelKey: string]: number;
}

/** Generate a CSV string from structured data with proper escaping. */
export function toCSV<T extends Record<string, unknown>>(
	data: T[],
	columns: ExportColumn[],
): string {
	const header = columns.map((c) => escapeCSVField(c.label)).join(",");
	const rows = data.map((row) =>
		columns
			.map((c) => {
				const val = row[c.key];
				if (val == null) return "";
				return escapeCSVField(String(val));
			})
			.join(","),
	);
	return [header, ...rows].join("\n");
}

/** Generate a formatted JSON string from data. */
export function toJSON<T>(data: T[]): string {
	return JSON.stringify(data, null, 2);
}

/** Trigger a file download in the browser. */
export function downloadBlob(content: string, filename: string, mimeType: string): void {
	const blob = new Blob([content], { type: mimeType });
	triggerDownload(blob, filename);
}

/** Export data as CSV, triggering a browser download. */
export function exportToCSV<T extends Record<string, unknown>>(
	data: T[],
	columns: ExportColumn[],
	filename: string,
): void {
	const csv = toCSV(data, columns);
	downloadBlob(csv, filename, "text/csv");
}

/** Export data as JSON, triggering a browser download. */
export function exportToJSON<T>(data: T[], filename: string): void {
	const json = toJSON(data);
	downloadBlob(json, filename, "application/json");
}

/** Build a filename with today's date: `${prefix}-YYYY-MM-DD.${ext}` */
export function buildExportFilename(prefix: string, format: ExportFormat): string {
	const date = new Date().toISOString().slice(0, 10);
	return `${prefix}-${date}.${format}`;
}

/** Convert chart data to CSV and trigger download. */
export function downloadCSV(data: ChartDataPoint[], filename: string): void {
	if (data.length === 0) return;

	const firstRow = data[0];
	if (!firstRow) return;

	const headers = Object.keys(firstRow);
	const headerLine = headers.map(escapeCSVField).join(",");

	const rows = data.map((row) =>
		headers.map((h) => escapeCSVField(String(row[h] ?? ""))).join(","),
	);

	const csv = [headerLine, ...rows].join("\n");
	triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

/**
 * Export a DOM element as a PNG image via canvas.
 * Uses SVG serialization for Recharts (SVG-based).
 */
export async function downloadPNG(container: HTMLElement, filename: string): Promise<void> {
	const svg = container.querySelector("svg");
	if (!svg) return;

	// Get rendered dimensions and set them explicitly on the SVG
	// (required for correct sizing when serialized as an image)
	const rect = svg.getBoundingClientRect();
	const width = Math.round(rect.width);
	const height = Math.round(rect.height);

	const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
	clonedSvg.setAttribute("width", String(width));
	clonedSvg.setAttribute("height", String(height));
	clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

	// Inline computed styles for elements that rely on CSS classes
	const originalElements = svg.querySelectorAll("*");
	const clonedElements = clonedSvg.querySelectorAll("*");
	for (let i = 0; i < originalElements.length; i++) {
		const orig = originalElements[i] as Element;
		const clone = clonedElements[i] as SVGElement | HTMLElement;
		if (!clone) continue;
		const computed = window.getComputedStyle(orig);
		const stroke = computed.getPropertyValue("stroke");
		const fill = computed.getPropertyValue("fill");
		if (stroke && stroke !== "none") clone.style.stroke = stroke;
		if (fill && fill !== "none") clone.style.fill = fill;
	}

	const svgData = new XMLSerializer().serializeToString(clonedSvg);
	const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
	const url = URL.createObjectURL(svgBlob);

	const img = new Image();
	img.crossOrigin = "anonymous";

	await new Promise<void>((resolve, reject) => {
		img.onload = () => {
			const scale = 2;
			const canvas = document.createElement("canvas");
			canvas.width = width * scale;
			canvas.height = height * scale;

			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("Failed to get canvas 2d context"));
				return;
			}

			ctx.scale(scale, scale);
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(img, 0, 0, width, height);

			canvas.toBlob((blob) => {
				if (blob) {
					triggerDownload(blob, filename);
				}
				resolve();
			}, "image/png");
		};
		img.onerror = () => reject(new Error("Failed to load SVG as image"));
		img.src = url;
	});

	URL.revokeObjectURL(url);
}

/** Escape a CSV field per RFC 4180. */
function escapeCSVField(value: string): string {
	if (/[",\n\r]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

/** Trigger a file download in the browser. */
function triggerDownload(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}
