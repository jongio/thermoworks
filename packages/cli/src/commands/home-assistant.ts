/**
 * Home Assistant integration for the watch command.
 *
 * Publishes device temperatures as HA sensor entities and alarm events as
 * binary_sensor entities via the Home Assistant REST API. This avoids adding
 * an MQTT client dependency: Node.js 18+ built-in fetch handles everything.
 *
 * Two exports are consumed by the watch loop:
 * - {@link HomeAssistantPublisher}: periodic temperature state publishing
 * - {@link HomeAssistantAlarmSink}: AlarmSink adapter for alarm transitions
 *
 * @see https://developers.home-assistant.io/docs/api/rest/#post-apistatesentity_id
 */

import type { AlarmEvent, AlarmSink } from "./alarm-notifier.js";
import type { DeviceWithChannels } from "./watch.js";

/** Timeout for each HA REST API call in milliseconds. */
const HA_FETCH_TIMEOUT_MS = 10_000;

/** Sanitise a string into a valid HA entity ID segment (lowercase, underscores). */
export function sanitizeEntityId(raw: string): string {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9_]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "");
}

/** Build the full HA entity ID for a temperature sensor. */
export function buildTemperatureEntityId(serial: string, channelLabel: string): string {
	const device = sanitizeEntityId(serial);
	const channel = sanitizeEntityId(channelLabel);
	return `sensor.thermoworks_${device}_${channel}`;
}

/** Build the full HA entity ID for an alarm binary sensor. */
export function buildAlarmEntityId(
	serial: string,
	channelLabel: string,
	alarmType: "high" | "low",
): string {
	const device = sanitizeEntityId(serial);
	const channel = sanitizeEntityId(channelLabel);
	return `binary_sensor.thermoworks_${device}_${channel}_alarm_${alarmType}`;
}

/** Options for creating a {@link HomeAssistantPublisher}. */
export interface HomeAssistantPublisherOptions {
	/** Base URL of the Home Assistant instance (e.g. "http://homeassistant.local:8123"). */
	url: string;
	/** Long-lived access token for the HA REST API. */
	token: string;
	/** Override fetch for testing. */
	fetchFn?: typeof globalThis.fetch;
}

/**
 * Publishes device temperatures to Home Assistant as sensor entities.
 *
 * Each enabled channel with a reading becomes a `sensor.thermoworks_*` entity.
 * Channels that are disabled or have no reading are marked "unavailable".
 *
 * All network errors are caught internally and logged to `logError` so a
 * transient HA outage never crashes the watch loop.
 */
export class HomeAssistantPublisher {
	private readonly url: string;
	private readonly token: string;
	private readonly fetchFn: typeof globalThis.fetch;
	private readonly logError: (message: string) => void;
	/** Track entities we have published so we can mark them unavailable when they disappear. */
	private readonly knownEntities = new Set<string>();

	constructor(
		options: HomeAssistantPublisherOptions,
		logError: (message: string) => void = console.error,
	) {
		// Strip trailing slash for consistent URL building.
		this.url = options.url.replace(/\/+$/, "");
		this.token = options.token;
		this.fetchFn = options.fetchFn ?? globalThis.fetch;
		this.logError = logError;
	}

	/**
	 * POST a state update to the HA REST API.
	 * Returns true on success, false on failure (logged, never thrown).
	 */
	private async postState(
		entityId: string,
		state: string,
		attributes: Record<string, unknown>,
	): Promise<boolean> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), HA_FETCH_TIMEOUT_MS);

		try {
			const response = await this.fetchFn(`${this.url}/api/states/${entityId}`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ state, attributes }),
				signal: controller.signal,
			});

			if (!response.ok) {
				this.logError(`Home Assistant: failed to update ${entityId}: HTTP ${response.status}`);
				return false;
			}
			return true;
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			this.logError(`Home Assistant: error updating ${entityId}: ${reason}`);
			return false;
		} finally {
			clearTimeout(timeout);
		}
	}

	/**
	 * Publish current temperatures for all watched devices.
	 *
	 * Called once per poll interval from the watch loop. Each enabled channel
	 * with a reading is published as a sensor entity. Previously-known entities
	 * whose channels are no longer present are marked "unavailable".
	 */
	async publishTemperatures(devices: DeviceWithChannels[]): Promise<void> {
		const currentEntities = new Set<string>();

		const tasks: Promise<boolean>[] = [];
		for (const { device, channels } of devices) {
			const deviceName = device.label ?? device.serial;
			for (const ch of channels) {
				if (ch.enabled === false) continue;

				const channelName = ch.label ?? ch.number ?? "unknown";
				const entityId = buildTemperatureEntityId(device.serial, channelName);
				currentEntities.add(entityId);
				this.knownEntities.add(entityId);

				if (ch.value == null) {
					tasks.push(
						this.postState(entityId, "unavailable", {
							friendly_name: `${deviceName} ${channelName}`,
							device_class: "temperature",
						}),
					);
					continue;
				}

				const unitSymbol = ch.units === "C" ? "°C" : "°F";
				tasks.push(
					this.postState(entityId, String(ch.value), {
						unit_of_measurement: unitSymbol,
						friendly_name: `${deviceName} ${channelName}`,
						device_class: "temperature",
						state_class: "measurement",
					}),
				);
			}
		}

		// Mark previously-known entities that are no longer present as unavailable.
		for (const entityId of this.knownEntities) {
			if (!currentEntities.has(entityId)) {
				tasks.push(
					this.postState(entityId, "unavailable", {
						friendly_name: entityId,
						device_class: "temperature",
					}),
				);
				this.knownEntities.delete(entityId);
			}
		}

		await Promise.all(tasks);
	}
}

/**
 * AlarmSink adapter that posts alarm transitions to Home Assistant.
 *
 * Reuses the AlarmSink interface from alarm-notifier.ts so it plugs in
 * via `notifier.addSink()` with no changes to the existing alarm plumbing.
 */
export class HomeAssistantAlarmSink implements AlarmSink {
	readonly name = "home-assistant";
	private readonly url: string;
	private readonly token: string;
	private readonly fetchFn: typeof globalThis.fetch;

	constructor(options: HomeAssistantPublisherOptions) {
		this.url = options.url.replace(/\/+$/, "");
		this.token = options.token;
		this.fetchFn = options.fetchFn ?? globalThis.fetch;
	}

	async send(event: AlarmEvent): Promise<void> {
		const entityId = buildAlarmEntityId(event.device, event.channel, event.alarmType);

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), HA_FETCH_TIMEOUT_MS);

		try {
			const response = await this.fetchFn(`${this.url}/api/states/${entityId}`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					state: "on",
					attributes: {
						device_class: "heat",
						friendly_name: `${event.device} ${event.channel} Alarm`,
						alarm_type: event.alarmType,
						temperature: event.value,
						threshold: event.threshold,
						units: event.units,
						timestamp: event.timestamp,
					},
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status} ${response.statusText}`);
			}
		} finally {
			clearTimeout(timeout);
		}
	}
}
