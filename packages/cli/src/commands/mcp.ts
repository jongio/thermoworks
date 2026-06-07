import { startServer } from "thermoworks-mcp";

export async function mcpStart(): Promise<void> {
	await startServer();
}
