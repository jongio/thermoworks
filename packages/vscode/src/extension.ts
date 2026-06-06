import * as vscode from "vscode";
import { CredentialStore } from "./credentials";
import { TemperatureStatusBar } from "./status-bar";

let statusBar: TemperatureStatusBar | undefined;

export function activate(context: vscode.ExtensionContext): void {
	const credentialStore = new CredentialStore(context.secrets);
	statusBar = new TemperatureStatusBar(credentialStore, context);

	context.subscriptions.push(
		vscode.commands.registerCommand("thermoworks.login", () => statusBar?.login()),
		vscode.commands.registerCommand("thermoworks.logout", () => statusBar?.logout()),
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
		statusBar,
	);

	statusBar.start();
}

export function deactivate(): void {
	// Disposal handled by context.subscriptions
}
