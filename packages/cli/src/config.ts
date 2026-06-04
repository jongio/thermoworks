import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".thermoworks");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const CACHE_DIR = join(CONFIG_DIR, ".cache");
const CACHE_PATH = join(CACHE_DIR, "readings.json");

export interface DeviceEntry {
	serial: string;
	label: string;
	/** Channel numbers to display, or "avg" for average temperature. */
	channels: number[] | "avg";
}

export interface ThermoworksCliConfig {
	/** Devices to show in statusline. */
	devices: DeviceEntry[];
	/** Refresh interval in seconds. */
	refreshSeconds: number;
}

interface CacheEntry {
	output: string;
	timestamp: number;
}

const DEFAULT_CONFIG: ThermoworksCliConfig = {
	devices: [],
	refreshSeconds: 60,
};

export async function loadConfig(): Promise<ThermoworksCliConfig> {
	try {
		const raw = await readFile(CONFIG_PATH, "utf8");
		return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<ThermoworksCliConfig>) };
	} catch {
		return DEFAULT_CONFIG;
	}
}

export async function saveConfig(config: ThermoworksCliConfig): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true });
	await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function readCache(ttlMs: number): Promise<string | null> {
	try {
		const raw = await readFile(CACHE_PATH, "utf8");
		const entry = JSON.parse(raw) as CacheEntry;
		if (Date.now() - entry.timestamp < ttlMs) {
			return entry.output;
		}
	} catch {
		// Cache missing or corrupt
	}
	return null;
}

export async function writeCache(output: string): Promise<void> {
	try {
		await mkdir(CACHE_DIR, { recursive: true });
		const entry: CacheEntry = { output, timestamp: Date.now() };
		await writeFile(CACHE_PATH, JSON.stringify(entry), "utf8");
	} catch {
		// Non-fatal
	}
}

export function getConfigPath(): string {
	return CONFIG_PATH;
}
