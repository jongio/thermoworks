import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { AlarmSetOptions } from "thermoworks-sdk";
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

	// Clear password from environment to prevent leaking to child processes
	delete process.env.THERMOWORKS_PASSWORD;

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

	server.registerTool(
		"set_alarm",
		{
			description:
				"Set or clear high/low alarm thresholds on a device channel. Provide high_temp and/or low_temp to set thresholds, or clear=true to disable both alarms.",
			inputSchema: z.object({
				serial: z.string().describe("The device serial number"),
				channel: z.number().int().min(1).max(9).describe("Channel number (1-9)"),
				high_temp: z.number().optional().describe("High alarm threshold temperature"),
				low_temp: z.number().optional().describe("Low alarm threshold temperature"),
				clear: z.boolean().optional().describe("If true, disables both alarms on the channel"),
			}),
		},
		async ({ serial, channel, high_temp, low_temp, clear }) => {
			if (high_temp == null && low_temp == null && !clear) {
				return {
					content: [
						{
							type: "text",
							text: "Error: set_alarm requires at least one of high_temp, low_temp, or clear",
						},
					],
				};
			}

			let config: AlarmSetOptions;
			if (clear) {
				config = {
					high: { value: 0, enabled: false },
					low: { value: 0, enabled: false },
				};
			} else {
				config = {};
				if (high_temp != null) {
					config.high = { value: high_temp, enabled: true };
				}
				if (low_temp != null) {
					config.low = { value: low_temp, enabled: true };
				}
			}

			const client = getClient();
			await client.setAlarm(serial, channel, config);
			const updated = await client.getDeviceChannel(serial, channel);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								serial,
								channel,
								alarmHigh: updated.alarmHigh,
								alarmLow: updated.alarmLow,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.registerTool(
		"start_session",
		{
			description: "Start a new monitoring session on a ThermoWorks device",
			inputSchema: z.object({
				serial: z.string().min(1).describe("The device serial number"),
				label: z
					.string()
					.max(200)
					.optional()
					.describe("Optional session label, e.g., 'Brisket Low and Slow'"),
			}),
		},
		({ serial, label }) => handleTool((client) => client.startSession(serial, label)),
	);

	server.registerTool(
		"end_session",
		{
			description: "End the active monitoring session on a ThermoWorks device",
			inputSchema: z.object({
				serial: z.string().min(1).describe("The device serial number"),
			}),
		},
		({ serial }) => handleTool((client) => client.endSession(serial)),
	);

	server.registerTool(
		"get_firmware_status",
		{
			description:
				"Check firmware update status for all ThermoWorks devices. Returns current and latest firmware versions with update availability for each device.",
			inputSchema: z.object({}),
		},
		async () => {
			const client = getClient();
			const devices = await client.getDevices();
			const checkable = devices.filter((d) => d.type && d.firmware);

			const uniqueTypes = [...new Set(checkable.map((d) => d.type as string))];
			const firmwareMap = new Map<string, { version: string }>();
			const settlements = await Promise.allSettled(
				uniqueTypes.map(async (type) => {
					const info = await client.getFirmwareInfo(type);
					return { type, info };
				}),
			);
			for (const settlement of settlements) {
				if (settlement.status === "fulfilled" && settlement.value.info) {
					firmwareMap.set(settlement.value.type, settlement.value.info);
				}
			}

			const results = [];
			for (const device of checkable) {
				const type = device.type as string;
				const latest = firmwareMap.get(type);
				if (!latest) continue;

				const current = device.firmware as string;
				results.push({
					serial: device.serial,
					label: device.label || device.serial,
					type,
					current,
					latest: latest.version,
					updateAvailable: current !== latest.version,
				});
			}

			return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
		},
	);

	server.registerTool(
		"get_archive_detail",
		{
			description:
				"Get full detail for a specific historical session archive, including channel min/max/last readings and computed duration",
			inputSchema: z.object({
				serial: z.string().min(1).describe("The device serial number"),
				archive_id: z.string().min(1).describe("The archive ID"),
			}),
		},
		async ({ serial, archive_id }) => {
			const client = getClient();
			const archive = await client.getArchive(serial, archive_id);
			const durationSeconds =
				archive.start && archive.end
					? Math.round((new Date(archive.end).getTime() - new Date(archive.start).getTime()) / 1000)
					: null;
			return {
				content: [{ type: "text", text: JSON.stringify({ ...archive, durationSeconds }, null, 2) }],
			};
		},
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
