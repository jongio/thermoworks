import { Leaf } from "lucide-react";
import type { UseLowDataModeResult } from "../hooks/useLowDataMode.ts";
import { cn } from "../lib/utils.ts";

interface LowDataToggleProps {
	isLowData: UseLowDataModeResult["isLowData"];
	onToggle: UseLowDataModeResult["toggleLowData"];
}

/**
 * Toggle button that enables or disables low-data mode.
 * When active, shows a green-tinted indicator so the user
 * always knows reduced polling is in effect.
 */
export function LowDataToggle({ isLowData, onToggle }: LowDataToggleProps) {
	return (
		<button
			type="button"
			onClick={onToggle}
			aria-pressed={isLowData}
			aria-label="Toggle low-data mode"
			title={isLowData ? "Low-data mode is on (slower refresh)" : "Enable low-data mode"}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
				"border transition-colors",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				isLowData
					? "border-green-600 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-950/30 dark:text-green-400"
					: "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
			)}
		>
			<Leaf className="h-4 w-4" aria-hidden="true" />
			<span className="hidden sm:inline">Low Data</span>
		</button>
	);
}
