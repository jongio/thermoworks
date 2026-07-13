import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { AlarmSetOptions, Device, DeviceChannel } from "thermoworks-sdk";
import { getChannelAlarmState, predictDoneTime, ThermoworksCloud } from "thermoworks-sdk";
import { z } from "zod";

let cachedCreds: { email: string; password: string } | null = null;

function resolveCredentials(): { email: string; password: string } {
	if (cachedCreds) return cachedCreds;

	const email = process.env.THERMOWORKS_EMAIL;
	const password = process.env.THERMOWORKS_PASSWORD;

	if (!email || !password) {
		throw new Error(
			"Missing credentials: set THERMOWORKS_EMAIL and THERMOWORKS_PASSWORD environment variables",
		);
	}

	// Clear password from environment to prevent leaking to child processes
	delete process.env.THERMOWORKS_PASSWORD;

	cachedCreds = { email, password };
	return cachedCreds;
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
	cachedCreds = null;
}

type ToolResult = { content: Array<{ type: "text"; text: string }> };

async function handleTool<T>(fn: (client: ThermoworksCloud) => Promise<T>): Promise<ToolResult> {
	const client = getClient();
	const result = await fn(client);
	return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

function summarizeChannel(channel: DeviceChannel) {
	return {
		number: channel.number,
		label: channel.label,
		type: channel.type,
		value: channel.value,
		units: channel.units,
		status: channel.status,
		alarmState: getChannelAlarmState(channel),
		alarmHigh: channel.alarmHigh,
		alarmLow: channel.alarmLow,
		minimum: channel.minimum,
		maximum: channel.maximum,
		rateOfChange: channel.rateOfChange,
		rateOfChangeUnit: channel.rateOfChangeUnit,
		lastSeen: channel.lastSeen,
	};
}

function summarizeDevice(device: Device, channels: DeviceChannel[]) {
	const activeChannels = channels.filter(
		(channel) => channel.enabled !== false && channel.value != null,
	);
	const summarizedChannels = activeChannels.map(summarizeChannel);
	return {
		serial: device.serial,
		label: device.label || device.serial,
		type: device.type,
		status: device.status,
		battery: device.battery,
		batteryState: device.batteryState,
		wifiStrength: device.wifiStrength,
		lastSeen: device.lastSeen,
		firmware: device.firmware,
		session: {
			active: device.sessionStart != null,
			label: device.sessionLabel,
			start: device.sessionStart,
		},
		channels: summarizedChannels,
		alarmState: summarizedChannels.some((channel) => channel.alarmState === "high")
			? "high"
			: summarizedChannels.some((channel) => channel.alarmState === "low")
				? "low"
				: "none",
	};
}

function summarizeEnabledAlarm(alarm: DeviceChannel["alarmHigh"]) {
	if (!alarm?.enabled) return null;
	return {
		value: alarm.value,
		units: alarm.units,
		alarming: alarm.alarming,
	};
}

type PromptResult = {
	messages: Array<{ role: "user"; content: { type: "text"; text: string } }>;
};

/** Wrap prompt text in the single-user-message shape the MCP prompts API expects. */
function userPrompt(text: string): PromptResult {
	return { messages: [{ role: "user", content: { type: "text", text } }] };
}

/** Instruction for picking which device to work on, honoring an optional serial argument. */
function deviceClause(serial?: string): string {
	return serial?.trim()
		? `Work with device ${serial.trim()}.`
		: "Call get_devices first and pick the device with an active cook. If more than one looks active, ask me which to use.";
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
		"get_live_cook_snapshot",
		{
			description:
				"Get a single live snapshot for current cooks, including devices, channel readings, alarm state, battery, firmware, and active session info",
			inputSchema: z.object({
				serial: z.string().optional().describe("Optional device serial number to snapshot"),
			}),
		},
		async ({ serial }) => {
			const client = getClient();
			const devices = serial ? [await client.getDevice(serial)] : await client.getDevices();
			const snapshots = await Promise.all(
				devices.map(async (device) => {
					const channels = await client.getAllDeviceChannels(device.serial);
					return summarizeDevice(device, channels);
				}),
			);
			const channels = snapshots.flatMap((snapshot) => snapshot.channels);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								generatedAt: new Date().toISOString(),
								deviceCount: snapshots.length,
								channelCount: channels.length,
								alarmingChannelCount: channels.filter((channel) => channel.alarmState !== "none")
									.length,
								devices: snapshots,
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
		"get_alarm_targets",
		{
			description:
				"List armed high and low alarm thresholds across ThermoWorks devices, with current readings and alarming state. Optionally filter to one device serial.",
			inputSchema: z.object({
				serial: z.string().optional().describe("Optional device serial number to inspect"),
			}),
		},
		async ({ serial }) => {
			const client = getClient();
			const devices = serial ? [await client.getDevice(serial)] : await client.getDevices();
			const targetGroups = await Promise.all(
				devices.map(async (device) => {
					const channels = await client.getAllDeviceChannels(device.serial);
					return channels
						.map((channel) => {
							const alarmHigh = summarizeEnabledAlarm(channel.alarmHigh);
							const alarmLow = summarizeEnabledAlarm(channel.alarmLow);
							if (!alarmHigh && !alarmLow) return null;
							return {
								serial: device.serial,
								deviceLabel: device.label || device.serial,
								channel: channel.number != null ? Number(channel.number) : null,
								channelLabel: channel.label ?? null,
								current: {
									value: channel.value,
									units: channel.units,
								},
								alarmHigh,
								alarmLow,
							};
						})
						.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
				}),
			);
			const targets = targetGroups.flat();
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								generatedAt: new Date().toISOString(),
								deviceCount: devices.length,
								targetCount: targets.length,
								targets,
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
		"get_calibration",
		{
			description:
				"Get NIST-traceable calibration records for a ThermoWorks device, including per-channel low and high point adjustments, deviations, and pass/fail results",
			inputSchema: z.object({
				serial: z.string().describe("The device serial number"),
			}),
		},
		({ serial }) => handleTool((client) => client.getCalibration(serial)),
	);

	server.registerTool(
		"get_data_usage",
		{
			description:
				"Get ThermoWorks Cloud data storage usage for the account. Returns the account total by default, or a per-device breakdown when by_device is true",
			inputSchema: z.object({
				by_device: z
					.boolean()
					.optional()
					.describe("Return a per-device breakdown instead of the account total (default false)"),
			}),
		},
		({ by_device }) =>
			by_device
				? handleTool((client) => client.getDataUsageByDevice())
				: handleTool((client) => client.getDataUsage()),
	);

	server.registerTool(
		"get_temperature_history",
		{
			description:
				"Get historical time-series temperature readings for a ThermoWorks device from long-term storage. Useful for analyzing cook trends, rate of temperature rise, and estimating time to a target temperature.",
			inputSchema: z.object({
				serial: z.string().min(1).describe("The device serial number"),
				limit: z
					.number()
					.int()
					.min(1)
					.max(5000)
					.optional()
					.describe("Return only the N most recent readings (default: all)"),
			}),
		},
		async ({ serial, limit }) => {
			const client = getClient();
			const history = await client.getHistory(serial);
			const readings = limit ? history.readings.slice(-limit) : history.readings;
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{ deviceId: history.deviceId, readingCount: readings.length, readings },
							null,
							2,
						),
					},
				],
			};
		},
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
				throw new Error("set_alarm requires at least one of high_temp, low_temp, or clear");
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
		"get_fan_state",
		{
			description:
				"Get the fan controller state for a ThermoWorks device (connection status, target temperature, channel, and current level). Returns null when the device has no fan controller.",
			inputSchema: z.object({
				serial: z.string().min(1).describe("The device serial number"),
			}),
		},
		async ({ serial }) => {
			const client = getClient();
			const state = await client.getFanState(serial);
			if (state === null) {
				return {
					content: [{ type: "text", text: `No fan controller found for device ${serial}` }],
				};
			}
			return { content: [{ type: "text", text: JSON.stringify(state, null, 2) }] };
		},
	);

	server.registerTool(
		"set_fan_target",
		{
			description:
				"Set the fan controller target temperature for a ThermoWorks device. The controller drives the fan to hold this temperature.",
			inputSchema: z.object({
				serial: z.string().min(1).describe("The device serial number"),
				target_temp: z
					.number()
					.finite()
					.describe("Target temperature to hold, in the device's configured units"),
			}),
		},
		({ serial, target_temp }) => handleTool((client) => client.setFanTarget(serial, target_temp)),
	);

	server.registerTool(
		"set_fan_enabled",
		{
			description:
				"Enable or disable the fan controller connection for a ThermoWorks device. Set enabled=true to turn the controller on, false to turn it off.",
			inputSchema: z.object({
				serial: z.string().min(1).describe("The device serial number"),
				enabled: z.boolean().describe("True to enable the fan controller, false to disable it"),
			}),
		},
		({ serial, enabled }) => handleTool((client) => client.setFanEnabled(serial, enabled)),
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
		"search_archives",
		{
			description:
				"Search historical session archives across all devices. Useful when you don't know which device holds a specific cook session.",
			inputSchema: z.object({
				query: z
					.string()
					.optional()
					.describe(
						"Text to match against archive label, device label, or device serial (case-insensitive)",
					),
				limit: z
					.number()
					.int()
					.min(1)
					.max(50)
					.optional()
					.describe("Maximum results to return (default 10, max 50)"),
				date_from: z
					.string()
					.optional()
					.describe("Filter archives starting on or after this ISO date (e.g. 2024-06-01)"),
				date_to: z
					.string()
					.optional()
					.describe("Filter archives starting on or before this ISO date (e.g. 2024-06-30)"),
			}),
		},
		async ({ query, limit, date_from, date_to }) => {
			const client = getClient();
			const effectiveLimit = limit ?? 10;
			const devices = await client.getDevices();

			const dateFrom = date_from ? new Date(date_from) : null;
			const dateTo = date_to ? new Date(date_to) : null;
			const queryLower = query?.toLowerCase() ?? null;

			const allResults: Array<{
				deviceSerial: string;
				deviceLabel: string;
				archiveId: string;
				label: string | null;
				start: Date | null;
				channelCount: number;
				readingCount: number | null;
			}> = [];

			await Promise.all(
				devices.map(async (device) => {
					const archives = await client.getArchives(device.serial);
					for (const archive of archives) {
						if (queryLower) {
							const fields = [archive.label, archive.deviceLabel, device.label, device.serial];
							const matches = fields.some((f) => f?.toLowerCase().includes(queryLower));
							if (!matches) continue;
						}

						if (dateFrom && archive.start) {
							if (new Date(archive.start).getTime() < dateFrom.getTime()) continue;
						}
						if (dateTo && archive.start) {
							if (new Date(archive.start).getTime() > dateTo.getTime()) continue;
						}
						// Skip archives with no start date when date filters are active
						if ((dateFrom || dateTo) && !archive.start) continue;

						allResults.push({
							deviceSerial: device.serial,
							deviceLabel: device.label || device.serial,
							archiveId: archive.id,
							label: archive.label,
							start: archive.start,
							channelCount: archive.channels?.length ?? 0,
							readingCount: archive.count,
						});
					}
				}),
			);

			allResults.sort((a, b) => {
				const timeA = a.start ? new Date(a.start).getTime() : 0;
				const timeB = b.start ? new Date(b.start).getTime() : 0;
				return timeB - timeA;
			});

			const limited = allResults.slice(0, effectiveLimit);
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{ totalMatches: allResults.length, returned: limited.length, archives: limited },
							null,
							2,
						),
					},
				],
			};
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

	server.registerTool(
		"get_eta",
		{
			description:
				"Predict when a probe channel will reach its target temperature based on the current rate of change. Uses the high alarm value as the target. Returns estimated minutes, confidence level, and a formatted time.",
			inputSchema: z.object({
				serial: z.string().min(1).describe("The device serial number"),
				channel: z.number().int().min(1).max(9).describe("Channel number (1-9)"),
			}),
		},
		async ({ serial, channel }) => {
			const client = getClient();
			const ch = await client.getDeviceChannel(serial, channel);

			const current = ch.value;
			const rate = ch.rateOfChange;
			const target = ch.alarmHigh?.enabled ? ch.alarmHigh.value : null;

			if (current == null) {
				return {
					content: [{ type: "text", text: `Channel ${channel} has no current reading` }],
				};
			}

			if (target == null) {
				return {
					content: [
						{
							type: "text",
							text: `Channel ${channel} has no high alarm target set. Set a high alarm to enable ETA predictions.`,
						},
					],
				};
			}

			if (rate == null || rate <= 0) {
				return {
					content: [
						{
							type: "text",
							text: `Channel ${channel} is not actively rising (rate: ${rate ?? "unknown"}). Cannot estimate done time.`,
						},
					],
				};
			}

			const prediction = predictDoneTime(current, target, rate);

			if (prediction.estimatedMinutes == null) {
				return {
					content: [
						{
							type: "text",
							text: `Unable to estimate done time for channel ${channel}. Temperature may be stalling.`,
						},
					],
				};
			}

			const minutes = prediction.estimatedMinutes;
			let formatted: string;
			if (minutes === 0) {
				formatted = "Already at target!";
			} else if (minutes < 60) {
				formatted = `~${minutes} minutes remaining`;
			} else {
				const hrs = Math.floor(minutes / 60);
				const rem = minutes % 60;
				formatted = rem > 0 ? `~${hrs}h ${rem}min remaining` : `~${hrs}h remaining`;
			}

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								serial,
								channel,
								current,
								target,
								rateOfChange: rate,
								units: ch.units,
								prediction: {
									estimatedMinutes: prediction.estimatedMinutes,
									estimatedTime: prediction.estimatedTime,
									confidence: prediction.confidence,
									method: prediction.method,
								},
								formatted,
							},
							null,
							2,
						),
					},
				],
			};
		},
	);

	server.registerPrompt(
		"diagnose_cook",
		{
			title: "Diagnose the current cook",
			description:
				"Walk the live cook and report whether temps are climbing, stalled, or need attention, with next steps.",
			argsSchema: {
				serial: z
					.string()
					.optional()
					.describe("Device serial number. Leave empty to pick the active device."),
			},
		},
		({ serial }) =>
			userPrompt(
				`Diagnose the current cook and tell me if it needs attention.

${deviceClause(serial)}

Steps:
1. Call get_live_cook_snapshot for the device to read every channel: current temp, alarm state, and rate of change.
2. Call get_temperature_history with a limit around 60 to see the recent trend for the pit and the meat probes.
3. Classify each probe as climbing, holding, stalled, or dropping. A meat probe stuck between 150F and 170F with a near-zero rate is a stall, not a fault.
4. Compare the pit temp against its target band and flag any drift over about 15F.
5. Report overall status, anything that needs action now, and how the cook is tracking. If a probe has a high alarm set, call get_eta for it.

Keep it short and tied to the readings you got back.`,
			),
	);

	server.registerPrompt(
		"when_to_wrap",
		{
			title: "Decide when to wrap",
			description:
				"Evaluate wrap timing for a brisket or pork butt against the stall, and call whether to wrap now, wait, or that the stall already broke.",
			argsSchema: {
				serial: z
					.string()
					.optional()
					.describe("Device serial number. Leave empty to pick the active device."),
				channel: z
					.string()
					.optional()
					.describe("Meat probe channel number. Leave empty to use the meat probe."),
			},
		},
		({ serial, channel }) => {
			const channelClause = channel?.trim()
				? `Evaluate channel ${channel.trim()}.`
				: "Use the meat probe channel, the one measuring the brisket or pork rather than the pit.";
			return userPrompt(
				`Tell me whether to wrap now.

${deviceClause(serial)} ${channelClause}

The Texas crutch (wrapping in foil or butcher paper) pushes the meat through the stall, the long plateau near 150F to 170F where evaporative cooling holds the temperature flat.

Steps:
1. Call get_device_channels or get_live_cook_snapshot to read the meat probe current temp and rate of change.
2. Call get_temperature_history with a limit around 90 and look at the recent readings for that probe.
3. Decide:
   - Below the stall band and still climbing: too early, keep cooking.
   - Inside 150F to 170F with the rate near zero for a sustained stretch: this is the stall, wrapping now speeds it up. Say wrap.
   - Above 170F and climbing again: the stall already broke, wrapping mainly helps bark and moisture, so it is optional.
4. Give a one line call (wrap now, wait, or stall already broke) plus the temp and trend you based it on.`,
			);
		},
	);

	server.registerPrompt(
		"food_safety_check",
		{
			title: "Check food safety",
			description:
				"Confirm the cook cleared the danger zone in time and reached a safe internal temperature for the cut.",
			argsSchema: {
				serial: z
					.string()
					.optional()
					.describe("Device serial number. Leave empty to pick the active device."),
			},
		},
		({ serial }) =>
			userPrompt(
				`Check the food safety of this cook.

${deviceClause(serial)}

Steps:
1. Call get_temperature_guide for the recommended safe internal temperatures by cut.
2. Call get_live_cook_snapshot for the current probe temps and get_temperature_history with a limit around 200 for how they got there.
3. Danger zone is 40F to 140F. Most cuts should clear 140F within about 4 hours of the surface entering that range. Seared whole-muscle beef and pork can be more lenient; poultry and ground meat are strict. From the history, estimate how long the probe sat between 40F and 140F.
4. Compare the current or final internal temp against the guide for the cut. If you do not know the cut, ask.
5. Report whether the danger-zone time looks safe, whether the internal temp reached a safe finish, and any specific concern.`,
			),
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
