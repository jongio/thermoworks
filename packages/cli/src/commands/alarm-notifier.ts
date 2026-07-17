/**
 * Alarm notification dispatcher: a reusable seam for outbound alarm delivery.
 *
 * This module defines the AlarmSink interface and an AlarmNotifier that
 * dispatches alarm events to all registered sinks. The built-in WebhookSink
 * posts JSON payloads to Slack, Discord, or any generic URL.
 *
 * To add a new outbound sink (e.g., Home Assistant for #136):
 * 1. Create a class implementing AlarmSink
 * 2. Register it with AlarmNotifier.addSink()
 *
 * The notifier catches per-sink errors so one failing sink never blocks
 * others or crashes the watch loop.
 */

/** Webhook payload format preset. */
export type WebhookFormat = "generic" | "slack" | "discord";

/** An alarm event dispatched to outbound sinks. */
export interface AlarmEvent {
	device: string;
	channel: string;
	value: number;
	units: string;
	threshold: number;
	alarmType: "high" | "low";
	timestamp: string;
}

/**
 * An outbound sink that receives alarm events.
 *
 * Implement this interface and register it with AlarmNotifier.addSink()
 * to add a new delivery target (webhook, MQTT, Home Assistant, etc.).
 */
export interface AlarmSink {
	/** Human-readable name for log messages (e.g., "slack-webhook"). */
	readonly name: string;
	/** Deliver an alarm event. Throw on failure; the notifier handles retries. */
	send(event: AlarmEvent): Promise<void>;
}

/** Configuration for retry behavior on delivery failure. */
export interface RetryOptions {
	/** Maximum number of retry attempts (default 3). */
	maxAttempts: number;
	/** Base delay in milliseconds before exponential increase (default 1000). */
	baseDelayMs: number;
	/** Maximum delay in milliseconds between retries (default 10000). */
	maxDelayMs: number;
}

const DEFAULT_RETRY: RetryOptions = {
	maxAttempts: 3,
	baseDelayMs: 1000,
	maxDelayMs: 10000,
};

/** Timeout in milliseconds for outbound HTTP requests. */
const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

/** Build a plain JSON payload for generic webhook receivers. */
export function buildGenericPayload(event: AlarmEvent): object {
	return {
		event: "alarm",
		device: event.device,
		channel: event.channel,
		value: event.value,
		units: event.units,
		threshold: event.threshold,
		alarmType: event.alarmType,
		timestamp: event.timestamp,
	};
}

/** Build a Slack-compatible Block Kit payload. */
export function buildSlackPayload(event: AlarmEvent): object {
	const icon = event.alarmType === "high" ? "🔴" : "🔵";
	const direction = event.alarmType === "high" ? "above" : "below";
	const text = `${icon} *${event.device}* / ${event.channel}: ${event.value}°${event.units} is ${direction} the ${event.threshold}°${event.units} threshold`;

	return {
		text,
		blocks: [
			{
				type: "section",
				text: { type: "mrkdwn", text },
			},
			{
				type: "context",
				elements: [
					{ type: "mrkdwn", text: `Alarm type: *${event.alarmType}*  |  ${event.timestamp}` },
				],
			},
		],
	};
}

/** Build a Discord-compatible embed payload. */
export function buildDiscordPayload(event: AlarmEvent): object {
	const color = event.alarmType === "high" ? 0xff4444 : 0x4488ff;
	const direction = event.alarmType === "high" ? "above" : "below";

	return {
		content: `Alarm: ${event.device} / ${event.channel} is ${direction} threshold`,
		embeds: [
			{
				title: `${event.alarmType.toUpperCase()} Alarm: ${event.device}`,
				color,
				fields: [
					{ name: "Channel", value: event.channel, inline: true },
					{ name: "Value", value: `${event.value}°${event.units}`, inline: true },
					{ name: "Threshold", value: `${event.threshold}°${event.units}`, inline: true },
					{ name: "Type", value: event.alarmType, inline: true },
				],
				timestamp: event.timestamp,
			},
		],
	};
}

/** Select the payload builder for a given format. */
export function buildPayload(event: AlarmEvent, format: WebhookFormat): object {
	switch (format) {
		case "slack":
			return buildSlackPayload(event);
		case "discord":
			return buildDiscordPayload(event);
		default:
			return buildGenericPayload(event);
	}
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

/** Auto-detect webhook format from the URL hostname. */
export function detectWebhookFormat(url: string): WebhookFormat {
	try {
		const hostname = new URL(url).hostname;
		if (hostname.endsWith("slack.com")) return "slack";
		if (hostname.endsWith("discord.com") || hostname.endsWith("discordapp.com")) return "discord";
	} catch {
		// Invalid URL; fall through to generic
	}
	return "generic";
}

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

/**
 * Execute an async function with exponential backoff on failure.
 * Exposed for testing; prefer AlarmNotifier for production use.
 */
export async function retryWithBackoff(
	fn: () => Promise<void>,
	options: RetryOptions = DEFAULT_RETRY,
	sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
	let lastError: Error | undefined;
	for (let attempt = 0; attempt <= options.maxAttempts; attempt++) {
		try {
			await fn();
			return;
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			if (attempt < options.maxAttempts) {
				const delay = Math.min(options.baseDelayMs * 2 ** attempt, options.maxDelayMs);
				await sleepFn(delay);
			}
		}
	}
	throw lastError;
}

// ---------------------------------------------------------------------------
// WebhookSink
// ---------------------------------------------------------------------------

/** Options for creating a WebhookSink. */
export interface WebhookSinkOptions {
	url: string;
	format?: WebhookFormat;
	retry?: Partial<RetryOptions>;
	/** Override fetch for testing. */
	fetchFn?: typeof globalThis.fetch;
}

/**
 * An AlarmSink that POSTs alarm events to an HTTP endpoint.
 *
 * Supports Slack, Discord, and generic JSON payloads. Auto-detects the
 * format from the URL when not explicitly specified.
 */
export class WebhookSink implements AlarmSink {
	readonly name: string;
	private readonly url: string;
	private readonly format: WebhookFormat;
	private readonly retryOptions: RetryOptions;
	private readonly fetchFn: typeof globalThis.fetch;

	constructor(options: WebhookSinkOptions) {
		this.url = options.url;
		this.format = options.format ?? detectWebhookFormat(options.url);
		this.retryOptions = { ...DEFAULT_RETRY, ...options.retry };
		this.fetchFn = options.fetchFn ?? globalThis.fetch;
		this.name = `webhook-${this.format}`;
	}

	async send(event: AlarmEvent): Promise<void> {
		const payload = buildPayload(event, this.format);

		await retryWithBackoff(async () => {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

			try {
				const response = await this.fetchFn(this.url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
					signal: controller.signal,
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status} ${response.statusText}`);
				}
			} finally {
				clearTimeout(timeout);
			}
		}, this.retryOptions);
	}
}

// ---------------------------------------------------------------------------
// AlarmNotifier (the dispatcher)
// ---------------------------------------------------------------------------

/**
 * Dispatches alarm events to all registered sinks.
 *
 * Catches per-sink errors and logs them so one failing sink never blocks
 * others or crashes the caller. This is the primary extension point: add
 * new outbound targets by calling addSink() with any AlarmSink impl.
 */
export class AlarmNotifier {
	private readonly sinks: AlarmSink[] = [];
	private readonly logError: (message: string) => void;

	constructor(logError: (message: string) => void = console.error) {
		this.logError = logError;
	}

	/** Register an outbound sink. */
	addSink(sink: AlarmSink): void {
		this.sinks.push(sink);
	}

	/** True when at least one sink is registered. */
	get hasSinks(): boolean {
		return this.sinks.length > 0;
	}

	/**
	 * Dispatch an alarm event to all registered sinks.
	 * Errors are logged per-sink; the caller is never thrown at.
	 */
	async notify(event: AlarmEvent): Promise<void> {
		const tasks = this.sinks.map(async (sink) => {
			try {
				await sink.send(event);
			} catch (err) {
				const reason = err instanceof Error ? err.message : String(err);
				this.logError(`Webhook delivery failed (${sink.name}): ${reason}`);
			}
		});
		await Promise.all(tasks);
	}
}

// ---------------------------------------------------------------------------
// Alarm transition tracking
// ---------------------------------------------------------------------------

/**
 * Build a dedup key for a channel alarm. Used to track transitions so
 * webhooks fire only when a channel enters an alarm state, not on every
 * refresh while it remains alarming.
 */
export function alarmKey(
	serial: string,
	channelNumber: string | null,
	alarmType: "high" | "low",
): string {
	return `${serial}:${channelNumber ?? "0"}:${alarmType}`;
}
