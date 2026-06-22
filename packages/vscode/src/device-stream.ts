import type { DeviceChannel } from "thermoworks-sdk";

/** A snapshot of one device's channels, emitted when they change. */
export interface DeviceSnapshot {
	serial: string;
	channels: DeviceChannel[];
}

export interface DeviceStreamCallbacks {
	/** Called with a device's channels whenever they change (deduplicated). */
	onSnapshot: (snapshot: DeviceSnapshot) => void;
	/** Called when a device's poll fails. */
	onError?: (serial: string, error: Error) => void;
}

/** Fetches the current channels for a device serial. */
export type ChannelFetcher = (serial: string) => Promise<DeviceChannel[]>;

/** Minimum poll interval — protects the API from overly aggressive refresh settings. */
export const MIN_STREAM_INTERVAL_MS = 15_000;

/** Build a change-detection fingerprint for a device's channels. */
function fingerprint(channels: DeviceChannel[]): string {
	return channels
		.map(
			(c) =>
				`${c.number}:${c.value}:${c.units}:${c.status}:${c.alarmHigh?.alarming}:${c.alarmLow?.alarming}`,
		)
		.join("|");
}

/** Polls a single device with no-overlap scheduling and change deduplication. */
class DevicePoller {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private stopped = false;
	private last: string | null = null;

	constructor(
		private readonly serial: string,
		private readonly fetchChannels: ChannelFetcher,
		private readonly intervalMs: number,
		private readonly callbacks: DeviceStreamCallbacks,
	) {
		this.scheduleNext();
	}

	private scheduleNext(): void {
		this.timer = setTimeout(() => void this.poll(), this.intervalMs);
	}

	private async poll(): Promise<void> {
		if (this.stopped) return;
		try {
			const channels = await this.fetchChannels(this.serial);
			if (this.stopped) return;
			const fp = fingerprint(channels);
			if (fp !== this.last) {
				this.last = fp;
				this.callbacks.onSnapshot({ serial: this.serial, channels });
			}
		} catch (error) {
			if (!this.stopped) {
				this.callbacks.onError?.(
					this.serial,
					error instanceof Error ? error : new Error(String(error)),
				);
			}
		}
		// Self-reschedule only after the current poll resolves (prevents overlap).
		if (!this.stopped) this.scheduleNext();
	}

	stop(): void {
		this.stopped = true;
		if (this.timer != null) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}
}

/**
 * Maintains one live subscription per device, emitting channel snapshots on change.
 * Replaces ad-hoc setTimeout refresh loops with a single, deduplicated, no-overlap poll
 * per device that can be disposed cleanly.
 */
export class DeviceStream {
	private readonly pollers = new Map<string, DevicePoller>();
	private readonly intervalMs: number;
	private disposed = false;

	constructor(
		private readonly fetchChannels: ChannelFetcher,
		private readonly callbacks: DeviceStreamCallbacks,
		intervalMs: number,
	) {
		this.intervalMs = Math.max(intervalMs, MIN_STREAM_INTERVAL_MS);
	}

	/** Reconcile the watched device set: start pollers for new serials, stop removed ones. */
	setDevices(serials: string[]): void {
		if (this.disposed) return;
		const next = new Set(serials);
		for (const [serial, poller] of this.pollers) {
			if (!next.has(serial)) {
				poller.stop();
				this.pollers.delete(serial);
			}
		}
		for (const serial of next) {
			if (!this.pollers.has(serial)) {
				this.pollers.set(
					serial,
					new DevicePoller(serial, this.fetchChannels, this.intervalMs, this.callbacks),
				);
			}
		}
	}

	/** Number of devices currently being polled. */
	get size(): number {
		return this.pollers.size;
	}

	dispose(): void {
		this.disposed = true;
		for (const poller of this.pollers.values()) poller.stop();
		this.pollers.clear();
	}
}
