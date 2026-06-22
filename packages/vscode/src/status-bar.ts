import {
	type AlarmState,
	type DeviceChannel,
	escalateAlarm,
	getChannelsAlarmState,
	ThermoworksCloud,
} from "thermoworks-sdk";
import * as vscode from "vscode";
import type { ClientManager } from "./client-manager";
import { loadConfig } from "./config";
import type { CredentialStore } from "./credentials";
import { type DeviceSnapshot, DeviceStream } from "./device-stream";

const BLINK_INTERVAL_MS = 800;
const MIN_CYCLE_MS = 1_000;

type ConfiguredDevice = {
	config: { serial: string; label: string; channels: number[] | "avg" };
	device: { serial: string };
};

export type StatusBarMode = "single" | "cycle" | "all";

export class TemperatureStatusBar implements vscode.Disposable {
	private readonly item: vscode.StatusBarItem;
	private readonly credentialStore: CredentialStore;
	private readonly clientManager: ClientManager;
	private deviceStream: DeviceStream | undefined;
	private retryTimer: ReturnType<typeof setTimeout> | undefined;
	private blinkTimer: ReturnType<typeof setInterval> | undefined;
	private cycleTimer: ReturnType<typeof setInterval> | undefined;
	private refreshing = false;
	private inDemo = false;
	private disposed = false;
	private generation = 0; // Incremented on login/logout/dispose to invalidate in-flight work
	private blinkVisible = true;
	private lastText = "";

	// Multi-device cycling state
	private cycleIndex = 0;
	private deviceParts: string[][] = [];
	private configuredDevices: ConfiguredDevice[] = [];
	private channelsBySerial = new Map<string, DeviceChannel[]>();

	constructor(
		credentialStore: CredentialStore,
		clientManager: ClientManager,
		context: vscode.ExtensionContext,
	) {
		this.credentialStore = credentialStore;
		this.clientManager = clientManager;
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.item.command = "thermoworks.cycleNext";
		this.item.text = "$(flame) --";
		this.item.tooltip = "ThermoWorks: Loading...";

		context.subscriptions.push(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration("thermoworks.refreshInterval")) {
					this.restartStream();
				}
				if (
					e.affectsConfiguration("thermoworks.statusBarMode") ||
					e.affectsConfiguration("thermoworks.cycleInterval")
				) {
					this.restartCycleTimer();
					this.updateDisplayFromCache();
				}
			}),
		);
	}

	async start(): Promise<void> {
		this.item.show();
		await this.refresh();
		if (!this.disposed) {
			this.restartCycleTimer();
		}
	}

	async login(): Promise<void> {
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
		this.invalidateAndReset();
		vscode.window.showInformationMessage("ThermoWorks: Logged in successfully.");
		await this.refresh();
	}

	async logout(): Promise<void> {
		await this.credentialStore.deleteCredentials();
		this.invalidateAndReset();
		this.item.text = "$(flame) Login";
		this.item.tooltip = "ThermoWorks: Not logged in. Click to refresh or run 'ThermoWorks: Login'.";
		vscode.window.showInformationMessage("ThermoWorks: Logged out.");
	}

	simulateAlarm(mode: AlarmState): void {
		// Invalidate any in-flight refresh and pause live updates during the demo.
		this.generation++;
		this.clearRetry();
		this.deviceStream?.setDevices([]);

		const demoText =
			mode === "none"
				? "$(flame) Smoker:Pit:225°F · Smoker:Meat:165°F · Fridge:38°F"
				: mode === "high"
					? "$(flame) Smoker:Pit:285°F · Smoker:Meat:205°F · Fridge:38°F"
					: "$(flame) Smoker:Pit:180°F · Fridge:28°F";

		this.lastText = demoText;
		this.item.text = demoText;
		this.item.show();

		const tooltipLines = ["**ThermoWorks Demo Mode**", ""];
		if (mode === "high") tooltipLines.push("**⚠️ 🔴 HIGH ALARM ⚠️**", "");
		if (mode === "low") tooltipLines.push("**⚠️ 🔵 LOW ALARM ⚠️**", "");
		tooltipLines.push(`Mode: ${mode}`, "", "_Use command palette 'ThermoWorks: Demo' to change_");
		this.item.tooltip = new vscode.MarkdownString(tooltipLines.join("\n"));

		this.applyAlarmStyle(mode);

		if (mode === "none") {
			// Clearing the demo: resume live updates, which replace the demo text.
			this.inDemo = false;
			this.ensureStream();
		} else {
			this.inDemo = true;
		}
	}

	/** Advance to the next device and update the display. */
	cycleNext(): void {
		if (this.deviceParts.length <= 1) return;
		this.cycleIndex = (this.cycleIndex + 1) % this.deviceParts.length;
		this.updateDisplayFromCache();
	}

	async refresh(): Promise<void> {
		if (this.refreshing || this.disposed) return;
		this.refreshing = true;
		const gen = this.generation;

		try {
			const data = await this.fetchDeviceData(gen);
			if (this.isStale(gen)) return;
			this.clearRetry();
			if (!data) {
				// No credentials or no configured devices: stop streaming.
				this.configuredDevices = [];
				this.channelsBySerial.clear();
				this.ensureStream();
				return;
			}

			this.configuredDevices = data.configuredDevices;
			this.channelsBySerial = new Map(
				data.configuredDevices.map((d, i) => [d.device.serial, data.channelResults[i] ?? []]),
			);

			const parts = this.formatStatusParts(data.configuredDevices, data.channelResults);
			if (this.isStale(gen)) return;

			this.updateStatusBarUI(parts);
			this.ensureStream();
		} catch (error) {
			if (this.isStale(gen)) return;
			this.applyAlarmStyle("none");

			const message = error instanceof Error ? error.message : "Unknown error";
			this.lastText = "$(flame) --";
			this.item.text = this.lastText;
			this.item.tooltip = `ThermoWorks: Error — ${message}. Retrying…`;

			// The DeviceStream only starts on success, so schedule a bootstrap retry to
			// recover from a transient failure during start()/login().
			this.scheduleRetry();
		} finally {
			this.refreshing = false;
		}
	}

	/** Schedule a one-shot retry of refresh() after a transient bootstrap failure. */
	private scheduleRetry(): void {
		this.clearRetry();
		if (this.disposed || this.inDemo) return;
		this.retryTimer = setTimeout(() => {
			this.retryTimer = undefined;
			void this.refresh();
		}, getRefreshIntervalMs());
	}

	private clearRetry(): void {
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = undefined;
		}
	}

	/** Fetch channels for a single device for the live stream. */
	private async fetchChannelsForStream(serial: string): Promise<DeviceChannel[]> {
		const creds = await this.credentialStore.getCredentials();
		if (!creds) throw new Error("Not authenticated");
		return this.clientManager.getClient(creds).getAllDeviceChannels(serial);
	}

	/** Apply a live channel snapshot and re-render the status bar from cached state. */
	private onStreamSnapshot(snapshot: DeviceSnapshot): void {
		if (this.disposed || this.inDemo) return;
		this.channelsBySerial.set(snapshot.serial, snapshot.channels);
		this.renderFromState();
	}

	/** Re-render the status bar from the most recent configured devices + channel cache. */
	private renderFromState(): void {
		if (this.disposed || this.inDemo || this.configuredDevices.length === 0) return;
		const channelResults = this.configuredDevices.map(
			(d) => this.channelsBySerial.get(d.device.serial) ?? [],
		);
		this.updateStatusBarUI(this.formatStatusParts(this.configuredDevices, channelResults));
	}

	/** Point the live stream at the configured devices (or stop it when there are none). */
	private ensureStream(): void {
		if (this.disposed) return;
		const serials = this.configuredDevices.map((d) => d.device.serial);
		if (serials.length === 0) {
			this.deviceStream?.dispose();
			this.deviceStream = undefined;
			return;
		}
		if (!this.deviceStream) {
			this.deviceStream = new DeviceStream(
				(serial) => this.fetchChannelsForStream(serial),
				{ onSnapshot: (snapshot) => this.onStreamSnapshot(snapshot) },
				getRefreshIntervalMs(),
			);
		}
		this.deviceStream.setDevices(serials);
	}

	/** Recreate the stream (e.g. after the refresh interval changes). */
	private restartStream(): void {
		this.deviceStream?.dispose();
		this.deviceStream = undefined;
		this.ensureStream();
	}

	/**
	 * Fetch credentials, config, devices, and channels from the API.
	 * Returns null (and updates the status bar) if creds or config are missing.
	 */
	private async fetchDeviceData(gen: number) {
		const creds = await this.credentialStore.getCredentials();
		if (this.isStale(gen)) return null;

		if (!creds) {
			this.item.text = "$(flame) Login";
			this.item.tooltip =
				"ThermoWorks: No credentials found. Use 'ThermoWorks: Login' or run 'thermoworks auth login' in CLI.";
			return null;
		}

		const config = await loadConfig();
		if (this.isStale(gen)) return null;

		if (config.devices.length === 0) {
			this.item.text = "$(flame) No devices";
			this.item.tooltip =
				"ThermoWorks: No devices configured. Run 'thermoworks copilot setup' in your terminal.";
			return null;
		}

		const client = this.clientManager.getClient(creds);
		const allDevices = await client.getDevices();
		if (this.isStale(gen)) return null;

		const configuredDevices = config.devices
			.map((dc) => ({ config: dc, device: allDevices.find((d) => d.serial === dc.serial) }))
			.filter(
				(x): x is { config: typeof x.config; device: NonNullable<typeof x.device> } =>
					x.device != null,
			);

		const channelResults = await Promise.all(
			configuredDevices.map(({ device }) => client.getAllDeviceChannels(device.serial)),
		);
		if (this.isStale(gen)) return null;

		return { configuredDevices, channelResults };
	}

	/**
	 * Format per-device display parts, tooltip lines, and compute the aggregate alarm state.
	 */
	private formatStatusParts(
		configuredDevices: Array<{
			config: { serial: string; label: string; channels: number[] | "avg" };
			device: { serial: string };
		}>,
		channelResults: Awaited<ReturnType<ThermoworksCloud["getAllDeviceChannels"]>>[],
	): { perDevice: string[][]; tooltipLines: string[]; overallAlarm: AlarmState } {
		const perDevice: string[][] = [];
		const tooltipLines: string[] = ["**ThermoWorks Temperatures**", ""];
		let overallAlarm: AlarmState = "none";

		for (let i = 0; i < configuredDevices.length; i++) {
			const entry = configuredDevices[i];
			const allChannels = channelResults[i];
			if (!entry || !allChannels) continue;
			const deviceConfig = entry.config;
			const parts: string[] = [];

			const tempChannels = allChannels.filter(
				(ch) => ch.value != null && ch.units != null && ch.units !== "H",
			);

			if (deviceConfig.channels === "avg") {
				if (tempChannels.length > 0) {
					const sum = tempChannels.reduce((acc, ch) => acc + (ch.value ?? 0), 0);
					const avg = Math.round(sum / tempChannels.length);
					const units = tempChannels[0]?.units;
					parts.push(`${deviceConfig.label}:${avg}\u00B0${units}`);
					tooltipLines.push(
						`🌡️ ${deviceConfig.label}: ${avg}°${units} (avg of ${tempChannels.length} channels)`,
					);
					overallAlarm = escalateAlarm(overallAlarm, getChannelsAlarmState(tempChannels));
				}
			} else if (deviceConfig.channels.length === 1) {
				const chIdx = deviceConfig.channels[0];
				const ch = chIdx != null ? allChannels[chIdx - 1] : undefined;
				if (ch?.value != null && ch.units != null) {
					parts.push(`${deviceConfig.label}:${Math.round(ch.value)}\u00B0${ch.units}`);
					tooltipLines.push(`🌡️ ${deviceConfig.label}: ${Math.round(ch.value)}°${ch.units}`);
					overallAlarm = escalateAlarm(overallAlarm, getChannelsAlarmState([ch]));
				}
			} else {
				for (const chNum of deviceConfig.channels) {
					const ch = allChannels[chNum - 1];
					if (ch?.value != null && ch.units != null) {
						const chLabel = ch.label || `Ch${chNum}`;
						parts.push(`${deviceConfig.label}:${chLabel}:${Math.round(ch.value)}\u00B0${ch.units}`);
						tooltipLines.push(
							`🌡️ ${deviceConfig.label} → ${chLabel}: ${Math.round(ch.value)}°${ch.units}`,
						);
						overallAlarm = escalateAlarm(overallAlarm, getChannelsAlarmState([ch]));
					}
				}
			}

			if (parts.length > 0) {
				perDevice.push(parts);
			}
		}

		return { perDevice, tooltipLines, overallAlarm };
	}

	/**
	 * Update the status bar item's text, tooltip, and alarm styling from formatted parts.
	 */
	private updateStatusBarUI(parts: {
		perDevice: string[][];
		tooltipLines: string[];
		overallAlarm: AlarmState;
	}): void {
		const { perDevice, tooltipLines, overallAlarm } = parts;

		this.deviceParts = perDevice;

		if (perDevice.length > 0) {
			this.updateDisplayFromCache();
			tooltipLines.push("", `_Last updated: ${new Date().toLocaleTimeString()}_`);
			if (overallAlarm !== "none") {
				const alarmType = overallAlarm === "high" ? "🔴 HIGH ALARM" : "🔵 LOW ALARM";
				tooltipLines.splice(2, 0, `**⚠️ ${alarmType} ⚠️**`, "");
			}
			this.item.tooltip = new vscode.MarkdownString(tooltipLines.join("\n"));
		} else {
			this.lastText = "$(flame) No readings";
			this.item.text = this.lastText;
			this.item.tooltip = "ThermoWorks: No temperature readings available.";
		}

		this.applyAlarmStyle(overallAlarm);
	}

	dispose(): void {
		this.disposed = true;
		this.generation++;
		this.clearRetry();
		this.deviceStream?.dispose();
		this.deviceStream = undefined;
		this.stopCycleTimer();
		this.stopBlink();
		this.clientManager.close();
		this.item.dispose();
	}

	private isStale(gen: number): boolean {
		return this.disposed || gen !== this.generation;
	}

	private invalidateAndReset(): void {
		this.generation++;
		this.clearRetry();
		this.deviceStream?.dispose();
		this.deviceStream = undefined;
		this.configuredDevices = [];
		this.channelsBySerial.clear();
		this.applyAlarmStyle("none");
		this.clientManager.close();
	}

	private getDisplayMode(): StatusBarMode {
		return vscode.workspace
			.getConfiguration("thermoworks")
			.get<StatusBarMode>("statusBarMode", "single");
	}

	private getCycleIntervalMs(): number {
		const seconds = vscode.workspace
			.getConfiguration("thermoworks")
			.get<number>("cycleInterval", 5);
		return Math.max(seconds * 1000, MIN_CYCLE_MS);
	}

	/** Render the status bar text from cached deviceParts based on current mode. */
	private updateDisplayFromCache(): void {
		if (this.deviceParts.length === 0) return;

		const mode = this.getDisplayMode();
		let displayParts: string[];

		switch (mode) {
			case "single":
			case "cycle": {
				const idx = this.cycleIndex % this.deviceParts.length;
				displayParts = this.deviceParts[idx] ?? [];
				break;
			}
			case "all":
				displayParts = this.deviceParts.flat();
				break;
		}

		if (displayParts.length > 0) {
			this.lastText = `$(flame) ${displayParts.join(" \u00B7 ")}`;
		} else {
			this.lastText = "$(flame) No readings";
		}
		this.item.text = this.lastText;
	}

	private restartCycleTimer(): void {
		this.stopCycleTimer();
		if (this.disposed) return;
		const mode = this.getDisplayMode();
		if (mode !== "cycle" || this.deviceParts.length <= 1) return;

		const ms = this.getCycleIntervalMs();
		this.cycleTimer = setInterval(() => {
			if (this.disposed) {
				this.stopCycleTimer();
				return;
			}
			this.cycleIndex = (this.cycleIndex + 1) % this.deviceParts.length;
			this.updateDisplayFromCache();
		}, ms);
	}

	private stopCycleTimer(): void {
		if (this.cycleTimer) {
			clearInterval(this.cycleTimer);
			this.cycleTimer = undefined;
		}
	}

	private applyAlarmStyle(alarm: AlarmState): void {
		this.stopBlink();

		switch (alarm) {
			case "high":
				this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
				this.item.color = undefined;
				this.startBlink();
				break;
			case "low":
				this.item.backgroundColor = undefined;
				this.item.color = "#64B5F6"; // material blue 300
				this.startBlink();
				break;
			default:
				this.item.backgroundColor = undefined;
				this.item.color = undefined;
				break;
		}
	}

	private startBlink(): void {
		this.blinkVisible = true;
		this.blinkTimer = setInterval(() => {
			if (this.disposed) {
				this.stopBlink();
				return;
			}
			this.blinkVisible = !this.blinkVisible;
			this.item.text = this.blinkVisible ? this.lastText : "$(flame)";
		}, BLINK_INTERVAL_MS);
	}

	private stopBlink(): void {
		if (this.blinkTimer) {
			clearInterval(this.blinkTimer);
			this.blinkTimer = undefined;
		}
		this.blinkVisible = true;
		if (this.lastText) {
			this.item.text = this.lastText;
		}
	}
}

/** Live polling interval (ms) derived from the refresh-interval setting. */
function getRefreshIntervalMs(): number {
	const seconds = vscode.workspace
		.getConfiguration("thermoworks")
		.get<number>("refreshInterval", 60);
	return Math.max(seconds, 15) * 1000;
}
