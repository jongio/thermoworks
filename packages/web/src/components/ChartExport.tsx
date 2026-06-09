import { Download, Image } from "lucide-react";
import { type RefObject, useCallback, useRef } from "react";
import type { ChartDataPoint } from "../lib/export.ts";
import { downloadCSV, downloadPNG } from "../lib/export.ts";

interface ChartExportProps {
	/** Reference to the chart container element for PNG export. */
	chartRef: RefObject<HTMLDivElement | null>;
	/** The current chart data for CSV export. */
	data: ChartDataPoint[];
	/** Base filename without extension. */
	filename?: string;
}

/**
 * Export buttons for downloading chart data as CSV or PNG.
 */
export function ChartExport({ chartRef, data, filename = "temperature-data" }: ChartExportProps) {
	const isExporting = useRef(false);

	const handleCSV = useCallback(() => {
		if (data.length === 0) return;
		downloadCSV(data, `${filename}.csv`);
	}, [data, filename]);

	const handlePNG = useCallback(async () => {
		if (!chartRef.current || isExporting.current) return;
		isExporting.current = true;
		try {
			await downloadPNG(chartRef.current, `${filename}.png`);
		} finally {
			isExporting.current = false;
		}
	}, [chartRef, filename]);

	return (
		<div className="flex items-center gap-1">
			<button
				type="button"
				onClick={handleCSV}
				disabled={data.length === 0}
				className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
				title="Export CSV"
			>
				<Download size={14} />
				<span>CSV</span>
			</button>
			<button
				type="button"
				onClick={handlePNG}
				disabled={!chartRef.current}
				className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
				title="Export PNG"
			>
				<Image size={14} />
				<span>PNG</span>
			</button>
		</div>
	);
}
