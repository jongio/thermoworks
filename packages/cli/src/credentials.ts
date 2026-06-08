import {
	CREDENTIAL_ACCOUNT,
	CREDENTIAL_SERVICE,
	type Credentials,
	LEGACY_ACCOUNT_EMAIL,
	LEGACY_ACCOUNT_PASSWORD,
	parseCredentialBlob,
	resolveEnvCredentials,
	serializeCredentials,
} from "thermoworks-sdk";

export type { Credentials } from "thermoworks-sdk";

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
	const envCreds = resolveEnvCredentials();
	if (envCreds) return envCreds;

	try {
		const keytar = await getKeytar();
		if (!keytar) return null;

		// Try new atomic format first
		const blob = await keytar.getPassword(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT);
		if (blob) {
			const creds = parseCredentialBlob(blob);
			if (creds) return creds;
		}

		// Fallback: read legacy separate entries and migrate
		const legacyEmail = await keytar.getPassword(CREDENTIAL_SERVICE, LEGACY_ACCOUNT_EMAIL);
		const legacyPassword = await keytar.getPassword(CREDENTIAL_SERVICE, LEGACY_ACCOUNT_PASSWORD);
		if (legacyEmail && legacyPassword) {
			// Migrate to atomic format
			await keytar.setPassword(
				CREDENTIAL_SERVICE,
				CREDENTIAL_ACCOUNT,
				serializeCredentials(legacyEmail, legacyPassword),
			);
			await keytar.deletePassword(CREDENTIAL_SERVICE, LEGACY_ACCOUNT_EMAIL);
			await keytar.deletePassword(CREDENTIAL_SERVICE, LEGACY_ACCOUNT_PASSWORD);
			return { email: legacyEmail, password: legacyPassword };
		}
	} catch (err) {
		process.emitWarning(
			`Keychain access failed: ${err instanceof Error ? err.message : "unknown error"}`,
			"ThermoWorksSecurityWarning",
		);
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
			CREDENTIAL_SERVICE,
			CREDENTIAL_ACCOUNT,
			serializeCredentials(email, password),
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

		const deleted = await keytar.deletePassword(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT);
		// Also clean up any legacy entries
		await keytar.deletePassword(CREDENTIAL_SERVICE, LEGACY_ACCOUNT_EMAIL);
		await keytar.deletePassword(CREDENTIAL_SERVICE, LEGACY_ACCOUNT_PASSWORD);
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
		const blob = await keytar.getPassword(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT);
		if (blob) {
			const creds = parseCredentialBlob(blob);
			if (creds) return creds.email;
		}

		// Fallback: legacy separate entry
		return await keytar.getPassword(CREDENTIAL_SERVICE, LEGACY_ACCOUNT_EMAIL);
	} catch {
		return null;
	}
}
