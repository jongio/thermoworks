import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	DEFAULT_STATUSLINE_CONFIG,
	type DeviceEntry,
	isValidStatuslineConfig,
	type StatuslineConfig,
} from "thermoworks-sdk";

export type { DeviceEntry, StatuslineConfig };

const CONFIG_DIR = join(homedir(), ".thermoworks");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const CACHE_DIR = join(CONFIG_DIR, ".cache");
const CACHE_PATH = join(CACHE_DIR, "readings.json");

interface CacheEntry {
	output: string;
	timestamp: number;
}

export async function loadConfig(): Promise<StatuslineConfig> {
	try {
		const raw = await readFile(CONFIG_PATH, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (!isValidStatuslineConfig(parsed)) {
			console.error("Warning: ~/.thermoworks/config.json has invalid format, using defaults.");
			return DEFAULT_STATUSLINE_CONFIG;
		}
		return { ...DEFAULT_STATUSLINE_CONFIG, ...parsed };
	} catch (err) {
		if (err instanceof SyntaxError) {
			console.error("Warning: ~/.thermoworks/config.json is corrupted, using defaults.");
		}
		return DEFAULT_STATUSLINE_CONFIG;
	}
}

export async function saveConfig(config: StatuslineConfig): Promise<void> {
	await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
	await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
}

export async function readCache(ttlMs: number): Promise<string | null> {
	try {
		const raw = await readFile(CACHE_PATH, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"output" in parsed &&
			typeof (parsed as CacheEntry).output === "string" &&
			"timestamp" in parsed &&
			typeof (parsed as CacheEntry).timestamp === "number"
		) {
			const entry = parsed as CacheEntry;
			if (Date.now() - entry.timestamp < ttlMs) {
				return entry.output;
			}
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
