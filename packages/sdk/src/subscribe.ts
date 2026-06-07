import type { DeviceChannel } from "./types.js";

/** Options for configuring polling-based subscriptions. */
export interface SubscriptionOptions {
	/** Polling interval in milliseconds (default 10000 = 10 seconds). */
	intervalMs?: number;
}

/** A snapshot of a single channel's current state, emitted on change. */
export interface ChannelUpdate {
	serial: string;
	channel: number;
	value: number | null;
	units: string | null;
	status: string | null;
	timestamp: string | null;
}

/** Handle returned by subscribe() to stop receiving updates. */
export interface Subscription {
	/** Stop polling and release resources. */
	unsubscribe(): void;
}

/** Callback invoked with each channel update. */
export type ChannelUpdateCallback = (update: ChannelUpdate) => void;

/** Callback invoked when a polling cycle encounters an error. */
export type ErrorCallback = (error: Error) => void;

const DEFAULT_INTERVAL_MS = 10_000;

/**
 * Build a fingerprint string for deduplication.
 * Only fires callback when value/units/status actually change.
 */
function channelFingerprint(ch: DeviceChannel): string {
	return `${ch.value}|${ch.units}|${ch.status}`;
}

/** Convert a DeviceChannel to a ChannelUpdate for the callback. */
function toChannelUpdate(serial: string, ch: DeviceChannel): ChannelUpdate {
	const channelNum = ch.number != null ? Number.parseInt(ch.number, 10) : 0;
	return {
		serial,
		channel: channelNum,
		value: ch.value,
		units: ch.units,
		status: ch.status,
		timestamp: ch.lastSeen?.toISOString() ?? null,
	};
}

/** Dependency: a function that fetches all channels for a device serial. */
export type ChannelFetcher = (serial: string) => Promise<DeviceChannel[]>;

/**
 * Create a polling subscription that monitors a device's channels for changes.
 *
 * @param serial - Device serial to monitor
 * @param fetchChannels - Function to retrieve current channel state (injected for testability)
 * @param callback - Called with each channel update when state changes
 * @param options - Polling configuration and error handler
 * @returns Subscription handle with unsubscribe()
 */
export function createSubscription(
	serial: string,
	fetchChannels: ChannelFetcher,
	callback: ChannelUpdateCallback,
	options?: SubscriptionOptions & { onError?: ErrorCallback },
): Subscription {
	const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
	const onError = options?.onError;

	// Track last-known state per channel number for deduplication
	const lastState = new Map<number, string>();
	let timer: ReturnType<typeof setInterval> | null = null;
	let stopped = false;

	async function poll(): Promise<void> {
		if (stopped) return;
		try {
			const channels = await fetchChannels(serial);
			if (stopped) return;

			for (const ch of channels) {
				if (ch.number == null) continue;
				const channelNum = Number.parseInt(ch.number, 10);
				if (Number.isNaN(channelNum)) continue;

				const fingerprint = channelFingerprint(ch);
				const previous = lastState.get(channelNum);

				if (previous !== fingerprint) {
					lastState.set(channelNum, fingerprint);
					callback(toChannelUpdate(serial, ch));
				}
			}
		} catch (err: unknown) {
			if (stopped) return;
			if (onError) {
				onError(err instanceof Error ? err : new Error(String(err)));
			}
		}
	}

	// Fire immediately, then schedule subsequent polls
	void poll();
	timer = setInterval(() => void poll(), intervalMs);

	return {
		unsubscribe(): void {
			if (stopped) return;
			stopped = true;
			if (timer != null) {
				clearInterval(timer);
				timer = null;
			}
			lastState.clear();
		},
	};
}
