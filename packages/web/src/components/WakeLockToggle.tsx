import { Monitor, MonitorOff } from "lucide-react";
import { useCallback, useState } from "react";
import {
	getWakeLockEnabled,
	isWakeLockSupported,
	setWakeLockEnabled,
	useWakeLock,
} from "../hooks/useWakeLock.ts";
import { cn } from "../lib/utils.ts";

export function WakeLockToggle() {
	const [enabled, setEnabled] = useState(getWakeLockEnabled);

	useWakeLock(enabled);

	const toggle = useCallback(() => {
		setEnabled((prev) => {
			const next = !prev;
			setWakeLockEnabled(next);
			return next;
		});
	}, []);

	// Hide entirely when the browser has no Screen Wake Lock API.
	if (!isWakeLockSupported()) return null;

	const label = enabled ? "Let screen sleep" : "Keep screen awake";

	return (
		<button
			type="button"
			onClick={toggle}
			title={label}
			aria-label={label}
			aria-pressed={enabled}
			className={cn(
				"inline-flex h-9 w-9 items-center justify-center rounded-md",
				"border border-border hover:bg-muted",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				enabled && "text-foreground",
				!enabled && "text-muted-foreground",
			)}
		>
			{enabled ? (
				<Monitor className="h-4 w-4" aria-hidden="true" />
			) : (
				<MonitorOff className="h-4 w-4" aria-hidden="true" />
			)}
		</button>
	);
}
