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

function isValidConfig(raw: unknown): raw is Partial<ThermoworksCliConfig> {
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

export async function loadConfig(): Promise<ThermoworksCliConfig> {
	try {
		const raw = await readFile(CONFIG_PATH, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (!isValidConfig(parsed)) {
			console.error("Warning: ~/.thermoworks/config.json has invalid format, using defaults.");
			return DEFAULT_CONFIG;
		}
		return { ...DEFAULT_CONFIG, ...parsed };
	} catch (err) {
		if (err instanceof SyntaxError) {
			console.error("Warning: ~/.thermoworks/config.json is corrupted, using defaults.");
		}
		return DEFAULT_CONFIG;
	}
}

export async function saveConfig(config: ThermoworksCliConfig): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
	await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
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
		await mkdir(CACHE_DIR, { recursive: true, mode: 0o700 });
		const entry: CacheEntry = { output, timestamp: Date.now() };
		await writeFile(CACHE_PATH, JSON.stringify(entry), { encoding: "utf8", mode: 0o600 });
	} catch {
		// Non-fatal
	}
}

export function getConfigPath(): string {
	return CONFIG_PATH;
}
