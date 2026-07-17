/** A device entry in the ThermoWorks statusline configuration. */
export interface DeviceEntry {
	serial: string;
	label: string;
	/** Channel numbers to display, or "avg" for average temperature. */
	channels: number[] | "avg";
}

/**
 * Persistent local channel labels keyed by `"serial:channelNumber"`.
 *
 * Example: `{ "ABC123:1": "Pit", "ABC123:2": "Brisket" }`
 */
export type ChannelLabelMap = Record<string, string>;

/** Shared configuration for ThermoWorks CLI and VS Code statusline. */
export interface StatuslineConfig {
	/** Devices to show in statusline. */
	devices: DeviceEntry[];
	/** API cache duration in seconds. */
	refreshSeconds: number;
	/** Persistent local channel labels, keyed by `"serial:channelNumber"`. */
	channelLabels?: ChannelLabelMap;
}

/** Maximum length for a user-provided channel label. */
export const MAX_CHANNEL_LABEL_LENGTH = 50;

/** Default configuration values. */
export const DEFAULT_STATUSLINE_CONFIG: StatuslineConfig = {
	devices: [],
	refreshSeconds: 30,
};

/**
 * Strip ANSI escape sequences and control characters from a label string.
 *
 * Labels reach the terminal, the DOM, and MCP/LLM output, so they must be
 * treated as untrusted input. This function is the single sanitization point
 * shared by all surfaces.
 */
export function sanitizeLabel(value: string | null | undefined): string | null {
	if (value == null) return null;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional - stripping ANSI/control chars from untrusted labels
	const stripped = value.replace(/[\x00-\x1f\x7f\x1b](\[[0-9;]*[A-Za-z])?/g, "");
	return stripped.slice(0, MAX_CHANNEL_LABEL_LENGTH);
}

/**
 * Build the config map key for a channel label.
 *
 * @param serial - Device serial number.
 * @param channelNumber - 1-indexed channel number (string or number).
 */
export function channelLabelKey(serial: string, channelNumber: string | number): string {
	return `${serial}:${channelNumber}`;
}

/**
 * Resolve the display name for a channel, applying the three-tier fallback:
 *
 * 1. Local custom label (from `channelLabels` config map)
 * 2. Cloud channel label (`channel.label` from the API)
 * 3. Default `"Ch N"` derived from the channel number
 *
 * @param serial - Device serial number.
 * @param channel - The channel object from the SDK.
 * @param channelLabels - The persisted label map (may be undefined).
 * @param index - Zero-based index, used when `channel.number` is null.
 * @returns The resolved display name.
 */
export function resolveChannelLabel(
	serial: string,
	channel: { label?: string | null; number?: string | null },
	channelLabels: ChannelLabelMap | undefined,
	index: number,
): string {
	const chNum = channel.number ?? String(index + 1);
	const key = channelLabelKey(serial, chNum);
	const custom = channelLabels?.[key];
	if (custom) return custom;
	if (channel.label) return channel.label;
	return `Ch ${chNum}`;
}

/** Validate a raw object as a partial StatuslineConfig. */
export function isValidStatuslineConfig(raw: unknown): raw is Partial<StatuslineConfig> {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
	const obj = raw as Record<string, unknown>;
	if (
		obj.refreshSeconds !== undefined &&
		(typeof obj.refreshSeconds !== "number" || obj.refreshSeconds < 1)
	)
		return false;
	if (obj.devices !== undefined && !Array.isArray(obj.devices)) return false;
	if (obj.channelLabels !== undefined && !isValidChannelLabelMap(obj.channelLabels)) return false;
	return true;
}

/** Validate a single device entry. */
export function isValidDeviceEntry(entry: unknown): entry is DeviceEntry {
	if (typeof entry !== "object" || entry === null) return false;
	const obj = entry as Record<string, unknown>;
	if (typeof obj.serial !== "string" || !obj.serial) return false;
	if (typeof obj.label !== "string") return false;
	if (obj.channels === "avg") return true;
	if (
		Array.isArray(obj.channels) &&
		obj.channels.length > 0 &&
		obj.channels.every((ch) => typeof ch === "number")
	)
		return true;
	return false;
}

/** Validate a channel label map: must be a plain object with string values. */
export function isValidChannelLabelMap(raw: unknown): raw is ChannelLabelMap {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
	return Object.values(raw as Record<string, unknown>).every((v) => typeof v === "string");
}
