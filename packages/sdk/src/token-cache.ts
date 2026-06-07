import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CREDENTIAL_SERVICE } from "./credentials.js";

const DEFAULT_CACHE_DIR = join(homedir(), ".thermoworks");
const DEFAULT_CACHE_PATH = join(DEFAULT_CACHE_DIR, ".token-cache.json");
const TOKEN_CACHE_ACCOUNT = "token-cache";

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

interface KeytarLike {
	getPassword(service: string, account: string): Promise<string | null>;
	setPassword(service: string, account: string, password: string): Promise<void>;
	deletePassword(service: string, account: string): Promise<boolean>;
}

let _keytar: KeytarLike | null | undefined;

async function getKeytar(): Promise<KeytarLike | null> {
	if (_keytar !== undefined) return _keytar;
	try {
		// Dynamic import - @github/keytar is an optional peer dependency
		// @ts-expect-error: keytar may not be installed
		const mod = await import("@github/keytar");
		_keytar = mod.default as KeytarLike;
	} catch {
		_keytar = null;
	}
	return _keytar;
}

/** Resolve the token cache file path from user input or default. */
export function resolveTokenCachePath(userPath?: string): string {
	if (userPath != null) {
		// Reject paths that could escape the intended directory
		if (userPath.includes("..") || userPath.startsWith("\\\\")) {
			throw new Error("tokenCachePath must not contain '..' or UNC paths");
		}
	}
	return userPath ?? DEFAULT_CACHE_PATH;
}

/**
 * Read cached tokens. Tries OS keychain first, falls back to file.
 * Returns null if cache is missing, corrupt, or malformed.
 */
export async function readTokenCache(cachePath: string): Promise<TokenCacheData | null> {
	// Try OS keychain first (secure storage)
	try {
		const keytar = await getKeytar();
		if (keytar) {
			const blob = await keytar.getPassword(CREDENTIAL_SERVICE, TOKEN_CACHE_ACCOUNT);
			if (blob) {
				const parsed: unknown = JSON.parse(blob);
				if (isValidCacheData(parsed)) return parsed;
			}
		}
	} catch {
		// Keychain unavailable, try file fallback
	}

	// File fallback for headless/CI environments
	try {
		const raw = await readFile(cachePath, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (!isValidCacheData(parsed)) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

/**
 * Write token data to cache. Stores in OS keychain when available,
 * falls back to file with restricted permissions.
 */
export async function writeTokenCache(cachePath: string, data: TokenCacheData): Promise<void> {
	const blob = JSON.stringify(data);

	// Try OS keychain first (secure storage)
	try {
		const keytar = await getKeytar();
		if (keytar) {
			await keytar.setPassword(CREDENTIAL_SERVICE, TOKEN_CACHE_ACCOUNT, blob);
			// Remove any stale file cache when keychain is available
			try {
				await rm(cachePath, { force: true });
			} catch {
				// Non-fatal
			}
			return;
		}
	} catch {
		// Keychain unavailable, fall through to file
	}

	// File fallback with restricted permissions
	try {
		const { lstatSync } = await import("node:fs");
		try {
			const stat = lstatSync(cachePath);
			if (stat.isSymbolicLink()) {
				process.emitWarning(
					"Token cache path is a symlink, skipping write for security",
					"ThermoWorksSecurityWarning",
				);
				return;
			}
		} catch {
			// File doesn't exist yet, safe to create
		}
		const dir = dirname(cachePath);
		await mkdir(dir, { recursive: true, mode: 0o700 });
		await writeFile(cachePath, `${blob}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
	} catch (err) {
		process.emitWarning(
			`Token cache write failed: ${err instanceof Error ? err.message : "unknown error"}`,
			"ThermoWorksSecurityWarning",
		);
	}
}

/** Delete the token cache from all storage backends. */
export async function invalidateTokenCache(cachePath?: string): Promise<void> {
	// Clear from OS keychain
	try {
		const keytar = await getKeytar();
		if (keytar) {
			await keytar.deletePassword(CREDENTIAL_SERVICE, TOKEN_CACHE_ACCOUNT);
		}
	} catch {
		// Non-fatal
	}

	// Clear file cache
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
