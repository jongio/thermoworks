import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DeviceEntry {
	serial: string;
	label: string;
	channels: number[] | "avg";
}

export interface ThermoworksConfig {
	devices: DeviceEntry[];
	refreshSeconds: number;
}

const CONFIG_PATH = join(homedir(), ".thermoworks", "config.json");

const DEFAULT_CONFIG: ThermoworksConfig = {
	devices: [],
	refreshSeconds: 30,
};

export async function loadConfig(): Promise<ThermoworksConfig> {
	try {
		const raw = await readFile(CONFIG_PATH, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (!isValidConfig(parsed)) {
			return DEFAULT_CONFIG;
		}
		const config = { ...DEFAULT_CONFIG, ...parsed };
		// Filter out malformed device entries
		config.devices = config.devices.filter(isValidDeviceEntry);
		return config;
	} catch {
		return DEFAULT_CONFIG;
	}
}

function isValidDeviceEntry(entry: unknown): entry is DeviceEntry {
	if (typeof entry !== "object" || entry === null) return false;
	const obj = entry as Record<string, unknown>;
	if (typeof obj.serial !== "string" || !obj.serial) return false;
	if (typeof obj.label !== "string") return false;
	if (obj.channels === "avg") return true;
	if (Array.isArray(obj.channels) && obj.channels.every((ch) => typeof ch === "number"))
		return true;
	return false;
}

function isValidConfig(raw: unknown): raw is Partial<ThermoworksConfig> {
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
