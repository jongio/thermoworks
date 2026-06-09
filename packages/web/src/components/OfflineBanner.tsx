import { WifiOff } from "lucide-react";
import { useOfflineCacheContext } from "../context/OfflineCacheContext.tsx";
import { useOnlineStatus } from "../hooks/useOnlineStatus.ts";
import { cn } from "../lib/utils.ts";

/** Format a relative time string like "2 minutes ago" or "3 hours ago". */
function formatTimeAgo(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) return "less than a minute ago";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
	const days = Math.floor(hours / 24);
	return `${days} day${days === 1 ? "" : "s"} ago`;
}

/**
 * Warning banner displayed at the top of the content area when
 * the browser loses network connectivity. Auto-dismisses on reconnect.
 * Shows "Last updated X ago" when serving cached data.
 */
export function OfflineBanner() {
	const isOnline = useOnlineStatus();
	const { cachedAt, isFromCache } = useOfflineCacheContext();

	if (isOnline) return null;

	return (
		<div
			role="alert"
			aria-live="polite"
			className={cn(
				"flex items-center gap-2 px-4 py-2 mb-4 rounded-lg",
				"bg-amber-50 border border-amber-200 text-amber-800",
				"dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200",
				"animate-in slide-in-from-top-2 duration-300",
			)}
		>
			<WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
			<p className="text-sm font-medium">
				You're offline.
				{isFromCache && cachedAt
					? ` Last updated ${formatTimeAgo(cachedAt)}.`
					: " Data may be outdated."}
			</p>
		</div>
	);
}

