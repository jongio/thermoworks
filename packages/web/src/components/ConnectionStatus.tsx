import { useOnlineStatus } from "../hooks/useOnlineStatus.ts";
import { cn } from "../lib/utils.ts";

/**
 * Small connection-status indicator for display in the sidebar footer.
 * Green dot when online, red dot + "Reconnecting..." when offline.
 */
export function ConnectionStatus() {
	const isOnline = useOnlineStatus();

	return (
		<div className="flex items-center gap-2 px-3 py-1.5" aria-live="polite">
			<span
				className={cn(
					"h-2 w-2 rounded-full shrink-0",
					isOnline ? "bg-emerald-500" : "bg-red-500 animate-pulse",
				)}
				aria-hidden="true"
			/>
			<span className="text-xs text-muted-foreground truncate">
				{isOnline ? "Connected" : "Reconnecting\u2026"}
			</span>
		</div>
	);
}
