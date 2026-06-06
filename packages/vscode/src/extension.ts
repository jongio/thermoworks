import * as vscode from "vscode";
import { CredentialStore } from "./credentials";
import { TemperatureStatusBar } from "./status-bar";
import { ThermoworksTreeProvider } from "./tree/thermoworks-tree-provider";

let statusBar: TemperatureStatusBar | undefined;

export function activate(context: vscode.ExtensionContext): void {
	const credentialStore = new CredentialStore(context.secrets);

	// ─── Status Bar (existing) ───────────────────────────────────────────
	statusBar = new TemperatureStatusBar(credentialStore, context);

	// ─── TreeView Panel ──────────────────────────────────────────────────
	const treeProvider = new ThermoworksTreeProvider(credentialStore);
	const treeView = vscode.window.createTreeView("thermoworksPanel", {
		treeDataProvider: treeProvider,
		showCollapseAll: true,
	});

	treeProvider.initialize();
	treeProvider.startAutoRefresh(context);

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
		vscode.commands.registerCommand("thermoworks.demo", async () => {
			const pick = await vscode.window.showQuickPick(
				[
					{
						label: "$(alert) High Alarm",
						description: "Red background + blink",
						value: "high" as const,
					},
					{ label: "$(info) Low Alarm", description: "Blue text + blink", value: "low" as const },
					{ label: "$(flame) Normal", description: "Clear alarm state", value: "none" as const },
				],
				{ placeHolder: "Select demo alarm mode" },
			);
			if (pick) {
				statusBar?.simulateAlarm(pick.value);
			}
		}),

		// Tree panel commands
		vscode.commands.registerCommand("thermoworks.signIn", () => treeProvider.signIn()),
		vscode.commands.registerCommand("thermoworks.signOut", () => treeProvider.signOut()),
		vscode.commands.registerCommand("thermoworks.refreshPanel", () => treeProvider.refresh()),
		vscode.commands.registerCommand("thermoworks.openCloud", () => treeProvider.openCloud()),

		treeView,
		treeProvider,
		statusBar,
	);

	statusBar.start();
}

export function deactivate(): void {
	// Disposal handled by context.subscriptions
}
