import type { AlarmSetOptions, Device, DeviceChannel, ThermoworksCloud } from "thermoworks-sdk";
import * as vscode from "vscode";
import type { ClientManager } from "./client-manager";
import type { CredentialStore } from "./credentials";

/** Action choice for the alarm configuration flow. */
type AlarmAction = "set-high" | "set-low" | "set-both" | "clear";

/**
 * Interactive alarm configuration command.
 *
 * Flow:
 * 1. Authenticate and get client
 * 2. Fetch devices → QuickPick to select device
 * 3. Fetch channels for selected device → QuickPick to select channel
 * 4. QuickPick: Set High / Set Low / Set Both / Clear Alarms
 * 5. InputBox for temperature value(s)
 * 6. Call client.setAlarm()
 * 7. Show confirmation notification
 */
export async function configureAlarm(
	clientManager: ClientManager,
	credentialStore: CredentialStore,
): Promise<void> {
	const credentials = await credentialStore.getCredentials();
	if (!credentials) {
		vscode.window.showErrorMessage("Not signed in to ThermoWorks. Please sign in first.");
		return;
	}

	const client = clientManager.getClient(credentials);

	// Step 1: Select device
	const device = await pickDevice(client);
	if (!device) return;

	// Step 2: Select channel
	const channelNumber = await pickChannel(client, device.serial);
	if (channelNumber === undefined) return;

	// Step 3: Select action
	const action = await pickAction();
	if (!action) return;

	// Step 4: Get temperature values and execute
	if (action === "clear") {
		await clearAlarms(client, device.serial, channelNumber, device.label);
	} else {
		await setAlarms(client, device.serial, channelNumber, action, device.label);
	}
}

async function pickDevice(client: ThermoworksCloud): Promise<Device | undefined> {
	let devices: Device[];
	try {
		devices = await client.getDevices();
	} catch (err) {
		vscode.window.showErrorMessage(
			`Failed to fetch devices: ${err instanceof Error ? err.message : String(err)}`,
		);
		return undefined;
	}

	if (devices.length === 0) {
		vscode.window.showInformationMessage("No ThermoWorks devices found.");
		return undefined;
	}

	const items = devices.map((d) => ({
		label: d.label ?? d.serial,
		description: d.label ? d.serial : undefined,
		device: d,
	}));

	const pick = await vscode.window.showQuickPick(items, {
		placeHolder: "Select a device to configure alarms",
	});

	return pick?.device;
}

async function pickChannel(client: ThermoworksCloud, serial: string): Promise<number | undefined> {
	let channels: DeviceChannel[];
	try {
		channels = await client.getAllDeviceChannels(serial);
	} catch (err) {
		vscode.window.showErrorMessage(
			`Failed to fetch channels: ${err instanceof Error ? err.message : String(err)}`,
		);
		return undefined;
	}

	if (channels.length === 0) {
		vscode.window.showInformationMessage("No channels found for this device.");
		return undefined;
	}

	const items = channels.map((ch) => {
		const num = ch.number ? Number.parseInt(ch.number, 10) : 0;
		const tempStr = ch.value != null && ch.units ? `${ch.value}\u00B0${ch.units}` : "no reading";
		const alarmInfo = formatCurrentAlarms(ch);
		return {
			label: ch.label ?? `Channel ${ch.number ?? "?"}`,
			description: tempStr,
			detail: alarmInfo || undefined,
			channelNumber: num,
		};
	});

	const pick = await vscode.window.showQuickPick(items, {
		placeHolder: "Select a channel",
	});

	return pick?.channelNumber;
}

function formatCurrentAlarms(ch: DeviceChannel): string {
	const parts: string[] = [];
	if (ch.alarmHigh?.enabled && ch.alarmHigh.value != null) {
		parts.push(`High: ${ch.alarmHigh.value}\u00B0${ch.alarmHigh.units ?? ""}`);
	}
	if (ch.alarmLow?.enabled && ch.alarmLow.value != null) {
		parts.push(`Low: ${ch.alarmLow.value}\u00B0${ch.alarmLow.units ?? ""}`);
	}
	return parts.length > 0 ? `Current alarms: ${parts.join(", ")}` : "";
}

async function pickAction(): Promise<AlarmAction | undefined> {
	const items: { label: string; description: string; value: AlarmAction }[] = [
		{
			label: "$(arrow-up) Set High Alarm",
			description: "Set high temperature threshold",
			value: "set-high",
		},
		{
			label: "$(arrow-down) Set Low Alarm",
			description: "Set low temperature threshold",
			value: "set-low",
		},
		{
			label: "$(arrow-both) Set Both Alarms",
			description: "Set high and low thresholds",
			value: "set-both",
		},
		{
			label: "$(close) Clear Alarms",
			description: "Disable all alarms on this channel",
			value: "clear",
		},
	];

	const pick = await vscode.window.showQuickPick(items, {
		placeHolder: "Choose alarm action",
	});

	return pick?.value;
}

/**
 * Prompt for a temperature value via InputBox.
 * Returns the parsed number or undefined if cancelled/invalid.
 */
export async function promptTemperature(label: string): Promise<number | undefined> {
	const input = await vscode.window.showInputBox({
		prompt: `Enter ${label} temperature value`,
		placeHolder: "e.g. 275",
		validateInput: validateTemperature,
	});

	if (input === undefined) return undefined;
	return Number(input);
}

/** Validate that a string is a finite number. Returns error message or null. */
export function validateTemperature(value: string): string | null {
	if (value.trim() === "") return "Temperature value is required";
	const n = Number(value);
	if (!Number.isFinite(n)) return "Must be a valid number";
	return null;
}

async function setAlarms(
	client: ThermoworksCloud,
	serial: string,
	channel: number,
	action: "set-high" | "set-low" | "set-both",
	deviceLabel: string | null,
): Promise<void> {
	const config: AlarmSetOptions = {};

	if (action === "set-high" || action === "set-both") {
		const value = await promptTemperature("high alarm");
		if (value === undefined) return;
		config.high = { value, enabled: true };
	}

	if (action === "set-low" || action === "set-both") {
		const value = await promptTemperature("low alarm");
		if (value === undefined) return;
		config.low = { value, enabled: true };
	}

	try {
		await client.setAlarm(serial, channel, config);
		const name = deviceLabel ?? serial;
		const parts: string[] = [];
		if (config.high) parts.push(`High=${config.high.value}`);
		if (config.low) parts.push(`Low=${config.low.value}`);
		vscode.window.showInformationMessage(`Alarm set on ${name} Ch${channel}: ${parts.join(", ")}`);
	} catch (err) {
		vscode.window.showErrorMessage(
			`Failed to set alarm: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

async function clearAlarms(
	client: ThermoworksCloud,
	serial: string,
	channel: number,
	deviceLabel: string | null,
): Promise<void> {
	try {
		await client.setAlarm(serial, channel, {
			high: { value: 0, enabled: false },
			low: { value: 0, enabled: false },
		});
		const name = deviceLabel ?? serial;
		vscode.window.showInformationMessage(`Alarms cleared on ${name} Ch${channel}`);
	} catch (err) {
		vscode.window.showErrorMessage(
			`Failed to clear alarms: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}
