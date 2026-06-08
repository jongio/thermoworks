export type ExportFormat = "csv" | "json";

export interface ExportColumn {
	key: string;
	label: string;
}

/** Generate a CSV string from structured data with proper escaping. */
export function toCSV<T extends Record<string, unknown>>(data: T[], columns: ExportColumn[]): string {
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
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
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

function escapeCSVField(value: string): string {
	if (value.includes(",") || value.includes('"') || value.includes("\n")) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}
