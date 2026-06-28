import type { AlarmSetOptions } from "thermoworks-sdk";
import * as vscode from "vscode";
import { promptTemperature } from "./alarm-config";
import type { ClientManager } from "./client-manager";
import type { CredentialStore } from "./credentials";
import type { ChannelNode } from "./tree/tree-items";

/**
 * Inline "Set Alarm..." command handler for channel tree nodes.
 *
 * Prompts for high and/or low thresholds via input boxes, then calls
 * client.setAlarm() with the provided values.
 */
export async function setAlarmInline(
	node: ChannelNode,
	clientManager: ClientManager,
	credentialStore: CredentialStore,
): Promise<void> {
	const credentials = await credentialStore.getCredentials();
	if (!credentials) {
		vscode.window.showErrorMessage("Not signed in to ThermoWorks. Please sign in first.");
		return;
	}

	const action = await vscode.window.showQuickPick(
		[
			{
				label: "$(arrow-up) High Alarm",
				description: "Set high temperature threshold",
				value: "set-high" as const,
			},
			{
				label: "$(arrow-down) Low Alarm",
				description: "Set low temperature threshold",
				value: "set-low" as const,
			},
			{
				label: "$(arrow-both) Both Alarms",
				description: "Set high and low thresholds",
				value: "set-both" as const,
			},
		],
		{ placeHolder: "Select alarm type to set" },
	);
	if (!action) return;

	const config: AlarmSetOptions = {};

	if (action.value === "set-high" || action.value === "set-both") {
		const value = await promptTemperature("high alarm");
		if (value === undefined) return;
		config.high = { value, enabled: true };
	}

	if (action.value === "set-low" || action.value === "set-both") {
		const value = await promptTemperature("low alarm");
		if (value === undefined) return;
		config.low = { value, enabled: true };
	}

	const client = clientManager.getClient(credentials);
	try {
		await client.setAlarm(node.serial, node.channelNumber, config);
		const parts: string[] = [];
		if (config.high) parts.push(`High=${config.high.value}`);
		if (config.low) parts.push(`Low=${config.low.value}`);
		vscode.window.showInformationMessage(
			`Alarm set on Ch${node.channelNumber}: ${parts.join(", ")}`,
		);
	} catch (err) {
		vscode.window.showErrorMessage(
			`Failed to set alarm: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Inline "Clear Alarm" command handler for channel tree nodes.
 *
 * Clears both high and low alarm thresholds by setting them to disabled.
 */
export async function clearAlarmInline(
	node: ChannelNode,
	clientManager: ClientManager,
	credentialStore: CredentialStore,
): Promise<void> {
	const credentials = await credentialStore.getCredentials();
	if (!credentials) {
		vscode.window.showErrorMessage("Not signed in to ThermoWorks. Please sign in first.");
		return;
	}

	const client = clientManager.getClient(credentials);
	try {
		await client.setAlarm(node.serial, node.channelNumber, {
			high: { value: 0, enabled: false },
			low: { value: 0, enabled: false },
		});
		vscode.window.showInformationMessage(`Alarms cleared on Ch${node.channelNumber}`);
	} catch (err) {
		vscode.window.showErrorMessage(
			`Failed to clear alarms: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}
