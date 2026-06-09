import type { StreamingMode } from "../hooks/useSubscription.ts";
import { cn } from "../lib/utils.ts";

interface StreamingIndicatorProps {
	mode: StreamingMode;
	isStreaming: boolean;
	onToggle: () => void;
}

/**
 * Visual indicator showing the current data refresh mode.
 * Green pulsing dot = streaming (2s fast-poll).
 * Blue steady dot = standard polling (10s).
 * Click to toggle between modes.
 */
export function StreamingIndicator({ mode, isStreaming, onToggle }: StreamingIndicatorProps) {
	const label = isStreaming ? "Live" : "Polling (10s)";

	return (
		<button
			type="button"
			onClick={onToggle}
			title={`Mode: ${label}. Click to switch to ${mode === "stream" ? "polling" : "live"}.`}
			aria-label={`Data refresh mode: ${label}. Click to toggle.`}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
				"text-xs font-medium transition-colors",
				"border border-border hover:bg-muted",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
			)}
		>
			<span
				className={cn(
					"h-2 w-2 rounded-full",
					isStreaming ? "bg-green-500 animate-pulse" : "bg-blue-500",
				)}
				aria-hidden="true"
			/>
			<span>{label}</span>
		</button>
	);
}
