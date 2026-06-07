import type { Device, DeviceChannel, User } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";
import * as vscode from "vscode";
import type { ClientManager } from "../client-manager";
import type { CredentialStore } from "../credentials";
import { DEMO_DEVICES, DEMO_LATEST_FIRMWARE, DEMO_USER, getDemoChannels } from "../demo-data";
import {
	AccountDetailNode,
	AccountNode,
	ActionNode,
	buildDeviceChildren,
	DeviceNode,
	DevicesFolderNode,
	ErrorNode,
	type TreeNode,
} from "./tree-items";

const DEVICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FIRMWARE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (firmware releases are rare)

interface DeviceCache {
	devices: Device[];
	fetchedAt: number;
}

interface ChannelCache {
	channels: DeviceChannel[];
	fetchedAt: number;
}

interface FirmwareCache {
	latestVersion: string;
	fetchedAt: number;
}

export class ThermoworksTreeProvider
	implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable
{
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private readonly credentialStore: CredentialStore;
	private readonly clientManager: ClientManager;
	private treeView: vscode.TreeView<TreeNode> | undefined;
	private user: User | undefined;
	private deviceCache: DeviceCache | undefined;
	private channelCaches = new Map<string, ChannelCache>();
	private firmwareCaches = new Map<string, FirmwareCache>();
	private firmwareUpdateCount = 0;
	private refreshTimer: ReturnType<typeof setInterval> | undefined;
	private configDisposable: vscode.Disposable | undefined;
	private disposed = false;
	private demoMode: "normal" | "high" | "low" | false = false;

	constructor(credentialStore: CredentialStore, clientManager: ClientManager) {
		this.credentialStore = credentialStore;
		this.clientManager = clientManager;
	}

	setTreeView(view: vscode.TreeView<TreeNode>): void {
		this.treeView = view;
	}

	// ─── TreeDataProvider ────────────────────────────────────────────────────

	getTreeItem(element: TreeNode): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: TreeNode): Promise<TreeNode[]> {
		if (this.disposed) return [];

		// Root level
		if (!element) {
			return this.getRootChildren();
		}

		// Account children
		if (element instanceof AccountNode) {
			const user = this.demoMode ? DEMO_USER : this.user;
			if (user) return this.getAccountChildren(user);
		}

		// Devices folder children
		if (element instanceof DevicesFolderNode) {
			return this.getDeviceNodes();
		}

		// Device children (channels + metadata)
		if (element instanceof DeviceNode) {
			return this.getDeviceChildren(element.serial);
		}

		return [];
	}

	// ─── Public API ──────────────────────────────────────────────────────────

	async signIn(): Promise<void> {
		const email = await vscode.window.showInputBox({
			prompt: "ThermoWorks email address",
			placeHolder: "user@example.com",
			ignoreFocusOut: true,
		});
		if (!email) return;

		const password = await vscode.window.showInputBox({
			prompt: "ThermoWorks password",
			password: true,
			ignoreFocusOut: true,
		});
		if (!password) return;

		const tempClient = new ThermoworksCloud({ email, password });
		try {
			await tempClient.getUser();
		} catch {
			tempClient.close();
			vscode.window.showErrorMessage("ThermoWorks: Login failed - check your email and password.");
			return;
		}
		tempClient.close();

		await this.credentialStore.storeCredentials(email, password);
		this.invalidate();
		await vscode.commands.executeCommand("setContext", "thermoworks.isAuthenticated", true);
		vscode.window.showInformationMessage("ThermoWorks: Signed in successfully.");
		await this.refresh();
	}

	async signOut(): Promise<void> {
		await this.credentialStore.deleteCredentials();
		this.invalidate();
		this.updateBadge(0);
		await vscode.commands.executeCommand("setContext", "thermoworks.isAuthenticated", false);
		vscode.window.showInformationMessage("ThermoWorks: Signed out.");
		this._onDidChangeTreeData.fire(undefined);
	}

	async refresh(): Promise<void> {
		this.deviceCache = undefined;
		this.channelCaches.clear();
		this._onDidChangeTreeData.fire(undefined);
	}

	private async refreshChannelsOnly(): Promise<void> {
		this.channelCaches.clear();
		this._onDidChangeTreeData.fire(undefined);
	}

	openCloud(): void {
		vscode.env.openExternal(vscode.Uri.parse("https://cloud.thermoworks.com"));
	}

	enterDemoMode(mode: "normal" | "high" | "low"): void {
		this.demoMode = mode;
		this.stopAutoRefresh();
		this._onDidChangeTreeData.fire(undefined);
	}

	exitDemoMode(): void {
		this.demoMode = false;
		this._onDidChangeTreeData.fire(undefined);
	}

	startAutoRefresh(context: vscode.ExtensionContext): void {
		this.stopAutoRefresh();

		const getIntervalMs = (): number => {
			const seconds = vscode.workspace
				.getConfiguration("thermoworks")
				.get<number>("refreshInterval", 60);
			return Math.max(seconds, 15) * 1000;
		};

		const scheduleNext = (): void => {
			if (this.disposed) return;
			this.refreshTimer = setTimeout(async () => {
				await this.refreshChannelsOnly();
				scheduleNext();
			}, getIntervalMs());
		};

		scheduleNext();

		// Register config listener only once to avoid accumulating disposed entries
		if (!this.configDisposable) {
			this.configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration("thermoworks.refreshInterval")) {
					this.startAutoRefresh(context);
				}
			});
			context.subscriptions.push(this.configDisposable);
		}
	}

	async initialize(): Promise<void> {
		const creds = await this.credentialStore.getCredentials();
		await vscode.commands.executeCommand("setContext", "thermoworks.isAuthenticated", !!creds);
	}

	dispose(): void {
		this.disposed = true;
		this.stopAutoRefresh();
		this.clientManager.close();
		this._onDidChangeTreeData.dispose();
	}

	// ─── Private: Client Access ─────────────────────────────────────────────

	private async getClient(): Promise<ThermoworksCloud> {
		const creds = await this.credentialStore.getCredentials();
		if (!creds) throw new Error("Not authenticated");
		return this.clientManager.getClient(creds);
	}

	// ─── Private: Tree Building ──────────────────────────────────────────────

	private async getRootChildren(): Promise<TreeNode[]> {
		// Demo mode — use fake data, no credentials needed
		if (this.demoMode) {
			return [
				new AccountNode(DEMO_USER),
				new DevicesFolderNode(DEMO_DEVICES.length, this.firmwareUpdateCount),
			];
		}

		const creds = await this.credentialStore.getCredentials();
		if (!creds) {
			// Welcome view handles the unauthenticated state
			return [];
		}

		try {
			const client = await this.getClient();

			if (!this.user) {
				this.user = await client.getUser();
			}

			const devices = await this.getCachedDevices();

			return [
				new AccountNode(this.user),
				new DevicesFolderNode(devices.length, this.firmwareUpdateCount),
			];
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to load data";
			return [new ErrorNode(message)];
		}
	}

	private getAccountChildren(user: User): TreeNode[] {
		const children: TreeNode[] = [];

		if (user.email) {
			children.push(new AccountDetailNode("Email", user.email, "mail"));
		}
		if (user.displayName) {
			children.push(new AccountDetailNode("Name", user.displayName, "person"));
		}
		if (user.preferredUnits) {
			children.push(new AccountDetailNode("Units", `\u00B0${user.preferredUnits}`, "symbol-unit"));
		}
		if (user.timeZone) {
			children.push(new AccountDetailNode("Timezone", user.timeZone, "globe"));
		}

		children.push(
			new ActionNode(
				"Open ThermoWorks Cloud",
				"thermoworks.openCloud",
				"link-external",
				"thermoworks-action-open-cloud",
			),
		);

		return children;
	}

	private async checkFirmwareOutdated(device: Device): Promise<boolean> {
		if (this.demoMode) {
			const latest = device.type ? DEMO_LATEST_FIRMWARE[device.type] : undefined;
			return !!latest && !!device.firmware && device.firmware !== latest;
		}
		return this.isFirmwareOutdated(device);
	}

	private async getDeviceNodes(): Promise<TreeNode[]> {
		try {
			const devices = this.demoMode ? DEMO_DEVICES : await this.getCachedDevices();
			if (devices.length === 0) {
				this.updateBadge(0);
				return [new ErrorNode("No devices found")];
			}

			const nodes: TreeNode[] = [];
			let alarmCount = 0;
			let firmwareUpdateCount = 0;
			for (const device of devices) {
				const channels = this.demoMode
					? getDemoChannels(device.serial, this.demoMode)
					: await this.getCachedChannels(device.serial);
				const hasAlarm = channels.some((ch) => ch.alarmHigh?.alarming || ch.alarmLow?.alarming);
				if (hasAlarm) alarmCount++;

				const firmwareOutdated = await this.checkFirmwareOutdated(device);
				if (firmwareOutdated) firmwareUpdateCount++;

				nodes.push(new DeviceNode(device, hasAlarm, firmwareOutdated));
			}
			this.updateBadge(alarmCount);
			this.firmwareUpdateCount = firmwareUpdateCount;
			return nodes;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to load devices";
			return [new ErrorNode(message)];
		}
	}

	private async getDeviceChildren(serial: string): Promise<TreeNode[]> {
		try {
			const devices = this.demoMode ? DEMO_DEVICES : await this.getCachedDevices();
			const device = devices.find((d) => d.serial === serial);
			if (!device) return [new ErrorNode("Device not found")];

			const channels = this.demoMode
				? getDemoChannels(serial, this.demoMode)
				: await this.getCachedChannels(serial);

			const firmwareOutdated = await this.checkFirmwareOutdated(device);

			return buildDeviceChildren(device, channels, firmwareOutdated);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to load channels";
			return [new ErrorNode(message)];
		}
	}

	// ─── Private: Caching ────────────────────────────────────────────────────

	private async getCachedDevices(): Promise<Device[]> {
		const now = Date.now();
		if (this.deviceCache && now - this.deviceCache.fetchedAt < DEVICE_CACHE_TTL_MS) {
			return this.deviceCache.devices;
		}

		const client = await this.getClient();
		const devices = await client.getDevices();
		this.deviceCache = { devices, fetchedAt: now };
		return devices;
	}

	private async getCachedChannels(serial: string): Promise<DeviceChannel[]> {
		const now = Date.now();
		const refreshMs = Math.max(
			vscode.workspace.getConfiguration("thermoworks").get<number>("refreshInterval", 60) * 1000,
			15_000,
		);

		const cached = this.channelCaches.get(serial);
		if (cached && now - cached.fetchedAt < refreshMs) {
			return cached.channels;
		}

		const client = await this.getClient();
		const channels = await client.getAllDeviceChannels(serial);
		this.channelCaches.set(serial, { channels, fetchedAt: now });
		return channels;
	}

	private async isFirmwareOutdated(device: Device): Promise<boolean> {
		if (!device.firmware || !device.type || this.demoMode) {
			return false;
		}

		try {
			const now = Date.now();
			const cached = this.firmwareCaches.get(device.type);
			let latestVersion: string;

			if (cached && now - cached.fetchedAt < FIRMWARE_CACHE_TTL_MS) {
				latestVersion = cached.latestVersion;
			} else {
				const client = await this.getClient();
				const info = await client.getFirmwareInfo(device.type);
				latestVersion = info.version;
				this.firmwareCaches.set(device.type, { latestVersion, fetchedAt: now });
			}

			return latestVersion !== "" && device.firmware !== latestVersion;
		} catch {
			// Firmware info not available for this device type - not an error
			return false;
		}
	}

	// ─── Private: Lifecycle ──────────────────────────────────────────────────

	private invalidate(): void {
		this.user = undefined;
		this.deviceCache = undefined;
		this.channelCaches.clear();
		this.clientManager.close();
	}

	private updateBadge(alarmCount: number): void {
		if (!this.treeView) return;
		this.treeView.badge =
			alarmCount > 0
				? {
						value: alarmCount,
						tooltip: `${alarmCount} device${alarmCount > 1 ? "s" : ""} alarming`,
					}
				: undefined;
	}

	private stopAutoRefresh(): void {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = undefined;
		}
	}
}
