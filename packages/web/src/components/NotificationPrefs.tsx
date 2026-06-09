import { Bell, Loader2 } from "lucide-react";
import type { NotificationSettings } from "thermoworks-sdk";
import { useNotificationSettings } from "../hooks/useNotificationSettings.ts";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

type SettingKey = keyof NotificationSettings;

interface ToggleRowProps {
	label: string;
	description: string;
	checked: boolean;
	disabled: boolean;
	saving: boolean;
	field: SettingKey;
	onToggle: (field: SettingKey) => void;
}

function ToggleRow({
	label,
	description,
	checked,
	disabled,
	saving,
	field,
	onToggle,
}: ToggleRowProps) {
	const id = `notif-${field}`;
	return (
		<div className="flex items-start justify-between gap-4 py-3">
			<div className="space-y-0.5">
				<label htmlFor={id} className="text-sm font-medium leading-none cursor-pointer">
					{label}
				</label>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			<div className="flex items-center gap-2">
				{saving && (
					<Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
				)}
				<button
					id={id}
					type="button"
					role="switch"
					aria-checked={checked}
					disabled={disabled}
					onClick={() => onToggle(field)}
					className={cn(
						"relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full",
						"transition-colors duration-200 ease-in-out",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
						"disabled:opacity-50 disabled:cursor-not-allowed",
						checked ? "bg-primary" : "bg-muted-foreground/30",
					)}
				>
					<span
						aria-hidden="true"
						className={cn(
							"pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm",
							"ring-0 transition-transform duration-200 ease-in-out",
							checked ? "translate-x-4" : "translate-x-0.5",
							"mt-0.5",
						)}
					/>
				</button>
			</div>
		</div>
	);
}

const SETTING_META: Array<{ key: SettingKey; label: string; description: string }> = [
	{
		key: "enabled",
		label: "Enable notifications",
		description: "Master toggle for all notification channels.",
	},
	{
		key: "continuousAlerts",
		label: "Continuous alerts",
		description: "Keep alerting until the alarm condition clears.",
	},
	{
		key: "emailNotification",
		label: "Email notifications",
		description: "Receive alarm alerts via email.",
	},
	{
		key: "smsNotification",
		label: "SMS notifications",
		description: "Receive alarm alerts via text message.",
	},
	{
		key: "deviceNotification",
		label: "Push notifications",
		description: "Receive alarm alerts on your mobile device.",
	},
];

interface NotificationPrefsProps {
	client: ThermoworksWebClient;
}

export function NotificationPrefs({ client }: NotificationPrefsProps) {
	const { settings, isLoading, error, savingField, saveError, toggle } =
		useNotificationSettings(client);

	if (isLoading) {
		return (
			<div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
				Loading notification settings...
			</div>
		);
	}

	if (error) {
		return <p className="py-4 text-sm text-destructive">{error}</p>;
	}

	return (
		<section aria-labelledby="notification-prefs-heading">
			<div className="flex items-center gap-2 mb-1">
				<Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
				<h2 id="notification-prefs-heading" className="text-base font-semibold">
					Notifications
				</h2>
			</div>
			<div className="divide-y divide-border">
				{SETTING_META.map(({ key, label, description }) => (
					<ToggleRow
						key={key}
						field={key}
						label={label}
						description={description}
						checked={settings[key]}
						disabled={savingField !== null}
						saving={savingField === key}
						onToggle={toggle}
					/>
				))}
			</div>
			{saveError && <p className="mt-2 text-xs text-destructive">{saveError}</p>}
		</section>
	);
}
