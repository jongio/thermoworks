import * as vscode from "vscode";
import { validateTemperature } from "./alarm-config";
import type { ClientManager } from "./client-manager";
import type { CredentialStore } from "./credentials";
import {
	type ChannelNode,
	type DeviceNode,
	type FanDetailNode,
	getNodeLabel,
} from "./tree/tree-items";

/** A node that carries a device serial — DeviceNode or FanDetailNode. */
type DeviceSerialNode = DeviceNode | FanDetailNode;

/**
 * Set the fan target temperature for a device.
 *
 * Prompts the user for a target temperature, validates it as a finite number,
 * then calls setFanTarget on the SDK. Only meaningful for fan-capable devices.
 */
export async function setFanTarget(
	node: DeviceSerialNode,
	clientManager: ClientManager,
	credentialStore: CredentialStore,
): Promise<void> {
	const credentials = await credentialStore.getCredentials();
	if (!credentials) {
		vscode.window.showErrorMessage("Not signed in to ThermoWorks. Please sign in first.");
		return;
	}

	const input = await vscode.window.showInputBox({
		prompt: "Enter target temperature for the fan controller",
		placeHolder: "e.g. 225",
		validateInput: validateTemperature,
	});

	if (input === undefined) return;

	const targetTemp = Number(input);
	const client = clientManager.getClient(credentials);
	const result = await client.setFanTarget(node.serial, targetTemp);

	if (result.success) {
		vscode.window.showInformationMessage(
			`Target temp set to ${targetTemp}\u00B0 on ${getNodeLabel(node) || node.serial}.`,
		);
	} else {
		vscode.window.showErrorMessage(`Failed to set target temp: ${result.error ?? "unknown error"}`);
	}
}

/**
 * Enable or disable the fan controller for a device.
 *
 * Shows a quick pick to choose enable/disable, then calls setFanEnabled.
 */
export async function setFanEnabled(
	node: DeviceSerialNode,
	clientManager: ClientManager,
	credentialStore: CredentialStore,
): Promise<void> {
	const credentials = await credentialStore.getCredentials();
	if (!credentials) {
		vscode.window.showErrorMessage("Not signed in to ThermoWorks. Please sign in first.");
		return;
	}

	const pick = await vscode.window.showQuickPick(
		[
			{ label: "$(play) Enable Fan", description: "Turn on the fan controller", value: true },
			{
				label: "$(debug-stop) Disable Fan",
				description: "Turn off the fan controller",
				value: false,
			},
		],
		{ placeHolder: "Enable or disable the fan controller" },
	);

	if (!pick) return;

	const client = clientManager.getClient(credentials);
	const result = await client.setFanEnabled(node.serial, pick.value);

	const verb = pick.value ? "enable" : "disable";
	if (result.success) {
		vscode.window.showInformationMessage(`Fan ${verb}d on ${getNodeLabel(node) || node.serial}.`);
	} else {
		vscode.window.showErrorMessage(`Failed to ${verb} fan: ${result.error ?? "unknown error"}`);
	}
}

/**
 * Rename a device via inline tree action.
 *
 * Shows an input box pre-filled with the current device label. On confirm,
 * calls renameDevice on the SDK. Empty input or cancel aborts.
 */
export async function renameDevice(
	node: DeviceNode,
	clientManager: ClientManager,
	credentialStore: CredentialStore,
): Promise<void> {
	const credentials = await credentialStore.getCredentials();
	if (!credentials) {
		vscode.window.showErrorMessage("Not signed in to ThermoWorks. Please sign in first.");
		return;
	}

	const currentLabel = getNodeLabel(node);
	const newName = await vscode.window.showInputBox({
		prompt: "Enter new device name",
		value: currentLabel,
		placeHolder: "e.g. Backyard Smoker",
	});

	// undefined = cancelled, empty string = abort
	if (!newName) return;

	const client = clientManager.getClient(credentials);
	const result = await client.renameDevice(node.serial, newName);

	if (result.success) {
		vscode.window.showInformationMessage(`Device renamed to "${newName}".`);
	} else {
		vscode.window.showErrorMessage(`Failed to rename device: ${result.error ?? "unknown error"}`);
	}
}

/**
 * Reset min/max readings for a channel.
 *
 * Requires explicit confirmation before calling the SDK.
 */
export async function resetMinMax(
	node: ChannelNode,
	clientManager: ClientManager,
	credentialStore: CredentialStore,
): Promise<void> {
	const credentials = await credentialStore.getCredentials();
	if (!credentials) {
		vscode.window.showErrorMessage("Not signed in to ThermoWorks. Please sign in first.");
		return;
	}

	const channelLabel = getNodeLabel(node) || `Ch${node.channelNumber}`;
	const confirm = await vscode.window.showWarningMessage(
		`Reset min/max for ${channelLabel}? This cannot be undone.`,
		{ modal: true },
		"Reset",
	);

	if (confirm !== "Reset") return;

	const client = clientManager.getClient(credentials);
	const result = await client.resetMinMax(node.serial, node.channelNumber);

	if (result.success) {
		vscode.window.showInformationMessage(`Min/max reset for ${channelLabel}.`);
	} else {
		vscode.window.showErrorMessage(`Failed to reset min/max: ${result.error ?? "unknown error"}`);
	}
}
