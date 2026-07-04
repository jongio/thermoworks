import type { NotificationSettings } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Maps a user-facing field name to its NotificationSettings key. */
const FIELD_MAP: Record<string, keyof NotificationSettings> = {
	all: "enabled",
	continuous: "continuousAlerts",
	email: "emailNotification",
	sms: "smsNotification",
	device: "deviceNotification",
};

/** Human-readable labels for each setting, in display order. */
const DISPLAY: Array<{ key: keyof NotificationSettings; label: string }> = [
	{ key: "enabled", label: "Notifications enabled" },
	{ key: "continuousAlerts", label: "Continuous alerts" },
	{ key: "emailNotification", label: "Email alerts" },
	{ key: "smsNotification", label: "SMS alerts" },
	{ key: "deviceNotification", label: "Device (app) alerts" },
];

const bold = (text: string): string => `\x1b[1m${text}\x1b[0m`;
const green = (text: string): string => `\x1b[32m${text}\x1b[0m`;
const dim = (text: string): string => `\x1b[2m${text}\x1b[0m`;

/** Parsed options for the notifications command. */
interface NotificationsArgs {
	field?: keyof NotificationSettings;
	value?: boolean;
}

/**
 * Parse notifications-specific CLI args.
 * Expected: [--enable FIELD | --disable FIELD] where FIELD is one of
 * all, continuous, email, sms, device.
 */
export function parseNotificationsArgs(args: string[]): NotificationsArgs {
	let field: keyof NotificationSettings | undefined;
	let value: boolean | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--enable" || arg === "--disable") {
			if (value !== undefined) {
				console.error("Only one of --enable or --disable may be given.");
				process.exit(1);
			}
			const name = args[++i];
			const mapped = name ? FIELD_MAP[name] : undefined;
			if (!mapped) {
				console.error(
					`${arg} requires a field: all, continuous, email, sms, or device (got: ${name ?? "none"})`,
				);
				process.exit(1);
			}
			field = mapped;
			value = arg === "--enable";
		} else {
			console.error(`Unknown option: ${arg}`);
			process.exit(1);
		}
	}

	return { field, value };
}

function formatSettings(settings: NotificationSettings): string {
	const labelWidth = Math.max(...DISPLAY.map((d) => d.label.length));
	const lines = [bold("Notification settings")];
	for (const { key, label } of DISPLAY) {
		const on = settings[key];
		const state = on ? green("on") : dim("off");
		lines.push(`  ${label.padEnd(labelWidth)}  ${state}`);
	}
	return lines.join("\n");
}

/** Main notifications command handler. */
export async function notifications(
	args: string[],
	options: OutputOptions = { json: false },
): Promise<void> {
	const parsed = parseNotificationsArgs(args);

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		if (parsed.field !== undefined && parsed.value !== undefined) {
			await client.updateNotificationSettings({ [parsed.field]: parsed.value });
		}

		const settings = await client.getNotificationSettings();

		if (options.json) {
			outputJson(settings);
			return;
		}

		console.log(formatSettings(settings));
	} finally {
		client.close();
	}
}
