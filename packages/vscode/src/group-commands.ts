import * as vscode from "vscode";
import type { ClientManager } from "./client-manager";
import type { CredentialStore } from "./credentials";
import type { ThermoworksTreeProvider } from "./tree/thermoworks-tree-provider";
import type { DeviceNode } from "./tree/tree-items";

/**
 * Add a device to an existing group or create a new group.
 *
 * Shows a QuickPick with existing groups and a "Create New Group…" option.
 * When creating a new group, prompts for a name and creates it with the
 * device already added.
 */
export async function addToGroup(
	node: DeviceNode,
	clientManager: ClientManager,
	credentialStore: CredentialStore,
	treeProvider: ThermoworksTreeProvider,
): Promise<void> {
	const creds = await credentialStore.getCredentials();
	if (!creds) return;
	const client = clientManager.getClient(creds);
	const groups = await client.getDeviceGroups();

	const CREATE_NEW = "$(add) Create New Group…";
	const items = [
		...groups.filter((g) => g.name).map((g) => ({ label: g.name, groupId: g.id })),
		{ label: CREATE_NEW, groupId: "__new__" },
	];
	const pick = await vscode.window.showQuickPick(items, {
		placeHolder: "Select a group or create a new one",
	});
	if (!pick) return;

	if (pick.groupId === "__new__") {
		const name = await vscode.window.showInputBox({
			prompt: "New group name",
			placeHolder: "e.g. Backyard, Kitchen",
			ignoreFocusOut: true,
		});
		if (!name) return;
		await client.createDeviceGroup(name, [node.serial]);
		vscode.window.showInformationMessage(`Created "${name}" and added device.`);
		treeProvider.clearGroupCache();
	} else {
		await client.addDeviceToGroup(pick.groupId, node.serial);
		vscode.window.showInformationMessage(`Added to "${pick.label}".`);
	}
	await treeProvider.refresh();
}

/**
 * Remove a device from one of its groups.
 *
 * If the device belongs to multiple groups, prompts the user to choose which
 * group to remove from. If only in one group, removes directly.
 */
export async function removeFromGroup(
	node: DeviceNode,
	clientManager: ClientManager,
	credentialStore: CredentialStore,
	treeProvider: ThermoworksTreeProvider,
): Promise<void> {
	const creds = await credentialStore.getCredentials();
	if (!creds) return;
	const client = clientManager.getClient(creds);
	const groups = await client.getDeviceGroups();
	const deviceGroups = groups.filter((g) => g.devices.includes(node.serial));
	if (deviceGroups.length === 0) {
		vscode.window.showInformationMessage("Device is not in any group.");
		return;
	}
	let groupId: string;
	if (deviceGroups.length === 1) {
		groupId = deviceGroups[0]?.id ?? "";
	} else {
		const pick = await vscode.window.showQuickPick(
			deviceGroups.map((g) => ({ label: g.name || g.id, groupId: g.id })),
			{ placeHolder: "Remove from which group?" },
		);
		if (!pick) return;
		groupId = pick.groupId;
	}
	await client.removeDeviceFromGroup(groupId, node.serial);
	vscode.window.showInformationMessage("Removed from group.");
	await treeProvider.refresh();
}
