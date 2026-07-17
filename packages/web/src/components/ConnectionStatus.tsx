import { useOfflineMutationCounts } from "../hooks/useOfflineMutations.ts";
import { useOnlineStatus } from "../hooks/useOnlineStatus.ts";
import { cn } from "../lib/utils.ts";

/**
 * Small connection-status indicator for display in the sidebar footer.
 * Green dot when online, red dot + "Reconnecting..." when offline.
 */
export function ConnectionStatus() {
	const isOnline = useOnlineStatus();
	const { pendingCount, conflictCount } = useOfflineMutationCounts();
	const offlineChangeCount = pendingCount + conflictCount;

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
			{offlineChangeCount > 0 && (
				<span
					className={cn(
						"rounded-full px-1.5 py-0.5 text-[10px] font-medium",
						conflictCount > 0
							? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200"
							: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
					)}
					title={
						conflictCount > 0
							? "Offline changes need review before syncing"
							: "Offline changes waiting to sync"
					}
				>
					{offlineChangeCount}
				</span>
			)}
		</div>
	);
}
