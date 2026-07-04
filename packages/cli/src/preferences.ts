import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const PREFERENCES_DIR = join(homedir(), ".thermoworks");
const PREFERENCES_PATH = join(PREFERENCES_DIR, "preferences.json");

/** Local CLI default preferences, stored separately from the statusline config. */
export interface Preferences {
	unit?: "F" | "C";
	device?: string;
	watchInterval?: number;
}

/** Keys the config command understands, in display order. */
export const KNOWN_KEYS = ["unit", "device", "watchInterval"] as const;

export type PreferenceKey = (typeof KNOWN_KEYS)[number];

/** True when the key is a recognized preference key. */
export function isKnownKey(key: string): key is PreferenceKey {
	return (KNOWN_KEYS as readonly string[]).includes(key);
}

/** Result of validating and coercing a preference value. */
export type ValidationResult = { ok: true; value: string | number } | { ok: false; error: string };

/** Validate and coerce a raw string value for a known key. */
export function validatePreferenceValue(key: PreferenceKey, raw: string): ValidationResult {
	switch (key) {
		case "unit": {
			const upper = raw.toUpperCase();
			if (upper !== "F" && upper !== "C") {
				return { ok: false, error: "unit must be F or C" };
			}
			return { ok: true, value: upper };
		}
		case "device": {
			const trimmed = raw.trim();
			if (trimmed.length === 0) {
				return { ok: false, error: "device must be a non-empty serial" };
			}
			return { ok: true, value: trimmed };
		}
		case "watchInterval": {
			const n = Number(raw);
			if (!Number.isFinite(n) || n < 1) {
				return { ok: false, error: "watchInterval must be a number >= 1" };
			}
			return { ok: true, value: n };
		}
	}
}

function isValidPreferences(value: unknown): value is Preferences {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const p = value as Record<string, unknown>;
	if (p.unit !== undefined && p.unit !== "F" && p.unit !== "C") return false;
	if (p.device !== undefined && typeof p.device !== "string") return false;
	if (
		p.watchInterval !== undefined &&
		(typeof p.watchInterval !== "number" || !Number.isFinite(p.watchInterval))
	) {
		return false;
	}
	return true;
}

/** Load preferences, returning an empty object when missing or invalid. */
export async function loadPreferences(): Promise<Preferences> {
	try {
		const raw = await readFile(PREFERENCES_PATH, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (!isValidPreferences(parsed)) {
			console.error("Warning: ~/.thermoworks/preferences.json has invalid format, ignoring it.");
			return {};
		}
		return parsed;
	} catch (err) {
		if (err instanceof SyntaxError) {
			console.error("Warning: ~/.thermoworks/preferences.json is corrupted, ignoring it.");
		}
		return {};
	}
}

/** Persist preferences with owner-only permissions. */
export async function savePreferences(prefs: Preferences): Promise<void> {
	await mkdir(PREFERENCES_DIR, { recursive: true, mode: 0o700 });
	await writeFile(PREFERENCES_PATH, `${JSON.stringify(prefs, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
}

/** Absolute path to the preferences file. */
export function getPreferencesPath(): string {
	return PREFERENCES_PATH;
}
