import { Bell, BellOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	getNotificationsEnabled,
	setNotificationsEnabled,
} from "../hooks/useAlarmNotifications.ts";
import { cn } from "../lib/utils.ts";

type PermissionState = "default" | "granted" | "denied";

function getPermission(): PermissionState {
	if (typeof Notification === "undefined") return "denied";
	return Notification.permission;
}

export function NotificationToggle() {
	const [enabled, setEnabled] = useState(getNotificationsEnabled);
	const [permission, setPermission] = useState<PermissionState>(getPermission);

	// Sync permission if it changes externally (e.g. browser settings).
	useEffect(() => {
		if (typeof navigator === "undefined" || !navigator.permissions) return;

		let cancelled = false;
		navigator.permissions.query({ name: "notifications" as PermissionName }).then((status) => {
			if (cancelled) return;
			setPermission(status.state as PermissionState);
			const onChange = () => setPermission(status.state as PermissionState);
			status.addEventListener("change", onChange);
			// Store cleanup reference.
			cleanupRef = () => status.removeEventListener("change", onChange);
		});

		let cleanupRef: (() => void) | null = null;
		return () => {
			cancelled = true;
			cleanupRef?.();
		};
	}, []);

	const toggle = useCallback(() => {
		if (permission === "denied") return;

		if (permission === "default") {
			Notification.requestPermission().then((result) => {
				setPermission(result);
				if (result === "granted") {
					setEnabled(true);
					setNotificationsEnabled(true);
				}
			});
			return;
		}

		const next = !enabled;
		setEnabled(next);
		setNotificationsEnabled(next);
	}, [permission, enabled]);

	const isActive = enabled && permission === "granted";
	const isBlocked = permission === "denied";

	// Hide entirely when browser has blocked notifications — nothing we can do programmatically.
	if (isBlocked) return null;

	const label = isActive ? "Disable alarm notifications" : "Enable alarm notifications";

	return (
		<button
			type="button"
			onClick={toggle}
			title={label}
			aria-label={label}
			className={cn(
				"inline-flex h-9 w-9 items-center justify-center rounded-md",
				"border border-border hover:bg-muted",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				isActive && "text-foreground",
				!isActive && "text-muted-foreground",
			)}
		>
			{isActive ? (
				<Bell className="h-4 w-4" aria-hidden="true" />
			) : (
				<BellOff className="h-4 w-4" aria-hidden="true" />
			)}
		</button>
	);
}
