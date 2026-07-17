import { Hourglass, X } from "lucide-react";
import { useState } from "react";
import { REST_TIMER_PRESETS, type UseRestTimerResult } from "../hooks/useRestTimer.ts";
import { cn } from "../lib/utils.ts";

interface RestTimerControlsProps {
	/** Result from `useRestTimer(serial)` passed by the parent. */
	timer: UseRestTimerResult;
}

/**
 * Rest timer UI: preset duration buttons, custom minute input, live
 * countdown display, and a cancel button. Intended to be rendered inside
 * SessionControls.
 */
export function RestTimerControls({ timer }: RestTimerControlsProps) {
	const { isResting, remainingFormatted, start, cancel } = timer;
	const [customMinutes, setCustomMinutes] = useState("");

	const handleCustomStart = () => {
		const parsed = Number.parseInt(customMinutes, 10);
		if (Number.isNaN(parsed) || parsed < 1) return;
		start(parsed);
		setCustomMinutes("");
	};

	if (isResting) {
		return (
			<div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-50 p-2 dark:bg-amber-950/20">
				<div className="flex items-center gap-1.5">
					<Hourglass
						className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0"
						aria-hidden="true"
					/>
					<span
						className="text-xs font-mono font-medium tabular-nums text-amber-700 dark:text-amber-300"
						role="timer"
						aria-label="Rest time remaining"
					>
						{remainingFormatted}
					</span>
					<span className="text-xs text-amber-600/80 dark:text-amber-400/80">resting</span>
				</div>
				<button
					type="button"
					onClick={cancel}
					aria-label="Cancel rest timer"
					className={cn(
						"inline-flex items-center gap-0.5 rounded px-1.5 py-0.5",
						"text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30",
						"border border-amber-500/30",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"transition-colors",
					)}
				>
					<X className="h-3 w-3" aria-hidden="true" />
					Cancel
				</button>
			</div>
		);
	}

	return (
		<div className="mt-2 space-y-1.5">
			<div className="flex items-center gap-1">
				<Hourglass className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
				<span className="text-xs text-muted-foreground">Rest timer</span>
			</div>
			<div className="flex flex-wrap items-center gap-1">
				{REST_TIMER_PRESETS.map((minutes) => (
					<button
						key={minutes}
						type="button"
						onClick={() => start(minutes)}
						aria-label={`Start ${minutes} minute rest timer`}
						className={cn(
							"rounded px-2 py-0.5 text-xs",
							"border border-border hover:bg-muted",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"transition-colors",
						)}
					>
						{minutes}m
					</button>
				))}
				<div className="flex items-center gap-0.5">
					<input
						type="number"
						min={1}
						value={customMinutes}
						onChange={(e) => setCustomMinutes(e.target.value)}
						placeholder="min"
						aria-label="Custom rest timer minutes"
						className={cn(
							"w-12 rounded border border-border bg-background px-1.5 py-0.5",
							"text-xs tabular-nums placeholder:text-muted-foreground",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleCustomStart();
						}}
					/>
					<button
						type="button"
						onClick={handleCustomStart}
						disabled={!customMinutes || Number.parseInt(customMinutes, 10) < 1}
						aria-label="Start custom rest timer"
						className={cn(
							"rounded px-1.5 py-0.5 text-xs",
							"border border-border hover:bg-muted",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"transition-colors",
							"disabled:opacity-50 disabled:cursor-not-allowed",
						)}
					>
						Start
					</button>
				</div>
			</div>
		</div>
	);
}
