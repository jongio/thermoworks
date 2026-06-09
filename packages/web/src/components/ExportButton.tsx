import { Download } from "lucide-react";
import { useRef, useState } from "react";
import {
	type ExportColumn,
	type ExportFormat,
	buildExportFilename,
	exportToCSV,
	exportToJSON,
} from "../lib/export.ts";
import { cn } from "../lib/utils.ts";
import { useClickOutside } from "../hooks/useClickOutside.ts";

interface ExportButtonProps<T extends Record<string, unknown>> {
	data: T[];
	columns: ExportColumn[];
	filenamePrefix: string;
}

export function ExportButton<T extends Record<string, unknown>>({
	data,
	columns,
	filenamePrefix,
}: ExportButtonProps<T>) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useClickOutside(containerRef, () => setOpen(false));

	const disabled = data.length === 0;

	function handleExport(format: ExportFormat) {
		const filename = buildExportFilename(filenamePrefix, format);
		if (format === "csv") {
			exportToCSV(data, columns, filename);
		} else {
			exportToJSON(data, filename);
		}
		setOpen(false);
	}

	return (
		<div ref={containerRef} className="relative inline-block">
			<button
				type="button"
				disabled={disabled}
				onClick={() => setOpen((prev) => !prev)}
				aria-haspopup="true"
				aria-expanded={open}
				aria-label="Export data"
				className={cn(
					"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5",
					"text-sm border border-border",
					"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					"transition-colors",
					disabled && "opacity-50 cursor-not-allowed",
				)}
			>
				<Download className="h-4 w-4" />
				Export
			</button>
			{open && (
				<div
					role="menu"
					className={cn(
						"absolute right-0 mt-1 w-32 rounded-md border border-border bg-card shadow-md z-10",
						"py-1",
					)}
				>
					<button
						type="button"
						role="menuitem"
						onClick={() => handleExport("csv")}
						className={cn(
							"w-full text-left px-3 py-1.5 text-sm",
							"hover:bg-muted focus-visible:outline-none focus-visible:bg-muted",
						)}
					>
						CSV
					</button>
					<button
						type="button"
						role="menuitem"
						onClick={() => handleExport("json")}
						className={cn(
							"w-full text-left px-3 py-1.5 text-sm",
							"hover:bg-muted focus-visible:outline-none focus-visible:bg-muted",
						)}
					>
						JSON
					</button>
				</div>
			)}
		</div>
	);
}
