const SERVICE_NAME = "thermoworks";
const ACCOUNT_CREDENTIALS = "credentials";

// Legacy account names for backward-compatible migration
const LEGACY_ACCOUNT_EMAIL = "email";
const LEGACY_ACCOUNT_PASSWORD = "password";

type Keytar = typeof import("@github/keytar");

let _keytar: Keytar | null | undefined;

async function getKeytar(): Promise<Keytar | null> {
	if (_keytar !== undefined) return _keytar;
	try {
		_keytar = (await import("@github/keytar")).default;
	} catch {
		_keytar = null;
	}
	return _keytar;
}

export interface Credentials {
	readonly email: string;
	readonly password: string;
}

/**
 * Resolves credentials from available sources.
 *
 * Resolution order:
 * 1. Environment variables (explicit override, good for CI)
 * 2. OS keychain via keytar (atomic JSON blob)
 * 3. Legacy keychain format (separate email/password entries) with auto-migration
 * 4. Returns null if neither available
 */
export async function getCredentials(): Promise<Credentials | null> {
	const envEmail = process.env.THERMOWORKS_EMAIL;
	const envPassword = process.env.THERMOWORKS_PASSWORD;

	if (envEmail && envPassword) {
		return { email: envEmail, password: envPassword };
	}

	try {
		const keytar = await getKeytar();
		if (!keytar) return null;

		// Try new atomic format first
		const blob = await keytar.getPassword(SERVICE_NAME, ACCOUNT_CREDENTIALS);
		if (blob) {
			const parsed = JSON.parse(blob) as { email?: string; password?: string };
			if (parsed.email && parsed.password) {
				return { email: parsed.email, password: parsed.password };
			}
		}

		// Fallback: read legacy separate entries and migrate
		const legacyEmail = await keytar.getPassword(SERVICE_NAME, LEGACY_ACCOUNT_EMAIL);
		const legacyPassword = await keytar.getPassword(SERVICE_NAME, LEGACY_ACCOUNT_PASSWORD);
		if (legacyEmail && legacyPassword) {
			// Migrate to atomic format
			await keytar.setPassword(
				SERVICE_NAME,
				ACCOUNT_CREDENTIALS,
				JSON.stringify({ email: legacyEmail, password: legacyPassword }),
			);
			await keytar.deletePassword(SERVICE_NAME, LEGACY_ACCOUNT_EMAIL);
			await keytar.deletePassword(SERVICE_NAME, LEGACY_ACCOUNT_PASSWORD);
			return { email: legacyEmail, password: legacyPassword };
		}
	} catch {
		// Keychain not available (e.g., headless CI, container)
	}

	return null;
}

/**
 * Stores credentials in the OS keychain as a single atomic JSON entry.
 * Throws with a user-friendly message if the keychain is unavailable.
 */
export async function storeCredentials(email: string, password: string): Promise<void> {
	try {
		const keytar = await getKeytar();
		if (!keytar) throw new Error("OS keychain not available (keytar failed to load).");

		await keytar.setPassword(
			SERVICE_NAME,
			ACCOUNT_CREDENTIALS,
			JSON.stringify({ email, password }),
		);
	} catch (err) {
		throw new Error("Failed to save credentials. Is the OS keychain available?", { cause: err });
	}
}

/**
 * Removes credentials from the OS keychain.
 * Returns true if credentials were found and deleted.
 */
export async function deleteCredentials(): Promise<boolean> {
	try {
		const keytar = await getKeytar();
		if (!keytar) throw new Error("OS keychain not available (keytar failed to load).");

		const deleted = await keytar.deletePassword(SERVICE_NAME, ACCOUNT_CREDENTIALS);
		// Also clean up any legacy entries
		await keytar.deletePassword(SERVICE_NAME, LEGACY_ACCOUNT_EMAIL);
		await keytar.deletePassword(SERVICE_NAME, LEGACY_ACCOUNT_PASSWORD);
		return deleted;
	} catch (err) {
		throw new Error("Failed to remove credentials. Is the OS keychain available?", { cause: err });
	}
}

/**
 * Get the stored email address (for auth status display).
 */
export async function getStoredEmail(): Promise<string | null> {
	try {
		const keytar = await getKeytar();
		if (!keytar) return null;

		// Try new atomic format
		const blob = await keytar.getPassword(SERVICE_NAME, ACCOUNT_CREDENTIALS);
		if (blob) {
			const parsed = JSON.parse(blob) as { email?: string };
			if (parsed.email) return parsed.email;
		}

		// Fallback: legacy separate entry
		return await keytar.getPassword(SERVICE_NAME, LEGACY_ACCOUNT_EMAIL);
	} catch {
		return null;
	}
}
