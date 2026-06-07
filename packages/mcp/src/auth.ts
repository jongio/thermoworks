import {
	CREDENTIAL_ACCOUNT,
	CREDENTIAL_SERVICE,
	type Credentials,
	parseCredentialBlob,
	resolveEnvCredentials,
} from "thermoworks-sdk";

export type { Credentials };

/**
 * Resolve credentials for the MCP server.
 *
 * Resolution order:
 * 1. Environment variables (THERMOWORKS_EMAIL + THERMOWORKS_PASSWORD)
 * 2. OS keychain via @github/keytar
 * 3. Returns null if neither available
 */
export async function resolveCredentials(): Promise<Credentials | null> {
	const envCreds = resolveEnvCredentials();
	if (envCreds) return envCreds;

	try {
		const keytar = (await import("@github/keytar")).default;
		const blob = await keytar.getPassword(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT);
		if (blob) {
			const creds = parseCredentialBlob(blob);
			if (creds) return creds;
		}
	} catch {
		// keytar not available
	}

	return null;
}
