import type {
	Archive,
	ChannelLabelMap,
	Device,
	DeviceChannel,
	DeviceGroup,
	User,
} from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";
import * as vscode from "vscode";
import type { ClientManager } from "../client-manager";
import { loadConfig } from "../config";
import type { CredentialStore } from "../credentials";
import {
	DEMO_ARCHIVES,
	DEMO_DEVICES,
	DEMO_LATEST_FIRMWARE,
	DEMO_USER,
	getDemoChannels,
} from "../demo-data";
import { type DeviceSnapshot, DeviceStream } from "../device-stream";
import {
	AccountDetailNode,
	AccountNode,
	ActionNode,
	ArchiveChannelNode,
	ArchiveNode,
	ArchivesFolderNode,
	buildDeviceChildren,
	CalibrationFolderNode,
	CalibrationRecordNode,
	ChannelsFolderNode,
	DetailsFolderNode,
	DeviceGroupFolderNode,
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

interface ArchiveCache {
	archives: Archive[];
	fetchedAt: number;
}

interface AvgTempCache {
	value: { value: number; units: string } | null;
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
	private archiveCaches = new Map<string, ArchiveCache>();
	private avgTempCaches = new Map<string, AvgTempCache>();
	private inflightDevices: Promise<Device[]> | undefined;
	private groupCache: { groups: DeviceGroup[]; fetchedAt: number } | undefined;
	private groupedView = false;
	private firmwareUpdateCount = 0;
	private deviceStream: DeviceStream | undefined;
	private configDisposable: vscode.Disposable | undefined;
	private disposed = false;
	private demoMode: "normal" | "high" | "low" | false = false;
	private outputChannel: vscode.OutputChannel | undefined;
	private globalState: vscode.Memento | undefined;

	constructor(credentialStore: CredentialStore, clientManager: ClientManager) {
		this.credentialStore = credentialStore;
		this.clientManager = clientManager;
	}

	setGlobalState(state: vscode.Memento): void {
		this.globalState = state;
		// Restore persisted device cache on startup (rehydrate Date fields)
		const persisted = state.get<{ devices: Device[]; fetchedAt: number }>(
			"thermoworks.deviceCache",
		);
		if (persisted && persisted.devices.length > 0) {
			const devices = persisted.devices.map((d) => ({
				...d,
				lastSeen: d.lastSeen ? new Date(d.lastSeen) : null,
				sessionStart: d.sessionStart ? new Date(d.sessionStart) : null,
			})) as Device[];
			this.deviceCache = { devices, fetchedAt: persisted.fetchedAt };
		}
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

		// Device group folder — show devices in that group
		if (element instanceof DeviceGroupFolderNode) {
			return this.getGroupDeviceNodes(element.deviceSerials);
		}

		// Device children (channels + metadata)
		if (element instanceof DeviceNode) {
			return this.getDeviceChildren(element.serial);
		}

		// Channels folder — return pre-built channel nodes
		if (element instanceof ChannelsFolderNode) {
			return element.channels;
		}

		// Details folder — return pre-built detail nodes
		if (element instanceof DetailsFolderNode) {
			return element.details;
		}

		// Archives folder children
		if (element instanceof ArchivesFolderNode) {
			return this.getArchiveNodes(element.serial);
		}

		// Archive children (channel summaries)
		if (element instanceof ArchiveNode) {
			return this.getArchiveChildren(element.archive, element.serial);
		}

		// Calibration folder children
		if (element instanceof CalibrationFolderNode) {
			return this.getCalibrationNodes(element.serial);
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
		this.deviceStream?.setDevices([]);
		this.updateBadge(0);
		await vscode.commands.executeCommand("setContext", "thermoworks.isAuthenticated", false);
		vscode.window.showInformationMessage("ThermoWorks: Signed out.");
		this._onDidChangeTreeData.fire(undefined);
	}

	async refresh(): Promise<void> {
		this.deviceCache = undefined;
		this.channelCaches.clear();
		this.archiveCaches.clear();
		this.avgTempCaches.clear();
		this._onDidChangeTreeData.fire(undefined);
		void this.syncStreamDevices();
	}

	async refreshArchives(): Promise<void> {
		this.archiveCaches.clear();
		this._onDidChangeTreeData.fire(undefined);
	}

	toggleDeviceView(): void {
		this.groupedView = !this.groupedView;
		void vscode.commands.executeCommand("setContext", "thermoworks.groupedView", this.groupedView);
		this._onDidChangeTreeData.fire(undefined);
	}

	clearGroupCache(): void {
		this.groupCache = undefined;
	}

	private async fetchChannelsForStream(serial: string): Promise<DeviceChannel[]> {
		const client = await this.getClient();
		return client.getAllDeviceChannels(serial);
	}

	/** Apply a live channel snapshot to the cache and refresh affected nodes. */
	private onStreamSnapshot(snapshot: DeviceSnapshot): void {
		if (this.disposed || this.demoMode) return;
		this.channelCaches.set(snapshot.serial, {
			channels: snapshot.channels,
			fetchedAt: Date.now(),
		});
		this._onDidChangeTreeData.fire(undefined);
	}

	/** Point the live stream at the current device set (or clear it when signed out). */
	private async syncStreamDevices(): Promise<void> {
		if (!this.deviceStream || this.demoMode) return;
		const creds = await this.credentialStore.getCredentials();
		if (!creds) {
			this.deviceStream.setDevices([]);
			return;
		}
		try {
			const devices = await this.getCachedDevices();
			this.deviceStream.setDevices(devices.map((d) => d.serial));
		} catch {
			// Device list unavailable right now; the next refresh will retry.
		}
	}

	openCloud(): void {
		vscode.env.openExternal(vscode.Uri.parse("https://cloud.thermoworks.com"));
	}

	showArchiveDetails(archive: Archive): void {
		if (!this.outputChannel) {
			this.outputChannel = vscode.window.createOutputChannel("ThermoWorks Archives");
		}
		const ch = this.outputChannel;
		ch.clear();
		ch.appendLine(`=== ${archive.label || "Unnamed Session"} ===`);
		ch.appendLine("");
		if (archive.start) ch.appendLine(`Start: ${archive.start.toLocaleString()}`);
		if (archive.end) ch.appendLine(`End:   ${archive.end.toLocaleString()}`);
		if (archive.count != null) ch.appendLine(`Readings: ${archive.count}`);
		if (archive.notes) ch.appendLine(`Notes: ${archive.notes}`);
		ch.appendLine("");

		if (archive.channels && archive.channels.length > 0) {
			ch.appendLine("--- Channels ---");
			for (const channel of archive.channels) {
				const label = channel.label || "Unnamed";
				const min =
					channel.minimum?.value != null
						? `${Math.round(channel.minimum.value)}\u00B0${channel.minimum.units ?? ""}`
						: "--";
				const max =
					channel.maximum?.value != null
						? `${Math.round(channel.maximum.value)}\u00B0${channel.maximum.units ?? ""}`
						: "--";
				ch.appendLine(`  ${label}: min ${min} / max ${max}`);
			}
		}

		ch.show(true);
	}

	enterDemoMode(mode: "normal" | "high" | "low"): void {
		this.demoMode = mode;
		this.deviceStream?.setDevices([]);
		this._onDidChangeTreeData.fire(undefined);
	}

	exitDemoMode(): void {
		this.demoMode = false;
		void this.syncStreamDevices();
		this._onDidChangeTreeData.fire(undefined);
	}

	startAutoRefresh(context: vscode.ExtensionContext): void {
		this.stopAutoRefresh();
		if (this.disposed) return;

		const config = vscode.workspace.getConfiguration("thermoworks");
		const streaming = config.get<boolean>("streaming", true);

		if (streaming) {
			const intervalMs = Math.max(config.get<number>("refreshInterval", 60), 15) * 1000;

			this.deviceStream = new DeviceStream(
				(serial) => this.fetchChannelsForStream(serial),
				{ onSnapshot: (snapshot) => this.onStreamSnapshot(snapshot) },
				intervalMs,
			);
			void this.syncStreamDevices();
		}

		// Register the config listener only once to avoid accumulating disposed entries.
		if (!this.configDisposable) {
			this.configDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
				if (
					e.affectsConfiguration("thermoworks.refreshInterval") ||
					e.affectsConfiguration("thermoworks.streaming")
				) {
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
		this.outputChannel?.dispose();
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
				new DevicesFolderNode(devices.length, this.firmwareUpdateCount, this.groupedView),
			];
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to load data";
			return [new ErrorNode(message)];
		}
	}

	private async getAccountChildren(user: User): Promise<TreeNode[]> {
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

		// Enrich with Account metadata (graceful fallback)
		if (!this.demoMode) {
			try {
				const client = await this.getClient();
				const account = await client.getAccount();
				if (account.type) {
					children.push(new AccountDetailNode("Account Type", account.type, "organization"));
				}
				if (account.createdOn) {
					children.push(
						new AccountDetailNode("Created", account.createdOn.toLocaleDateString(), "calendar"),
					);
				}
			} catch {
				// Account metadata unavailable; omit silently
			}
		}

		// Data usage (total)
		if (!this.demoMode) {
			try {
				const client = await this.getClient();
				const usage = await client.getDataUsage();
				children.push(new AccountDetailNode("Data Usage", usage.formattedSize, "database"));

				// Per-device breakdown
				const perDevice = await client.getDataUsageByDevice();
				for (const entry of perDevice) {
					children.push(
						new AccountDetailNode(`  ${entry.deviceId}`, entry.formattedSize, "server"),
					);
				}
			} catch {
				// Data usage unavailable; omit silently
			}
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

			const results = await Promise.all(
				devices.map(async (device) => {
					const channels = this.demoMode
						? getDemoChannels(device.serial, this.demoMode)
						: await this.getCachedChannels(device.serial);
					const hasAlarm = channels.some((ch) => ch.alarmHigh?.alarming || ch.alarmLow?.alarming);
					const firmwareOutdated = await this.checkFirmwareOutdated(device);
					return { device, channels, hasAlarm, firmwareOutdated };
				}),
			);

			let alarmCount = 0;
			let firmwareUpdateCount = 0;
			for (const { hasAlarm, firmwareOutdated } of results) {
				if (hasAlarm) alarmCount++;
				if (firmwareOutdated) firmwareUpdateCount++;
			}
			this.updateBadge(alarmCount);
			this.firmwareUpdateCount = firmwareUpdateCount;

			// Grouped view: organize devices into groups
			if (this.groupedView && !this.demoMode) {
				const groups = await this.getCachedGroups();
				if (groups.length > 0) {
					return this.buildGroupedNodes(devices, results, groups);
				}
			}

			// Flat list (default)
			return results.map(
				({ device, channels, hasAlarm, firmwareOutdated }) =>
					new DeviceNode(device, hasAlarm, firmwareOutdated, channels),
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to load devices";
			return [new ErrorNode(message)];
		}
	}

	private buildGroupedNodes(
		devices: Device[],
		results: Array<{
			device: Device;
			channels: DeviceChannel[];
			hasAlarm: boolean;
			firmwareOutdated: boolean;
		}>,
		groups: DeviceGroup[],
	): TreeNode[] {
		const nodes: TreeNode[] = [];
		const assignedSerials = new Set<string>();

		for (const group of groups) {
			if (!group.name && group.devices.length === 0) continue;
			const groupDevices = group.devices.filter((serial) =>
				devices.some((d) => d.serial === serial),
			);
			if (groupDevices.length === 0) continue;

			const folder = new DeviceGroupFolderNode(group.id, group.name, groupDevices.length);
			folder.deviceSerials.push(...groupDevices);
			nodes.push(folder);
			for (const serial of groupDevices) assignedSerials.add(serial);
		}

		// Ungrouped devices
		const ungrouped = results.filter((r) => !assignedSerials.has(r.device.serial));
		for (const { device, channels, hasAlarm, firmwareOutdated } of ungrouped) {
			nodes.push(new DeviceNode(device, hasAlarm, firmwareOutdated, channels));
		}

		return nodes;
	}

	private async getGroupDeviceNodes(serials: string[]): Promise<TreeNode[]> {
		try {
			const devices = this.demoMode ? DEMO_DEVICES : await this.getCachedDevices();
			const filtered = devices.filter((d) => serials.includes(d.serial));

			const results = await Promise.all(
				filtered.map(async (device) => {
					const channels = this.demoMode
						? getDemoChannels(device.serial, this.demoMode)
						: await this.getCachedChannels(device.serial);
					const hasAlarm = channels.some((ch) => ch.alarmHigh?.alarming || ch.alarmLow?.alarming);
					const firmwareOutdated = await this.checkFirmwareOutdated(device);
					return new DeviceNode(device, hasAlarm, firmwareOutdated, channels);
				}),
			);

			return results.length > 0 ? results : [new ErrorNode("No devices in group")];
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to load group devices";
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

			// Fetch average temperature (cached)
			let averageTemp: { value: number; units: string } | null = null;
			if (!this.demoMode) {
				averageTemp = await this.getCachedAverageTemp(serial);
			}

			// Load channel labels for display resolution.
			const config = await loadConfig();
			const channelLabels: ChannelLabelMap | undefined = config.channelLabels;

			return buildDeviceChildren(device, channels, firmwareOutdated, averageTemp, channelLabels);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to load channels";
			return [new ErrorNode(message)];
		}
	}

	private async getArchiveNodes(serial: string): Promise<TreeNode[]> {
		if (this.demoMode) {
			const archives = DEMO_ARCHIVES[serial] ?? [];
			if (archives.length === 0) {
				return [new ErrorNode("No archived sessions")];
			}
			return archives.map((a) => new ArchiveNode(a, serial));
		}

		try {
			const archives = await this.getCachedArchives(serial);
			if (archives.length === 0) {
				return [new ErrorNode("No archived sessions")];
			}
			return archives.map((a) => new ArchiveNode(a, serial));
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to load archives";
			return [new ErrorNode(message)];
		}
	}

	private getArchiveChildren(archive: Archive, serial: string): TreeNode[] {
		if (!archive.channels || archive.channels.length === 0) {
			return [new ErrorNode("No channel data")];
		}
		return archive.channels.map((ch, i) => new ArchiveChannelNode(ch, serial, archive.id, i));
	}

	private async getCalibrationNodes(serial: string): Promise<TreeNode[]> {
		if (this.demoMode) {
			return [new ErrorNode("No calibration records")];
		}

		try {
			const client = await this.getClient();
			const records = await client.getCalibration(serial);
			if (records.length === 0) {
				return [new ErrorNode("No calibration records")];
			}
			return records.map((r, i) => new CalibrationRecordNode(r, i));
		} catch {
			return [new ErrorNode("No calibration records")];
		}
	}

	// ─── Private: Caching ────────────────────────────────────────────────────

	private async getCachedDevices(): Promise<Device[]> {
		const now = Date.now();

		// Return fresh cache immediately
		if (this.deviceCache && now - this.deviceCache.fetchedAt < DEVICE_CACHE_TTL_MS) {
			return this.deviceCache.devices;
		}

		// Stale cache exists — return it immediately, refresh in background
		if (this.deviceCache) {
			this.backgroundRefreshDevices();
			return this.deviceCache.devices;
		}

		// No cache at all — must wait for network (first load)
		if (this.inflightDevices) {
			return this.inflightDevices;
		}

		this.inflightDevices = (async () => {
			try {
				const client = await this.getClient();
				const devices = await client.getDevices();
				this.deviceCache = { devices, fetchedAt: Date.now() };
				this.persistDeviceCache();
				return devices;
			} finally {
				this.inflightDevices = undefined;
			}
		})();

		return this.inflightDevices;
	}

	private backgroundRefreshDevices(): void {
		if (this.inflightDevices) return; // already refreshing
		const refreshPromise = (async () => {
			try {
				const client = await this.getClient();
				const devices = await client.getDevices();
				this.deviceCache = { devices, fetchedAt: Date.now() };
				this.persistDeviceCache();
				this._onDidChangeTreeData.fire(undefined);
				return devices;
			} finally {
				this.inflightDevices = undefined;
			}
		})();
		this.inflightDevices = refreshPromise;
	}

	private persistDeviceCache(): void {
		if (this.globalState && this.deviceCache) {
			void this.globalState.update("thermoworks.deviceCache", this.deviceCache);
		}
	}

	private async getCachedChannels(serial: string): Promise<DeviceChannel[]> {
		const now = Date.now();
		const refreshMs = Math.max(
			vscode.workspace.getConfiguration("thermoworks").get<number>("refreshInterval", 60) * 1000,
			15_000,
		);

		const cached = this.channelCaches.get(serial);
		if (cached) {
			if (now - cached.fetchedAt < refreshMs) {
				return cached.channels;
			}
			// Stale — return immediately, refresh in background
			this.backgroundRefreshChannels(serial, refreshMs);
			return cached.channels;
		}

		// No cache — must wait
		const client = await this.getClient();
		const channels = await client.getAllDeviceChannels(serial);
		this.channelCaches.set(serial, { channels, fetchedAt: now });
		return channels;
	}

	private backgroundRefreshChannels(serial: string, _refreshMs: number): void {
		// Fire-and-forget refresh
		void (async () => {
			try {
				const client = await this.getClient();
				const channels = await client.getAllDeviceChannels(serial);
				this.channelCaches.set(serial, { channels, fetchedAt: Date.now() });
				this._onDidChangeTreeData.fire(undefined);
			} catch {
				// Silently fail — stale data is still visible
			}
		})();
	}

	private async getCachedAverageTemp(
		serial: string,
	): Promise<{ value: number; units: string } | null> {
		const now = Date.now();
		const cached = this.avgTempCaches.get(serial);
		if (cached) {
			if (now - cached.fetchedAt < DEVICE_CACHE_TTL_MS) {
				return cached.value;
			}
			// Stale — return immediately, refresh in background
			void this.backgroundRefreshAvgTemp(serial);
			return cached.value;
		}

		try {
			const client = await this.getClient();
			const value = await client.getAverageTemperature(serial);
			this.avgTempCaches.set(serial, { value, fetchedAt: now });
			return value;
		} catch {
			this.avgTempCaches.set(serial, { value: null, fetchedAt: now });
			return null;
		}
	}

	private async backgroundRefreshAvgTemp(serial: string): Promise<void> {
		try {
			const client = await this.getClient();
			const value = await client.getAverageTemperature(serial);
			this.avgTempCaches.set(serial, { value, fetchedAt: Date.now() });
			this._onDidChangeTreeData.fire(undefined);
		} catch {
			// Keep stale value
		}
	}

	private async getCachedArchives(serial: string): Promise<Archive[]> {
		const now = Date.now();
		const cached = this.archiveCaches.get(serial);
		if (cached && now - cached.fetchedAt < DEVICE_CACHE_TTL_MS) {
			return cached.archives;
		}

		const client = await this.getClient();
		const limit = vscode.workspace.getConfiguration("thermoworks").get<number>("archivesLimit", 20);
		const archives = await client.getArchives(serial, { limit });
		this.archiveCaches.set(serial, { archives, fetchedAt: now });
		return archives;
	}

	private async getCachedGroups(): Promise<DeviceGroup[]> {
		const now = Date.now();
		if (this.groupCache && now - this.groupCache.fetchedAt < DEVICE_CACHE_TTL_MS) {
			return this.groupCache.groups;
		}

		try {
			const client = await this.getClient();
			const groups = await client.getDeviceGroups();
			this.groupCache = { groups, fetchedAt: now };
			return groups;
		} catch {
			return [];
		}
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
				if (!info) return false;
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
		this.archiveCaches.clear();
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
		this.deviceStream?.dispose();
		this.deviceStream = undefined;
	}
}
