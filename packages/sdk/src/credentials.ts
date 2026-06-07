export const CREDENTIAL_SERVICE = "thermoworks";
export const CREDENTIAL_ACCOUNT = "credentials";
export const LEGACY_ACCOUNT_EMAIL = "email";
export const LEGACY_ACCOUNT_PASSWORD = "password";

export interface Credentials {
	readonly email: string;
	readonly password: string;
}

export function parseCredentialBlob(blob: string): Credentials | null {
	try {
		const parsed = JSON.parse(blob) as { email?: string; password?: string };
		if (parsed.email && parsed.password) {
			return { email: parsed.email, password: parsed.password };
		}
	} catch {
		// Corrupted blob
	}
	return null;
}

export function serializeCredentials(email: string, password: string): string {
	return JSON.stringify({ email, password });
}

export function resolveEnvCredentials(): Credentials | null {
	const email = process.env.THERMOWORKS_EMAIL;
	const password = process.env.THERMOWORKS_PASSWORD;
	return email && password ? { email, password } : null;
}
