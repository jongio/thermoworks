import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus.ts";
import { cn } from "../lib/utils.ts";

/**
 * Warning banner displayed at the top of the content area when
 * the browser loses network connectivity. Auto-dismisses on reconnect.
 */
export function OfflineBanner() {
	const isOnline = useOnlineStatus();

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
			<p className="text-sm font-medium">You're offline. Data may be outdated.</p>
		</div>
	);
}
