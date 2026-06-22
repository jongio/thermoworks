import type { Device } from "thermoworks-sdk";
import * as vscode from "vscode";
import type { ClientManager } from "./client-manager";
import type { CredentialStore } from "./credentials";
import type { DeviceNode } from "./tree/tree-items";

/**
 * Prompts the user to select a device from their account.
 * Returns the selected device or undefined if cancelled/empty.
 */
async function pickDevice(
	credentialStore: CredentialStore,
	clientManager: ClientManager,
	filter?: (device: Device) => boolean,
	placeholder?: string,
): Promise<Device | undefined> {
	const credentials = await credentialStore.getCredentials();
	if (!credentials) {
		vscode.window.showErrorMessage("Not signed in. Please sign in first.");
		return undefined;
	}

	const client = clientManager.getClient(credentials);
	const devices = await client.getDevices();

	const filtered = filter ? devices.filter(filter) : devices;
	if (filtered.length === 0) {
		vscode.window.showInformationMessage(
			filter ? "No devices match the criteria." : "No devices found on your account.",
		);
		return undefined;
	}

	const items = filtered.map((device) => ({
		label: device.label || device.serial,
		description: [device.type, device.status === "online" ? "" : "(Offline)"]
			.filter(Boolean)
			.join(" "),
		device,
	}));

	const pick = await vscode.window.showQuickPick(items, {
		placeHolder: placeholder ?? "Select a device",
	});

	return pick?.device;
}

/**
 * Start a cooking session on a selected device.
 * Prompts for device selection and optional session label.
 */
export async function startSession(
	clientManager: ClientManager,
	credentialStore: CredentialStore,
): Promise<void> {
	const device = await pickDevice(
		credentialStore,
		clientManager,
		undefined,
		"Select device to start session",
	);
	if (!device) return;

	const label = await vscode.window.showInputBox({
		prompt: "Session label (optional)",
		placeHolder: "e.g. Sunday Brisket",
	});
	// undefined = cancelled, empty string = no label
	if (label === undefined) return;

	const credentials = await credentialStore.getCredentials();
	if (!credentials) return;

	const client = clientManager.getClient(credentials);
	const result = await client.startSession(device.serial, label || undefined);

	if (result.success) {
		const deviceName = device.label || device.serial;
		const msg = label
			? `Session started on ${deviceName} ("${label}").`
			: `Session started on ${deviceName}.`;
		vscode.window.showInformationMessage(msg);
	} else {
		vscode.window.showErrorMessage(`Failed to start session: ${result.error ?? "unknown error"}`);
	}
}

/**
 * End a cooking session on a selected device.
 * Only shows devices with active sessions.
 */
export async function endSession(
	clientManager: ClientManager,
	credentialStore: CredentialStore,
): Promise<void> {
	const device = await pickDevice(
		credentialStore,
		clientManager,
		(d) => d.sessionStart != null,
		"Select device to end session",
	);
	if (!device) return;

	const credentials = await credentialStore.getCredentials();
	if (!credentials) return;

	const client = clientManager.getClient(credentials);
	const result = await client.endSession(device.serial);

	if (result.success) {
		const deviceName = device.label || device.serial;
		vscode.window.showInformationMessage(`Session ended on ${deviceName}.`);
	} else {
		vscode.window.showErrorMessage(`Failed to end session: ${result.error ?? "unknown error"}`);
	}
}

/**
 * Clear (discard) the active session on a device.
 * Requires explicit user confirmation before calling the SDK.
 *
 * When called from a tree action, `deviceNode` provides the serial directly
 * so the quick pick is skipped. From the command palette, uses pickDevice.
 */
export async function clearSession(
	clientManager: ClientManager,
	credentialStore: CredentialStore,
	deviceNode?: DeviceNode,
): Promise<void> {
	let serial: string;
	let deviceName: string;

	if (deviceNode) {
		serial = deviceNode.serial;
		deviceName = (deviceNode.label as string) ?? deviceNode.serial;
	} else {
		const device = await pickDevice(
			credentialStore,
			clientManager,
			(d) => d.sessionStart != null,
			"Select device to clear session",
		);
		if (!device) return;
		serial = device.serial;
		deviceName = device.label || device.serial;
	}

	const confirm = await vscode.window.showWarningMessage(
		`Clear session on ${deviceName}? All unsaved session data will be lost.`,
		{ modal: true },
		"Clear Session",
	);

	if (confirm !== "Clear Session") return;

	const credentials = await credentialStore.getCredentials();
	if (!credentials) {
		vscode.window.showErrorMessage("Not signed in. Please sign in first.");
		return;
	}

	const client = clientManager.getClient(credentials);
	const result = await client.clearSession(serial);

	if (result.success) {
		vscode.window.showInformationMessage(`Session cleared on ${deviceName}.`);
	} else {
		vscode.window.showErrorMessage(`Failed to clear session: ${result.error ?? "unknown error"}`);
	}
}
