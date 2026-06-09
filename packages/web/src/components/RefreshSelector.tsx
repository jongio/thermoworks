import { Timer } from "lucide-react";
import type { RefreshInterval, UseRefreshIntervalResult } from "../hooks/useRefreshInterval.ts";
import { cn } from "../lib/utils.ts";

function formatInterval(ms: number): string {
	return ms >= 60_000 ? `${ms / 60_000}m` : `${ms / 1_000}s`;
}

interface RefreshSelectorProps {
	interval: RefreshInterval;
	options: UseRefreshIntervalResult["options"];
	onIntervalChange: (ms: RefreshInterval) => void;
}

export function RefreshSelector({ interval, options, onIntervalChange }: RefreshSelectorProps) {
	return (
		<label className="inline-flex items-center gap-1.5">
			<Timer className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
			<select
				value={interval}
				onChange={(e) => onIntervalChange(Number(e.target.value) as RefreshInterval)}
				aria-label="Refresh interval"
				className={cn(
					"rounded-md border border-border bg-background px-2 py-1",
					"text-sm text-foreground",
					"hover:bg-muted",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				)}
			>
				{options.map((ms) => (
					<option key={ms} value={ms}>
						{formatInterval(ms)}
					</option>
				))}
			</select>
		</label>
	);
}
