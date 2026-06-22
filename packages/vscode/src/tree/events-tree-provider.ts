import type { DeviceEvent } from "thermoworks-sdk";
import * as vscode from "vscode";
import type { ClientManager } from "../client-manager";
import type { CredentialStore } from "../credentials";
import { ErrorNode, EventNode, EventsFolderNode, type TreeNode } from "./tree-items";

/**
 * Dedicated tree data provider for the Events view.
 *
 * Shows recent device events with severity icons, time-ago descriptions,
 * and value change details. Supports account-wide and per-device filtering.
 */
export class EventsTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private readonly credentialStore: CredentialStore;
	private readonly clientManager: ClientManager;
	private deviceFilter: { serial: string; label: string } | undefined;
	private disposed = false;

	constructor(credentialStore: CredentialStore, clientManager: ClientManager) {
		this.credentialStore = credentialStore;
		this.clientManager = clientManager;
	}

	getTreeItem(element: TreeNode): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: TreeNode): Promise<TreeNode[]> {
		if (this.disposed) return [];

		// Only root produces children (flat list under a folder node)
		if (element instanceof EventsFolderNode) {
			return this.fetchEvents();
		}

		// Root level: show the folder node
		if (!element) {
			return this.getRootChildren();
		}

		return [];
	}

	// ─── Public API ──────────────────────────────────────────────────────────

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	setDeviceFilter(serial: string, label: string): void {
		this.deviceFilter = { serial, label };
		this._onDidChangeTreeData.fire(undefined);
	}

	clearDeviceFilter(): void {
		this.deviceFilter = undefined;
		this._onDidChangeTreeData.fire(undefined);
	}

	getDeviceFilter(): { serial: string; label: string } | undefined {
		return this.deviceFilter;
	}

	dispose(): void {
		this.disposed = true;
		this._onDidChangeTreeData.dispose();
	}

	// ─── Private ─────────────────────────────────────────────────────────────

	private async getRootChildren(): Promise<TreeNode[]> {
		const creds = await this.credentialStore.getCredentials();
		if (!creds) {
			return [new ErrorNode("Sign in to view events")];
		}

		try {
			const events = await this.fetchEvents();
			const folderLabel = this.deviceFilter ? `Events (${this.deviceFilter.label})` : "Events";
			const folder = new EventsFolderNode(events.length);
			// Override label if filtered
			if (this.deviceFilter) {
				folder.label = folderLabel;
			}
			if (events.length === 0) {
				return [new ErrorNode("No events found")];
			}
			// Return events directly (flat list)
			return events;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to load events";
			return [new ErrorNode(message)];
		}
	}

	private async fetchEvents(): Promise<TreeNode[]> {
		const creds = await this.credentialStore.getCredentials();
		if (!creds) return [];

		const client = this.clientManager.getClient(creds);
		const limit = vscode.workspace.getConfiguration("thermoworks").get<number>("eventsLimit", 20);

		let events: DeviceEvent[];
		if (this.deviceFilter) {
			events = await client.getDeviceEvents(this.deviceFilter.serial, limit);
		} else {
			events = await client.getEvents({ limit });
		}

		return events.map((event) => new EventNode(event));
	}
}
