import { formatTimeAgo, ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** ANSI color codes for severity badges. */
const ANSI_RED = "\u001b[31m";
const ANSI_YELLOW = "\u001b[33m";
const ANSI_RESET = "\u001b[0m";

/** Options parsed from `events` command flags. */
export interface EventsCommandOptions {
	device?: string;
	type?: string;
	limit?: number;
	since?: Date;
	until?: Date;
}

/** Parse an ISO date flag value, exiting with a clear error when invalid. */
function parseDateFlag(flag: string, value: string | undefined): Date {
	if (!value) {
		console.error(`${flag} requires an ISO date value`);
		process.exit(1);
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		console.error(
			`Invalid ${flag} value: ${value}. Use an ISO date, for example 2026-06-07T12:00:00Z.`,
		);
		process.exit(1);
	}
	return date;
}

/** Map a numeric severity to a labeled color badge. */
export function formatSeverityBadge(severity: number): string {
	if (severity >= 3) {
		return `${ANSI_RED}[CRITICAL]${ANSI_RESET}`;
	}
	if (severity >= 2) {
		return `${ANSI_YELLOW}[WARNING]${ANSI_RESET}`;
	}
	return "[INFO]";
}

/**
 * Parse events-specific flags from remaining CLI args.
 * Handles: --device SERIAL, --type TYPE, --limit N, --since ISO, --until ISO
 */
export function parseEventsArgs(args: string[]): EventsCommandOptions {
	const options: EventsCommandOptions = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const next = args[i + 1];

		if (arg === "--device" && next) {
			options.device = next;
			i++;
		} else if (arg === "--type" && next) {
			options.type = next;
			i++;
		} else if (arg === "--limit" && next) {
			const parsed = Number.parseInt(next, 10);
			if (!Number.isNaN(parsed) && parsed > 0) {
				options.limit = parsed;
			}
			i++;
		} else if (arg === "--since") {
			options.since = parseDateFlag("--since", next);
			i++;
		} else if (arg === "--until") {
			options.until = parseDateFlag("--until", next);
			i++;
		}
	}

	return options;
}

export async function events(
	commandOptions: EventsCommandOptions = {},
	outputOptions: OutputOptions = { json: false },
): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const eventList = await client.getEvents({
			deviceId: commandOptions.device,
			eventType: commandOptions.type,
			startTime: commandOptions.since,
			endTime: commandOptions.until,
			limit: commandOptions.limit,
		});

		if (outputOptions.json) {
			outputJson(eventList);
			return;
		}

		if (eventList.length === 0) {
			console.log("No events found.");
			return;
		}

		console.log(`Found ${eventList.length} event${eventList.length > 1 ? "s" : ""}:\n`);

		for (const event of eventList) {
			const badge = formatSeverityBadge(event.severity);
			const time = formatTimeAgo(event.eventTime);
			const change =
				event.valueBefore != null || event.valueAfter != null
					? `  ${event.valueBefore ?? "?"} → ${event.valueAfter ?? "?"}`
					: "";

			console.log(`  ${badge} ${event.eventType}  ${event.deviceId}  ${time}${change}`);
		}
	} finally {
		client.close();
	}
}
