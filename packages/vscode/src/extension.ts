import type { DeviceEvent } from "thermoworks-sdk";
import * as vscode from "vscode";
import { configureAlarm } from "./alarm-config";
import { ChartPanel } from "./chart-panel";
import { ClientManager } from "./client-manager";
import { CredentialStore } from "./credentials";
import { renameDevice, resetMinMax, setFanEnabled, setFanTarget } from "./device-control";
import { clearAlarmInline, setAlarmInline } from "./inline-alarm";
import { clearSession, endSession, startSession } from "./session-commands";
import { TemperatureStatusBar } from "./status-bar";
import { showTemperatureGuide } from "./temperature-guide";
import { EventsTreeProvider } from "./tree/events-tree-provider";
import { ThermoworksTreeProvider } from "./tree/thermoworks-tree-provider";
import type { ChannelNode, DeviceNode } from "./tree/tree-items";

let statusBar: TemperatureStatusBar | undefined;

export function activate(context: vscode.ExtensionContext): void {
	const credentialStore = new CredentialStore(context.secrets);
	const clientManager = new ClientManager();

	// ─── Status Bar (existing) ───────────────────────────────────────────
	statusBar = new TemperatureStatusBar(credentialStore, clientManager, context);

	// ─── TreeView Panel ──────────────────────────────────────────────────
	const treeProvider = new ThermoworksTreeProvider(credentialStore, clientManager);
	treeProvider.setGlobalState(context.globalState);
	const treeView = vscode.window.createTreeView("thermoworksPanel", {
		treeDataProvider: treeProvider,
		showCollapseAll: true,
	});
	treeProvider.setTreeView(treeView);

	treeProvider.initialize();
	treeProvider.startAutoRefresh(context);

	// ─── Events View ────────────────────────────────────────────────────
	const eventsProvider = new EventsTreeProvider(credentialStore, clientManager);
	const eventsView = vscode.window.createTreeView("thermoworksEvents", {
		treeDataProvider: eventsProvider,
		showCollapseAll: false,
	});

	// ─── Events Output Channel ──────────────────────────────────────────
	const eventsOutput = vscode.window.createOutputChannel("ThermoWorks Events");

	context.subscriptions.push(
		// Status bar commands
		vscode.commands.registerCommand("thermoworks.login", async () => {
			await statusBar?.login();
			// Sync tree auth state after status bar login
			await treeProvider.initialize();
			await treeProvider.refresh();
		}),
		vscode.commands.registerCommand("thermoworks.logout", async () => {
			await statusBar?.logout();
			// Sync tree auth state after status bar logout
			await treeProvider.signOut();
		}),
		vscode.commands.registerCommand("thermoworks.refresh", () => statusBar?.refresh()),
		vscode.commands.registerCommand("thermoworks.cycleNext", () => {
			statusBar?.cycleNext();
		}),
		vscode.commands.registerCommand("thermoworks.demo", async () => {
			const pick = await vscode.window.showQuickPick(
				[
					{
						label: "$(alert) High Alarm",
						description: "Red background + blink (full panel demo)",
						value: "high" as const,
					},
					{
						label: "$(info) Low Alarm",
						description: "Blue text + blink (full panel demo)",
						value: "low" as const,
					},
					{
						label: "$(flame) Normal",
						description: "Normal readings (full panel demo)",
						value: "normal" as const,
					},
					{
						label: "$(close) Exit Demo",
						description: "Return to real data",
						value: "exit" as const,
					},
				],
				{ placeHolder: "Select demo mode (affects status bar + tree panel)" },
			);
			if (!pick) return;
			if (pick.value === "exit") {
				treeProvider.exitDemoMode();
				statusBar?.simulateAlarm("none");
			} else {
				const alarmState = pick.value === "normal" ? "none" : pick.value;
				treeProvider.enterDemoMode(pick.value === "normal" ? "normal" : pick.value);
				statusBar?.simulateAlarm(alarmState as "none" | "high" | "low");
			}
		}),

		// Tree panel commands
		vscode.commands.registerCommand("thermoworks.signIn", async () => {
			await treeProvider.signIn();
			// Keep the status bar in sync — signing in here must also refresh it.
			await statusBar?.refresh();
		}),
		vscode.commands.registerCommand("thermoworks.signOut", async () => {
			await treeProvider.signOut();
			await statusBar?.refresh();
		}),
		vscode.commands.registerCommand("thermoworks.refreshPanel", () => treeProvider.refresh()),
		vscode.commands.registerCommand("thermoworks.toggleDeviceView", () =>
			treeProvider.toggleDeviceView(),
		),
		vscode.commands.registerCommand("thermoworks.openCloud", () => treeProvider.openCloud()),
		vscode.commands.registerCommand("thermoworks.configureAlarm", () =>
			configureAlarm(clientManager, credentialStore),
		),
		vscode.commands.registerCommand("thermoworks.showEventDetails", (event: DeviceEvent) => {
			const lines = [
				`Event: ${event.eventType}`,
				`Severity: ${event.severity >= 3 ? "Critical" : event.severity === 2 ? "Warning" : "Info"} (${event.severity})`,
				`Device: ${event.deviceId}`,
				...(event.channelId ? [`Channel: ${event.channelId}`] : []),
				`Time: ${event.eventTime.toLocaleString()}`,
				...(event.valueBefore != null || event.valueAfter != null
					? [`Change: ${event.valueBefore ?? "–"} → ${event.valueAfter ?? "–"}`]
					: []),
				...(event.groups?.length ? [`Groups: ${event.groups.join(", ")}`] : []),
				"---",
			];
			eventsOutput.appendLine(lines.join("\n"));
			eventsOutput.show(true);
		}),
		vscode.commands.registerCommand(
			"thermoworks.showTemperatureChart",
			async (serialOrNode: string | { serial?: string }, channelNumber?: string) => {
				const serial = typeof serialOrNode === "string" ? serialOrNode : serialOrNode?.serial;
				if (!serial) {
					vscode.window.showErrorMessage("ThermoWorks: No device serial provided.");
					return;
				}
				await ChartPanel.show(serial, credentialStore, clientManager, context.extensionUri, {
					channelNumber,
				});
			},
		),
		vscode.commands.registerCommand(
			"thermoworks.showArchiveChart",
			async (archiveNode: { serial?: string; archive?: { id: string; label: string | null } }) => {
				const serial = archiveNode?.serial;
				const archive = archiveNode?.archive;
				if (!serial || !archive) {
					vscode.window.showErrorMessage("ThermoWorks: No session selected.");
					return;
				}
				await ChartPanel.show(serial, credentialStore, clientManager, context.extensionUri, {
					archiveId: archive.id,
					archiveLabel: archive.label ?? "Session",
				});
			},
		),
		vscode.commands.registerCommand("thermoworks.showArchiveDetails", (archiveNode) => {
			if (archiveNode?.archive) {
				treeProvider.showArchiveDetails(archiveNode.archive);
			}
		}),
		vscode.commands.registerCommand("thermoworks.refreshArchives", () =>
			treeProvider.refreshArchives(),
		),

		// Session commands
		vscode.commands.registerCommand("thermoworks.startSession", async () => {
			await startSession(clientManager, credentialStore);
			await treeProvider.refresh();
		}),
		vscode.commands.registerCommand("thermoworks.endSession", async () => {
			await endSession(clientManager, credentialStore);
			await treeProvider.refresh();
		}),
		vscode.commands.registerCommand("thermoworks.clearSession", async (node?: DeviceNode) => {
			await clearSession(clientManager, credentialStore, node);
			await treeProvider.refresh();
		}),

		// Inline alarm commands (channel tree actions)
		vscode.commands.registerCommand("thermoworks.setAlarmInline", async (node: ChannelNode) => {
			await setAlarmInline(node, clientManager, credentialStore);
			await treeProvider.refresh();
		}),
		vscode.commands.registerCommand("thermoworks.clearAlarmInline", async (node: ChannelNode) => {
			await clearAlarmInline(node, clientManager, credentialStore);
			await treeProvider.refresh();
		}),

		// Device control commands
		vscode.commands.registerCommand("thermoworks.setFanTarget", async (node: DeviceNode) => {
			if (!node?.serial) {
				vscode.window.showErrorMessage("ThermoWorks: Select a fan-capable device first.");
				return;
			}
			await setFanTarget(node, clientManager, credentialStore);
			await treeProvider.refresh();
		}),
		vscode.commands.registerCommand("thermoworks.setFanEnabled", async (node: DeviceNode) => {
			if (!node?.serial) {
				vscode.window.showErrorMessage("ThermoWorks: Select a fan-capable device first.");
				return;
			}
			await setFanEnabled(node, clientManager, credentialStore);
			await treeProvider.refresh();
		}),
		vscode.commands.registerCommand("thermoworks.renameDevice", async (node: DeviceNode) => {
			if (!node?.serial) {
				vscode.window.showErrorMessage("ThermoWorks: Select a device first.");
				return;
			}
			await renameDevice(node, clientManager, credentialStore);
			await treeProvider.refresh();
		}),
		vscode.commands.registerCommand("thermoworks.resetMinMax", async (node: ChannelNode) => {
			if (!node?.serial) {
				vscode.window.showErrorMessage("ThermoWorks: Select a channel first.");
				return;
			}
			await resetMinMax(node, clientManager, credentialStore);
			await treeProvider.refresh();
		}),
		vscode.commands.registerCommand("thermoworks.addToGroup", async (node: DeviceNode) => {
			if (!node?.serial) {
				vscode.window.showErrorMessage("ThermoWorks: Select a device first.");
				return;
			}
			try {
				const creds = await credentialStore.getCredentials();
				if (!creds) return;
				const client = await clientManager.getClient(creds);
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
					// Clear group cache so it shows up
					treeProvider.clearGroupCache();
				} else {
					await client.addDeviceToGroup(pick.groupId, node.serial);
					vscode.window.showInformationMessage(`Added to "${pick.label}".`);
				}
				await treeProvider.refresh();
			} catch (e) {
				vscode.window.showErrorMessage(
					`Failed to add to group: ${e instanceof Error ? e.message : e}`,
				);
			}
		}),
		vscode.commands.registerCommand("thermoworks.removeFromGroup", async (node: DeviceNode) => {
			if (!node?.serial) {
				vscode.window.showErrorMessage("ThermoWorks: Select a device first.");
				return;
			}
			try {
				const creds = await credentialStore.getCredentials();
				if (!creds) return;
				const client = await clientManager.getClient(creds);
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
			} catch (e) {
				vscode.window.showErrorMessage(
					`Failed to remove from group: ${e instanceof Error ? e.message : e}`,
				);
			}
		}),

		// Events view commands
		vscode.commands.registerCommand("thermoworks.refreshEvents", () => eventsProvider.refresh()),
		vscode.commands.registerCommand(
			"thermoworks.filterEventsByDevice",
			async (node: DeviceNode) => {
				const serial = node?.serial;
				const label = (node?.label as string) ?? serial;
				if (!serial) {
					vscode.window.showErrorMessage("ThermoWorks: No device selected.");
					return;
				}
				eventsProvider.setDeviceFilter(serial, label);
				eventsView.description = label;
			},
		),
		vscode.commands.registerCommand("thermoworks.clearEventsFilter", () => {
			eventsProvider.clearDeviceFilter();
			eventsView.description = undefined;
		}),

		// Temperature guide command
		vscode.commands.registerCommand("thermoworks.showTemperatureGuide", () =>
			showTemperatureGuide(clientManager, credentialStore),
		),

		eventsView,
		eventsProvider,
		treeView,
		treeProvider,
		eventsOutput,
		statusBar,
	);

	statusBar.start();
}

export function deactivate(): void {
	// Disposal handled by context.subscriptions
}
