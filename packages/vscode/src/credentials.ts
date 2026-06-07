import type * as vscode from "vscode";

const SERVICE_NAME = "thermoworks";
const ACCOUNT_CREDENTIALS = "credentials";

// Legacy account names for backward-compatible migration
const LEGACY_ACCOUNT_EMAIL = "email";
const LEGACY_ACCOUNT_PASSWORD = "password";

export interface Credentials {
	readonly email: string;
	readonly password: string;
}

/**
 * Credential store that shares credentials with the ThermoWorks CLI.
 *
 * Resolution order:
 * 1. Environment variables (explicit override, highest priority)
 * 2. OS keychain via keytar (shared source of truth with CLI, atomic JSON blob)
 * 3. Legacy keychain format (separate email/password entries) with auto-migration
 * 4. VS Code SecretStorage (fallback when keytar unavailable)
 *
 * SecretStorage acts as a local cache that is refreshed from keytar on every
 * read so that CLI `auth login` / `auth logout` changes propagate immediately.
 */
export class CredentialStore {
	private readonly secrets: vscode.SecretStorage;

	constructor(secrets: vscode.SecretStorage) {
		this.secrets = secrets;
	}

	async getCredentials(): Promise<Credentials | null> {
		// 1. Environment variables (explicit override)
		const envEmail = process.env.THERMOWORKS_EMAIL;
		const envPassword = process.env.THERMOWORKS_PASSWORD;
		if (envEmail && envPassword) {
			return { email: envEmail, password: envPassword };
		}

		// 2. OS keychain via keytar (shared source of truth with CLI)
		try {
			const keytar = await loadKeytar();
			if (keytar) {
				// Try new atomic format first
				const blob = await keytar.getPassword(SERVICE_NAME, ACCOUNT_CREDENTIALS);
				if (blob) {
					try {
						const parsed = JSON.parse(blob) as { email?: string; password?: string };
						if (parsed.email && parsed.password) {
							await this.syncSecretStorage(parsed.email, parsed.password);
							return { email: parsed.email, password: parsed.password };
						}
					} catch {
						// Corrupted keychain entry — fall through to legacy format
					}
				}

				// Fallback: legacy separate entries - migrate to atomic format
				const keytarEmail = await keytar.getPassword(SERVICE_NAME, LEGACY_ACCOUNT_EMAIL);
				const keytarPassword = await keytar.getPassword(SERVICE_NAME, LEGACY_ACCOUNT_PASSWORD);
				if (keytarEmail && keytarPassword) {
					// Migrate to atomic format in keytar
					await keytar.setPassword(
						SERVICE_NAME,
						ACCOUNT_CREDENTIALS,
						JSON.stringify({ email: keytarEmail, password: keytarPassword }),
					);
					await keytar.deletePassword(SERVICE_NAME, LEGACY_ACCOUNT_EMAIL);
					await keytar.deletePassword(SERVICE_NAME, LEGACY_ACCOUNT_PASSWORD);
					await this.syncSecretStorage(keytarEmail, keytarPassword);
					return { email: keytarEmail, password: keytarPassword };
				}

				// Keytar is available but empty - credentials were deleted (e.g. CLI logout).
				// Clear stale SecretStorage cache so extension reflects the logout.
				await this.clearSecretStorage();
				return null;
			}
		} catch {
			// Keytar unavailable (e.g. remote extension host) - fall through to cache
		}

		// 3. VS Code SecretStorage (fallback cache when keytar unavailable)
		const vsBlob = await this.secrets.get(`${SERVICE_NAME}.${ACCOUNT_CREDENTIALS}`);
		if (vsBlob) {
			const parsed = JSON.parse(vsBlob) as { email?: string; password?: string };
			if (parsed.email && parsed.password) {
				return { email: parsed.email, password: parsed.password };
			}
		}

		// Legacy SecretStorage format fallback
		const vsEmail = await this.secrets.get(`${SERVICE_NAME}.${LEGACY_ACCOUNT_EMAIL}`);
		const vsPassword = await this.secrets.get(`${SERVICE_NAME}.${LEGACY_ACCOUNT_PASSWORD}`);
		if (vsEmail && vsPassword) {
			// Migrate to atomic format
			await this.syncSecretStorage(vsEmail, vsPassword);
			await this.secrets.delete(`${SERVICE_NAME}.${LEGACY_ACCOUNT_EMAIL}`);
			await this.secrets.delete(`${SERVICE_NAME}.${LEGACY_ACCOUNT_PASSWORD}`);
			return { email: vsEmail, password: vsPassword };
		}

		return null;
	}

	async storeCredentials(email: string, password: string): Promise<void> {
		const blob = JSON.stringify({ email, password });

		// Write to keytar first (shared source of truth for CLI)
		try {
			const keytar = await loadKeytar();
			if (keytar) {
				await keytar.setPassword(SERVICE_NAME, ACCOUNT_CREDENTIALS, blob);
			}
		} catch {
			// Non-fatal: CLI won't see credentials but extension works fine
		}

		// Update local SecretStorage cache
		await this.secrets.store(`${SERVICE_NAME}.${ACCOUNT_CREDENTIALS}`, blob);
	}

	async deleteCredentials(): Promise<void> {
		// Delete from keytar first (shared source of truth)
		try {
			const keytar = await loadKeytar();
			if (keytar) {
				await keytar.deletePassword(SERVICE_NAME, ACCOUNT_CREDENTIALS);
				// Clean up any legacy entries
				await keytar.deletePassword(SERVICE_NAME, LEGACY_ACCOUNT_EMAIL);
				await keytar.deletePassword(SERVICE_NAME, LEGACY_ACCOUNT_PASSWORD);
			}
		} catch {
			// Non-fatal
		}

		// Clear local SecretStorage cache
		await this.clearSecretStorage();
	}

	private async syncSecretStorage(email: string, password: string): Promise<void> {
		await this.secrets.store(
			`${SERVICE_NAME}.${ACCOUNT_CREDENTIALS}`,
			JSON.stringify({ email, password }),
		);
	}

	private async clearSecretStorage(): Promise<void> {
		await this.secrets.delete(`${SERVICE_NAME}.${ACCOUNT_CREDENTIALS}`);
		// Clean up any legacy entries
		await this.secrets.delete(`${SERVICE_NAME}.${LEGACY_ACCOUNT_EMAIL}`);
		await this.secrets.delete(`${SERVICE_NAME}.${LEGACY_ACCOUNT_PASSWORD}`);
	}
}

type Keytar = typeof import("@github/keytar");
let _keytar: Keytar | null | undefined;

async function loadKeytar(): Promise<Keytar | null> {
	if (_keytar !== undefined) return _keytar;
	try {
		const mod = await import("@github/keytar");
		_keytar = (mod.default ?? mod) as Keytar;
	} catch {
		_keytar = null;
	}
	return _keytar;
}
