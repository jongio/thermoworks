import { startStdio } from "thermoworks-mcp";

export async function mcpStart(): Promise<void> {
	await startStdio();
}
