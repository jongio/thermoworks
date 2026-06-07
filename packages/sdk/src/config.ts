/** A device entry in the ThermoWorks statusline configuration. */
export interface DeviceEntry {
	serial: string;
	label: string;
	/** Channel numbers to display, or "avg" for average temperature. */
	channels: number[] | "avg";
}

/** Shared configuration for ThermoWorks CLI and VS Code statusline. */
export interface StatuslineConfig {
	/** Devices to show in statusline. */
	devices: DeviceEntry[];
	/** API cache duration in seconds. */
	refreshSeconds: number;
}

/** Default configuration values. */
export const DEFAULT_STATUSLINE_CONFIG: StatuslineConfig = {
	devices: [],
	refreshSeconds: 30,
};

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
	return true;
}

/** Validate a single device entry. */
export function isValidDeviceEntry(entry: unknown): entry is DeviceEntry {
	if (typeof entry !== "object" || entry === null) return false;
	const obj = entry as Record<string, unknown>;
	if (typeof obj.serial !== "string" || !obj.serial) return false;
	if (typeof obj.label !== "string") return false;
	if (obj.channels === "avg") return true;
	if (Array.isArray(obj.channels) && obj.channels.every((ch) => typeof ch === "number"))
		return true;
	return false;
}
