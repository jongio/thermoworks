import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveCredentials } from "./auth.js";
import { createServer } from "./server.js";

/**
 * Start the MCP server on stdio transport.
 * Used by the CLI `thermoworks mcp start` command.
 */
export async function startStdio(): Promise<void> {
	const credentials = await resolveCredentials();
	if (!credentials) {
		console.error(
			"ThermoWorks credentials not found.\n" +
				"Set THERMOWORKS_EMAIL and THERMOWORKS_PASSWORD environment variables,\n" +
				"or run: thermoworks auth login",
		);
		process.exit(1);
	}

	const server = createServer(credentials);
	const transport = new StdioServerTransport();
	await server.connect(transport);
}
