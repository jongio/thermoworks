import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ThermoworksCloud } from "thermoworks-sdk";
import { z } from "zod";

function resolveCredentials(): { email: string; password: string } {
	const email = process.env.THERMOWORKS_EMAIL;
	const password = process.env.THERMOWORKS_PASSWORD;

	if (!email || !password) {
		throw new Error(
			"Missing credentials: set THERMOWORKS_EMAIL and THERMOWORKS_PASSWORD environment variables",
		);
	}

	return { email, password };
}

let cachedClient: ThermoworksCloud | null = null;

function getClient(): ThermoworksCloud {
	if (!cachedClient) {
		const { email, password } = resolveCredentials();
		cachedClient = new ThermoworksCloud({ email, password });
	}
	return cachedClient;
}

/** Reset the cached client (for testing). */
export function resetClient(): void {
	if (cachedClient) {
		cachedClient.close();
		cachedClient = null;
	}
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

async function handleTool<T>(fn: (client: ThermoworksCloud) => Promise<T>): Promise<ToolResult> {
	const client = getClient();
	const result = await fn(client);
	return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

export function createServer(): McpServer {
	const server = new McpServer({
		name: "thermoworks-mcp",
		version: "0.1.0",
	});

	server.registerTool(
		"get_devices",
		{
			description:
				"List all ThermoWorks Cloud devices with status, battery level, and last seen time",
			inputSchema: z.object({}),
		},
		() => handleTool((client) => client.getDevices()),
	);

	server.registerTool(
		"get_device",
		{
			description: "Get detailed information for a specific ThermoWorks device by serial number",
			inputSchema: z.object({
				serial: z.string().describe("The device serial number"),
			}),
		},
		({ serial }) => handleTool((client) => client.getDevice(serial)),
	);

	server.registerTool(
		"get_device_channels",
		{
			description: "Get temperature and sensor readings for all channels on a ThermoWorks device",
			inputSchema: z.object({
				serial: z.string().describe("The device serial number"),
			}),
		},
		({ serial }) => handleTool((client) => client.getAllDeviceChannels(serial)),
	);

	server.registerTool(
		"get_average_temperature",
		{
			description:
				"Get the average temperature across all temperature channels for a ThermoWorks device",
			inputSchema: z.object({
				serial: z.string().describe("The device serial number"),
			}),
		},
		async ({ serial }) => {
			const client = getClient();
			const avg = await client.getAverageTemperature(serial);
			if (!avg) {
				return {
					content: [{ type: "text", text: "No temperature readings available for this device" }],
				};
			}
			return { content: [{ type: "text", text: JSON.stringify(avg, null, 2) }] };
		},
	);

	server.registerTool(
		"get_events",
		{
			description: "Get device events (alarms, status changes, alerts) from ThermoWorks Cloud",
			inputSchema: z.object({
				device_id: z.string().optional().describe("Optional device serial to filter events"),
				event_type: z
					.string()
					.optional()
					.describe("Optional event type filter (e.g., 'Low Battery Alert')"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(500)
					.optional()
					.describe("Maximum number of events to return (default 50, max 500)"),
			}),
		},
		({ device_id, event_type, limit }) =>
			handleTool((client) =>
				client.getEvents({ deviceId: device_id, eventType: event_type, limit }),
			),
	);

	server.registerTool(
		"get_archives",
		{
			description: "Get historical session archives for a ThermoWorks device",
			inputSchema: z.object({
				serial: z.string().describe("The device serial number"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(500)
					.optional()
					.describe("Maximum number of archives to return (default 20, max 500)"),
			}),
		},
		({ serial, limit }) => handleTool((client) => client.getArchives(serial, { limit })),
	);

	server.registerTool(
		"get_temperature_guide",
		{
			description:
				"Get the cooking temperature reference guide with categories and recommendations",
			inputSchema: z.object({}),
		},
		() => handleTool((client) => client.getTemperatureGuide()),
	);

	return server;
}

export async function startServer(): Promise<void> {
	const server = createServer();
	const transport = new StdioServerTransport();

	const shutdown = () => {
		resetClient();
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);

	await server.connect(transport);
}
