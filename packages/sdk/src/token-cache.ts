import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_CACHE_DIR = join(homedir(), ".thermoworks");
const DEFAULT_CACHE_PATH = join(DEFAULT_CACHE_DIR, ".token-cache.json");

/** Cached token data persisted to disk. */
export interface TokenCacheData {
	readonly idToken: string;
	readonly refreshToken: string;
	readonly userId: string;
	/** ISO 8601 timestamp of token expiry. */
	readonly expiresAt: string;
	/** Firebase project ID (avoids fetching web config on cache hit). */
	readonly projectId: string;
}

/** Resolve the token cache file path from user input or default. */
export function resolveTokenCachePath(userPath?: string): string {
	return userPath ?? DEFAULT_CACHE_PATH;
}

/** Read cached tokens from disk. Returns null if cache is missing, corrupt, or malformed. */
export async function readTokenCache(cachePath: string): Promise<TokenCacheData | null> {
	try {
		const raw = await readFile(cachePath, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (!isValidCacheData(parsed)) {
			return null;
		}
		return parsed;
	} catch {
		// File missing, permission error, or corrupt JSON - all treated as cache miss
		return null;
	}
}

/** Write token data to the cache file. Creates parent directories if needed. */
export async function writeTokenCache(cachePath: string, data: TokenCacheData): Promise<void> {
	try {
		const dir = dirname(cachePath);
		await mkdir(dir, { recursive: true, mode: 0o700 });
		await writeFile(cachePath, `${JSON.stringify(data, null, 2)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
	} catch {
		// Non-fatal: caching failure shouldn't break auth
	}
}

/** Delete the token cache file (e.g., on logout or credential change). */
export async function invalidateTokenCache(cachePath?: string): Promise<void> {
	const resolved = resolveTokenCachePath(cachePath);
	try {
		await rm(resolved, { force: true });
	} catch {
		// Non-fatal
	}
}

function isValidCacheData(value: unknown): value is TokenCacheData {
	if (typeof value !== "object" || value === null) return false;
	const obj = value as Record<string, unknown>;
	return (
		typeof obj.idToken === "string" &&
		typeof obj.refreshToken === "string" &&
		typeof obj.userId === "string" &&
		typeof obj.expiresAt === "string" &&
		typeof obj.projectId === "string" &&
		obj.idToken.length > 0 &&
		obj.refreshToken.length > 0 &&
		obj.userId.length > 0 &&
		obj.projectId.length > 0 &&
		!Number.isNaN(Date.parse(obj.expiresAt))
	);
}
