import { useCallback, useEffect, useState } from "react";
import type { ThermoworksWebClient } from "../lib/api.ts";
import type { NotificationSettings } from "thermoworks-sdk";

type SettingKey = keyof NotificationSettings;

interface UseNotificationSettingsResult {
	settings: NotificationSettings;
	isLoading: boolean;
	error: string | null;
	savingField: SettingKey | null;
	saveError: string | null;
	toggle: (field: SettingKey) => Promise<void>;
}

const DEFAULTS: NotificationSettings = {
	enabled: false,
	continuousAlerts: false,
	emailNotification: false,
	smsNotification: false,
	deviceNotification: false,
};

/**
 * Hook that fetches and manages notification settings for the authenticated user.
 * Provides optimistic toggle with per-field saving state.
 */
export function useNotificationSettings(
	client: ThermoworksWebClient | null,
): UseNotificationSettingsResult {
	const [settings, setSettings] = useState<NotificationSettings | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [savingField, setSavingField] = useState<SettingKey | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	useEffect(() => {
		if (!client?.isAuthenticated) {
			setSettings(null);
			return;
		}

		let cancelled = false;
		setIsLoading(true);
		setError(null);

		client
			.getNotificationSettings()
			.then((result) => {
				if (!cancelled) setSettings(result);
			})
			.catch((err) => {
				if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load settings");
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [client]);

	const toggle = useCallback(
		async (field: SettingKey) => {
			if (!client?.isAuthenticated || !settings) return;

			const previous = settings;
			const updated = { ...settings, [field]: !settings[field] };

			// Optimistic update
			setSettings(updated);
			setSavingField(field);
			setSaveError(null);

			try {
				const result = await client.updateNotificationSettings({ [field]: updated[field] });
				if (!result.success) throw new Error("Server rejected the update");
			} catch (err) {
				// Revert on failure
				setSettings(previous);
				setSaveError(err instanceof Error ? err.message : "Failed to save");
			} finally {
				setSavingField(null);
			}
		},
		[client, settings],
	);

	return { settings: settings ?? DEFAULTS, isLoading, error, savingField, saveError, toggle };
}
