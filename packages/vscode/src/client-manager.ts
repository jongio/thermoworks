import type { Credentials } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

/**
 * Manages a shared ThermoworksCloud instance for the VS Code extension.
 * Both the status bar and tree provider use the same client to avoid
 * duplicate authentication and API calls.
 */
export class ClientManager {
	private client: ThermoworksCloud | undefined;
	private currentEmail: string | undefined;
	private currentPassword: string | undefined;

	getClient(credentials: Credentials): ThermoworksCloud {
		// Reuse existing client if credentials haven't changed
		if (
			this.client &&
			this.currentEmail === credentials.email &&
			this.currentPassword === credentials.password
		) {
			return this.client;
		}
		// Close old client if credentials changed
		this.close();
		this.client = new ThermoworksCloud({
			email: credentials.email,
			password: credentials.password,
		});
		this.currentEmail = credentials.email;
		this.currentPassword = credentials.password;
		return this.client;
	}

	close(): void {
		this.client?.close();
		this.client = undefined;
		this.currentEmail = undefined;
		this.currentPassword = undefined;
	}
}
