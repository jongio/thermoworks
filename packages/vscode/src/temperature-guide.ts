import type { TemperatureCategory } from "thermoworks-sdk";
import * as vscode from "vscode";
import type { ClientManager } from "./client-manager";
import type { CredentialStore } from "./credentials";

/**
 * Show the ThermoWorks cooking temperature guide as a QuickPick.
 * Fetches categories from the API and presents label + warnings.
 */
export async function showTemperatureGuide(
	clientManager: ClientManager,
	credentialStore: CredentialStore,
): Promise<void> {
	const creds = await credentialStore.getCredentials();
	if (!creds) {
		vscode.window.showErrorMessage("ThermoWorks: Sign in to view the temperature guide.");
		return;
	}

	let categories: TemperatureCategory[];
	try {
		const client = await clientManager.getClient(creds);
		const guide = await client.getTemperatureGuide();
		categories = guide.categories;
	} catch {
		vscode.window.showErrorMessage("ThermoWorks: Failed to load temperature guide.");
		return;
	}

	if (categories.length === 0) {
		vscode.window.showInformationMessage("ThermoWorks: Temperature guide is empty.");
		return;
	}

	const items = categories.map((cat) => {
		const details: string[] = [];
		if (cat.warning) {
			details.push(cat.warning);
		}
		if (cat.pullWarning) {
			details.push(`Pull: ${cat.pullWarning}`);
		}
		return {
			label: `${cat.icon} ${cat.label}`,
			detail: details.join(" | ") || undefined,
		};
	});

	await vscode.window.showQuickPick(items, {
		placeHolder: "Cooking temperature guide",
		matchOnDetail: true,
	});
}
