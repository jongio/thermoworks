import { createHash } from "node:crypto";
import type { Credentials } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

function hashCredentials(credentials: Credentials): string {
	return createHash("sha256").update(`${credentials.email}\0${credentials.password}`).digest("hex");
}

/**
 * Manages a shared ThermoworksCloud instance for the VS Code extension.
 * Both the status bar and tree provider use the same client to avoid
 * duplicate authentication and API calls.
 */
export class ClientManager {
	private client: ThermoworksCloud | undefined;
	private credentialHash: string | undefined;

	getClient(credentials: Credentials): ThermoworksCloud {
		const hash = hashCredentials(credentials);
		// Reuse existing client if credentials haven't changed
		if (this.client && this.credentialHash === hash) {
			return this.client;
		}
		// Close old client if credentials changed
		this.close();
		this.client = new ThermoworksCloud({
			email: credentials.email,
			password: credentials.password,
		});
		this.credentialHash = hash;
		return this.client;
	}

	close(): void {
		this.client?.close();
		this.client = undefined;
		this.credentialHash = undefined;
	}
}
