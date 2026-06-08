/** Data export utilities for chart data. */

export interface ChartDataPoint {
	time: number;
	[channelKey: string]: number;
}

/**
 * Convert chart data to a CSV string and trigger a browser download.
 *
 * Handles values containing commas/quotes via RFC 4180 escaping.
 */
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
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	triggerDownload(blob, filename);
}

/**
 * Export a DOM element as a PNG image via canvas.
 *
 * Uses the SVG serialization approach for Recharts (SVG-based).
 * Falls back gracefully if the element contains no SVG.
 */
export async function downloadPNG(
	container: HTMLElement,
	filename: string,
): Promise<void> {
	const svg = container.querySelector("svg");
	if (!svg) return;

	const svgData = new XMLSerializer().serializeToString(svg);
	const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
	const url = URL.createObjectURL(svgBlob);

	const img = new Image();
	img.crossOrigin = "anonymous";

	await new Promise<void>((resolve, reject) => {
		img.onload = () => {
			const canvas = document.createElement("canvas");
			canvas.width = img.naturalWidth * 2;
			canvas.height = img.naturalHeight * 2;

			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("Failed to get canvas 2d context"));
				return;
			}

			ctx.scale(2, 2);
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(img, 0, 0);

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

/** Escape a CSV field per RFC 4180 (quote if contains comma, quote, or newline). */
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
