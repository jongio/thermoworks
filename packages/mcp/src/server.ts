import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AuthError, NetworkError, NotFoundError, ThermoworksCloud } from "thermoworks-sdk";
import { z } from "zod";
import type { Credentials } from "./auth.js";

export function createServer(credentials: Credentials): McpServer {
	const client = new ThermoworksCloud({
		email: credentials.email,
		password: credentials.password,
	});
	const server = new McpServer({
		name: "thermoworks",
		version: "0.1.0",
	});
	const closeServer = server.close.bind(server);

	server.close = async () => {
		try {
			await closeServer();
		} finally {
			client.close();
		}
	};

	function textContent(text: string): CallToolResult {
		return {
			content: [{ type: "text", text }],
		};
	}

	function jsonContent(value: unknown): CallToolResult {
		return textContent(JSON.stringify(value, null, 2));
	}

	async function withClient<T>(fn: (client: ThermoworksCloud) => Promise<T>): Promise<T> {
		try {
			return await fn(client);
		} catch (err) {
			if (err instanceof NotFoundError) throw new Error("Resource not found");
			if (err instanceof AuthError) throw new Error("Authentication failed");
			if (err instanceof NetworkError) throw new Error("Service unavailable");
			throw new Error("An unexpected error occurred");
		}
	}

	server.tool(
		"get_devices",
		"List all ThermoWorks devices with status, battery, and last seen time",
		{},
		async () => {
			const devices = await withClient((client) => client.getDevices());
			return jsonContent(
				devices.map((device) => ({
					serial: device.serial,
					label: device.label,
					type: device.type,
					status: device.status,
					battery: device.battery,
					lastSeen: device.lastSeen?.toISOString() ?? null,
				})),
			);
		},
	);

	server.tool(
		"get_device",
		"Get detailed information about a specific device by serial number",
		{ serial: z.string().describe("Device serial number") },
		async ({ serial }) => {
			const device = await withClient((client) => client.getDevice(serial));
			return jsonContent({
				serial: device.serial,
				label: device.label,
				type: device.type,
				status: device.status,
				battery: device.battery,
				firmware: device.firmware,
				lastSeen: device.lastSeen?.toISOString() ?? null,
				sessionLabel: device.sessionLabel,
				notes: device.notes,
			});
		},
	);

	server.tool(
		"get_device_channels",
		"Get all temperature/sensor channel readings for a device",
		{ serial: z.string().describe("Device serial number") },
		async ({ serial }) => {
			const channels = await withClient((client) => client.getAllDeviceChannels(serial));
			return jsonContent(
				channels.map((channel, index) => ({
					channel: index + 1,
					label: channel.label,
					value: channel.value,
					units: channel.units,
					status: channel.status,
					alarmHigh: channel.alarmHigh
						? {
								enabled: channel.alarmHigh.enabled,
								alarming: channel.alarmHigh.alarming,
								value: channel.alarmHigh.value,
							}
						: null,
					alarmLow: channel.alarmLow
						? {
								enabled: channel.alarmLow.enabled,
								alarming: channel.alarmLow.alarming,
								value: channel.alarmLow.value,
							}
						: null,
					minimum: channel.minimum
						? {
								value: channel.minimum.value,
								date: channel.minimum.date?.toISOString() ?? null,
							}
						: null,
					maximum: channel.maximum
						? {
								value: channel.maximum.value,
								date: channel.maximum.date?.toISOString() ?? null,
							}
						: null,
				})),
			);
		},
	);

	server.tool(
		"get_average_temperature",
		"Get the average temperature across all channels of a device",
		{ serial: z.string().describe("Device serial number") },
		async ({ serial }) => {
			const average = await withClient((client) => client.getAverageTemperature(serial));
			if (!average) {
				return textContent("No temperature readings available");
			}

			return jsonContent(average);
		},
	);

	server.tool(
		"get_events",
		"Get device events (alarms, status changes, alerts)",
		{
			serial: z.string().optional().describe("Filter by device serial number"),
			event_type: z.string().optional().describe("Filter by event type"),
			limit: z
				.number()
				.int()
				.min(1)
				.max(500)
				.optional()
				.describe("Maximum events to return (default 50)"),
		},
		async ({ serial, event_type, limit }) => {
			const events = await withClient((client) =>
				client.getEvents({
					deviceId: serial,
					eventType: event_type,
					limit,
				}),
			);
			return jsonContent(
				events.map((event) => ({
					id: event.id,
					eventType: event.eventType,
					severity: event.severity,
					eventTime: event.eventTime.toISOString(),
					deviceId: event.deviceId,
					channelId: event.channelId,
					valueBefore: event.valueBefore,
					valueAfter: event.valueAfter,
				})),
			);
		},
	);

	server.tool(
		"get_archives",
		"Get historical session archives for a device",
		{
			serial: z.string().describe("Device serial number"),
			limit: z
				.number()
				.int()
				.min(1)
				.max(500)
				.optional()
				.describe("Maximum archives to return (default 20)"),
		},
		async ({ serial, limit }) => {
			const archives = await withClient((client) => client.getArchives(serial, { limit }));
			return jsonContent(
				archives.map((archive) => ({
					id: archive.id,
					label: archive.label,
					start: archive.start?.toISOString() ?? null,
					end: archive.end?.toISOString() ?? null,
					count: archive.count,
					type: archive.type,
					notes: archive.notes,
				})),
			);
		},
	);

	server.tool(
		"get_temperature_guide",
		"Get cooking temperature reference guide with categories and recommended temperatures",
		{},
		async () => {
			const guide = await withClient((client) => client.getTemperatureGuide());
			return jsonContent(guide);
		},
	);

	return server;
}
