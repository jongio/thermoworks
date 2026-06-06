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
		statusBar,
	);

	statusBar.start();
}

export function deactivate(): void {
	// Disposal handled by context.subscriptions
}
