import keytar from "keytar";

const SERVICE_NAME = "thermoworks";
const ACCOUNT_EMAIL = "email";
const ACCOUNT_PASSWORD = "password";

export interface Credentials {
	readonly email: string;
	readonly password: string;
}

/**
 * Resolves credentials from available sources.
 *
 * Resolution order:
 * 1. Environment variables (explicit override, good for CI)
 * 2. OS keychain via keytar
 * 3. Returns null if neither available
 */
export async function getCredentials(): Promise<Credentials | null> {
	const envEmail = process.env.THERMOWORKS_EMAIL;
	const envPassword = process.env.THERMOWORKS_PASSWORD;

	if (envEmail && envPassword) {
		return { email: envEmail, password: envPassword };
	}

	try {
		const email = await keytar.getPassword(SERVICE_NAME, ACCOUNT_EMAIL);
		const password = await keytar.getPassword(SERVICE_NAME, ACCOUNT_PASSWORD);

		if (email && password) {
			return { email, password };
		}
	} catch {
		// Keychain not available (e.g., headless CI, container)
	}

	return null;
}

/**
 * Stores credentials in the OS keychain.
 * Throws with a user-friendly message if the keychain is unavailable.
 */
export async function storeCredentials(email: string, password: string): Promise<void> {
	try {
		await keytar.setPassword(SERVICE_NAME, ACCOUNT_EMAIL, email);
		await keytar.setPassword(SERVICE_NAME, ACCOUNT_PASSWORD, password);
	} catch {
		throw new Error("Failed to save credentials. Is the OS keychain available?");
	}
}

/**
 * Removes credentials from the OS keychain.
 * Returns true if credentials were found and deleted.
 */
export async function deleteCredentials(): Promise<boolean> {
	try {
		const deletedEmail = await keytar.deletePassword(SERVICE_NAME, ACCOUNT_EMAIL);
		const deletedPassword = await keytar.deletePassword(SERVICE_NAME, ACCOUNT_PASSWORD);
		return deletedEmail || deletedPassword;
	} catch {
		throw new Error("Failed to remove credentials. Is the OS keychain available?");
	}
}

/**
 * Get the stored email address (for auth status display).
 */
export async function getStoredEmail(): Promise<string | null> {
	try {
		return await keytar.getPassword(SERVICE_NAME, ACCOUNT_EMAIL);
	} catch {
		return null;
	}
}
