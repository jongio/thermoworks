import { startServer } from "thermoworks-mcp";

import { getCredentials } from "../credentials.js";

export async function mcpStart(): Promise<void> {
	// The MCP server reads credentials from THERMOWORKS_EMAIL / THERMOWORKS_PASSWORD.
	// When those aren't already set, bridge in credentials saved via
	// `thermoworks auth login` (OS keychain) so launching through the CLI matches
	// the documented "env vars then keytar" resolution. Explicit env vars win.
	if (!process.env.THERMOWORKS_EMAIL || !process.env.THERMOWORKS_PASSWORD) {
		const creds = await getCredentials();
		if (creds) {
			process.env.THERMOWORKS_EMAIL = creds.email;
			process.env.THERMOWORKS_PASSWORD = creds.password;
		}
	}

	await startServer();
}
