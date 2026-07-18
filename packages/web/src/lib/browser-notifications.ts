export const NOTIFICATION_PREFERENCE_STORAGE_KEY = "thermoworks-notifications-enabled";

export function getNotificationPermission(): NotificationPermission {
	if (typeof Notification === "undefined") return "denied";
	return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission> {
	if (typeof Notification === "undefined") return "denied";

	try {
		return await Notification.requestPermission();
	} catch {
		return Notification.permission;
	}
}

export function getNotificationsEnabled(): boolean {
	try {
		return localStorage.getItem(NOTIFICATION_PREFERENCE_STORAGE_KEY) !== "false";
	} catch {
		return true;
	}
}

export function hasStoredNotificationPreference(): boolean {
	try {
		return localStorage.getItem(NOTIFICATION_PREFERENCE_STORAGE_KEY) !== null;
	} catch {
		return false;
	}
}

export function setNotificationsEnabled(enabled: boolean): void {
	try {
		localStorage.setItem(NOTIFICATION_PREFERENCE_STORAGE_KEY, String(enabled));
	} catch {
		// Storage unavailable - ignore.
	}
}

export function sanitizeNotificationText(
	value: string | null | undefined,
	fallback: string,
): string {
	const text = value?.trim() || fallback;
	return text
		.replace(/[<>{}[\]\\]/g, "")
		.replace(/\s+/g, " ")
		.slice(0, 240);
}

export type AlarmPushSubscriptionResult =
	| { readonly status: "unsupported" }
	| { readonly status: "missing-vapid-key" }
	| { readonly status: "permission-denied" }
	| { readonly status: "subscribed"; readonly subscription: PushSubscription };

/**
 * Optional Web Push subscription scaffold. This static SPA has no push backend,
 * so callers must supply their own VAPID key and server-side subscription store
 * before a closed tab can receive push messages.
 */
export async function subscribeToAlarmPushNotifications(
	registration: ServiceWorkerRegistration,
	applicationServerKey?: BufferSource | string,
): Promise<AlarmPushSubscriptionResult> {
	if (!("PushManager" in window) || !registration.pushManager) {
		return { status: "unsupported" };
	}
	if (!applicationServerKey) {
		return { status: "missing-vapid-key" };
	}
	if (getNotificationPermission() !== "granted") {
		return { status: "permission-denied" };
	}

	const subscription = await registration.pushManager.subscribe({
		applicationServerKey,
		userVisibleOnly: true,
	});
	return { status: "subscribed", subscription };
}
