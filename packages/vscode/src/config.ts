import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_STATUSLINE_CONFIG,
	type DeviceEntry,
	isValidDeviceEntry,
	isValidStatuslineConfig,
	type StatuslineConfig,
} from "thermoworks-sdk";

export type { DeviceEntry, StatuslineConfig };

const CONFIG_PATH = join(homedir(), ".thermoworks", "config.json");

export async function loadConfig(): Promise<StatuslineConfig> {
	try {
		const raw = await readFile(CONFIG_PATH, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (!isValidStatuslineConfig(parsed)) {
			return DEFAULT_STATUSLINE_CONFIG;
		}
		const config = { ...DEFAULT_STATUSLINE_CONFIG, ...parsed };
		// Filter out malformed device entries
		config.devices = config.devices.filter(isValidDeviceEntry);
		return config;
	} catch {
		return DEFAULT_STATUSLINE_CONFIG;
	}
}
