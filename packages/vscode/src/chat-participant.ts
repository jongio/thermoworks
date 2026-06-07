import type { Device, DeviceChannel, DeviceEvent } from "thermoworks-sdk";
import * as vscode from "vscode";
import type { ClientManager } from "./client-manager";
import type { CredentialStore } from "./credentials";

/** Intent categories detected from user prompts. */
export type ChatIntent = "temperature" | "events" | "status" | "session" | "unknown";

const TEMPERATURE_KEYWORDS = ["temperature", "temp", "reading", "degrees", "hot", "cold", "warm"];
const EVENT_KEYWORDS = ["event", "alarm", "alert", "history", "notification"];
const STATUS_KEYWORDS = ["status", "device", "battery", "online", "offline", "signal", "wifi"];
const SESSION_KEYWORDS = ["session", "cook", "cooking", "timer", "duration", "long", "started"];

/**
 * Detect user intent from a chat prompt using keyword matching.
 * Returns the most specific intent based on keyword density.
 */
export function detectIntent(prompt: string): ChatIntent {
	const lower = prompt.toLowerCase();

	const scores: Record<ChatIntent, number> = {
		temperature: 0,
		events: 0,
		status: 0,
		session: 0,
		unknown: 0,
	};

	for (const kw of TEMPERATURE_KEYWORDS) {
		if (lower.includes(kw)) scores.temperature++;
	}
	for (const kw of EVENT_KEYWORDS) {
		if (lower.includes(kw)) scores.events++;
	}
	for (const kw of STATUS_KEYWORDS) {
		if (lower.includes(kw)) scores.status++;
	}
	for (const kw of SESSION_KEYWORDS) {
		if (lower.includes(kw)) scores.session++;
	}

	const best = Object.entries(scores)
		.filter(([key]) => key !== "unknown")
		.sort((a, b) => b[1] - a[1])[0];

	if (best && best[1] > 0) return best[0] as ChatIntent;
	return "unknown";
}

/** Format a channel reading as a markdown string. */
function formatChannel(device: Device, channel: DeviceChannel): string {
	if (channel.value == null || channel.units == null) return "";
	const label = channel.label || `Ch${channel.number || "?"}`;
	const deviceLabel = device.label || device.serial;
	const value = Math.round(channel.value);
	const alarm = formatAlarmStatus(channel);
	return `| ${deviceLabel} | ${label} | ${value}\u00B0${channel.units} | ${alarm} |`;
}

/** Format alarm status for a channel. */
function formatAlarmStatus(channel: DeviceChannel): string {
	if (channel.alarmHigh?.alarming) return "\u26A0\uFE0F HIGH";
	if (channel.alarmLow?.alarming) return "\u26A0\uFE0F LOW";
	return "\u2705 OK";
}

/** Format a device event as a markdown list item. */
function formatEvent(event: DeviceEvent): string {
	const time = event.eventTime.toLocaleString();
	const detail = event.valueAfter ? ` (${event.valueBefore} \u2192 ${event.valueAfter})` : "";
	return `- **${event.eventType}**${detail} - ${time}`;
}

/** Format session duration from a start date. */
function formatDuration(start: Date): string {
	const ms = Date.now() - start.getTime();
	const hours = Math.floor(ms / 3_600_000);
	const minutes = Math.floor((ms % 3_600_000) / 60_000);
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

/** Handle temperature intent - show current readings for all devices. */
async function handleTemperature(
	client: ReturnType<ClientManager["getClient"]>,
	stream: vscode.ChatResponseStream,
): Promise<void> {
	const devices = await client.getDevices();
	if (devices.length === 0) {
		stream.markdown("No devices found on your account.");
		return;
	}

	stream.markdown("## \uD83C\uDF21\uFE0F Current Temperatures\n\n");
	stream.markdown("| Device | Channel | Temp | Status |\n");
	stream.markdown("|--------|---------|------|--------|\n");

	let hasReadings = false;

	const results = await Promise.all(
		devices.map(async (device) => ({
			device,
			channels: await client.getAllDeviceChannels(device.serial),
		})),
	);

	for (const { device, channels } of results) {
		const tempChannels = channels.filter(
			(ch) => ch.value != null && ch.units != null && ch.units !== "H",
		);
		for (const ch of tempChannels) {
			const line = formatChannel(device, ch);
			if (line) {
				stream.markdown(`${line}\n`);
				hasReadings = true;
			}
		}
	}

	if (!hasReadings) {
		stream.markdown("\n_No temperature readings available. Devices may be offline._");
	}
}

/** Handle events intent - show recent alarm/event history. */
async function handleEvents(
	client: ReturnType<ClientManager["getClient"]>,
	stream: vscode.ChatResponseStream,
): Promise<void> {
	const events = await client.getEvents({ limit: 10 });
	if (events.length === 0) {
		stream.markdown("No recent events found.");
		return;
	}

	stream.markdown("## \uD83D\uDD14 Recent Events\n\n");
	for (const event of events) {
		stream.markdown(`${formatEvent(event)}\n`);
	}
}

/** Handle status intent - show device info (battery, connectivity, firmware). */
async function handleStatus(
	client: ReturnType<ClientManager["getClient"]>,
	stream: vscode.ChatResponseStream,
): Promise<void> {
	const devices = await client.getDevices();
	if (devices.length === 0) {
		stream.markdown("No devices found on your account.");
		return;
	}

	stream.markdown("## \uD83D\uDCF1 Device Status\n\n");
	stream.markdown("| Device | Type | Status | Battery | Last Seen |\n");
	stream.markdown("|--------|------|--------|---------|----------|\n");

	for (const device of devices) {
		const label = device.label || device.serial;
		const type = device.type || "unknown";
		const status = device.status || "unknown";
		const battery = device.battery != null ? `${device.battery}%` : "-";
		const lastSeen = device.lastSeen ? device.lastSeen.toLocaleString() : "-";
		stream.markdown(`| ${label} | ${type} | ${status} | ${battery} | ${lastSeen} |\n`);
	}
}

/** Handle session intent - show active cooking sessions. */
async function handleSession(
	client: ReturnType<ClientManager["getClient"]>,
	stream: vscode.ChatResponseStream,
): Promise<void> {
	const devices = await client.getDevices();
	const activeSessions = devices.filter((d) => d.sessionStart != null);

	if (activeSessions.length === 0) {
		stream.markdown("No active cooking sessions found.");
		return;
	}

	stream.markdown("## \uD83D\uDD25 Active Sessions\n\n");

	for (const device of activeSessions) {
		const label = device.label || device.serial;
		const sessionLabel = device.sessionLabel || "Unnamed session";
		const duration = formatDuration(device.sessionStart as Date);
		stream.markdown(`### ${label} - ${sessionLabel}\n\n`);
		stream.markdown(`- **Duration**: ${duration}\n`);
		stream.markdown(`- **Started**: ${(device.sessionStart as Date).toLocaleString()}\n`);

		const channels = await client.getAllDeviceChannels(device.serial);
		const tempChannels = channels.filter(
			(ch) => ch.value != null && ch.units != null && ch.units !== "H",
		);
		if (tempChannels.length > 0) {
			stream.markdown("- **Current readings**:\n");
			for (const ch of tempChannels) {
				const chLabel = ch.label || `Ch${ch.number || "?"}`;
				stream.markdown(`  - ${chLabel}: ${Math.round(ch.value as number)}\u00B0${ch.units}\n`);
			}
		}
		stream.markdown("\n");
	}
}

/**
 * The main chat request handler for the @thermoworks participant.
 * Detects intent from the user prompt, fetches relevant data via the SDK,
 * and streams formatted markdown to the chat response.
 */
export function createChatHandler(
	credentialStore: CredentialStore,
	clientManager: ClientManager,
): vscode.ChatRequestHandler {
	return async (
		request: vscode.ChatRequest,
		_context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		_token: vscode.CancellationToken,
	): Promise<void> => {
		const credentials = await credentialStore.getCredentials();
		if (!credentials) {
			stream.markdown(
				"You're not signed in to ThermoWorks. " +
					"Run the **ThermoWorks: Login** command or use `thermoworks auth login` in your terminal to connect your account.",
			);
			return;
		}

		const intent = detectIntent(request.prompt);
		const client = clientManager.getClient(credentials);

		try {
			switch (intent) {
				case "temperature":
					await handleTemperature(client, stream);
					break;
				case "events":
					await handleEvents(client, stream);
					break;
				case "status":
					await handleStatus(client, stream);
					break;
				case "session":
					await handleSession(client, stream);
					break;
				case "unknown":
					stream.markdown(
						"I can help you with your ThermoWorks devices. Try asking about:\n\n" +
							"- **Temperatures** - current readings from your devices\n" +
							"- **Events** - recent alarms and alerts\n" +
							"- **Status** - device battery, connectivity, and info\n" +
							"- **Sessions** - active cooking session duration and readings\n",
					);
					break;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			stream.markdown(
				`Something went wrong fetching data from ThermoWorks Cloud: ${message}\n\n` +
					"_Try running **ThermoWorks: Login** if your session has expired._",
			);
		}
	};
}

/**
 * Register the @thermoworks chat participant with VS Code.
 * Returns a disposable that should be added to extension subscriptions.
 */
export function registerChatParticipant(
	credentialStore: CredentialStore,
	clientManager: ClientManager,
): vscode.Disposable {
	const handler = createChatHandler(credentialStore, clientManager);
	const participant = vscode.chat.createChatParticipant("thermoworks", handler);
	participant.iconPath = vscode.Uri.joinPath(
		vscode.extensions.getExtension("jongio.thermoworks")?.extensionUri ?? vscode.Uri.file(""),
		"images",
		"icon.png",
	);
	return participant;
}
