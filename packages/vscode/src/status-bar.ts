import {
	type AlarmState,
	escalateAlarm,
	getChannelsAlarmState,
	ThermoworksCloud,
} from "thermoworks-sdk";
import * as vscode from "vscode";
import { loadConfig } from "./config";
import type { CredentialStore } from "./credentials";

const MIN_REFRESH_MS = 15_000;
const BACKOFF_BASE_MS = 5_000;
const MAX_BACKOFF_MS = 300_000; // 5 minutes
const BLINK_INTERVAL_MS = 800;

export class TemperatureStatusBar implements vscode.Disposable {
	private readonly item: vscode.StatusBarItem;
	private readonly credentialStore: CredentialStore;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private blinkTimer: ReturnType<typeof setInterval> | undefined;
	private client: ThermoworksCloud | undefined;
	private refreshing = false;
	private consecutiveFailures = 0;
	private disposed = false;
	private generation = 0; // Incremented on login/logout/dispose to invalidate in-flight work
	private blinkVisible = true;
	private lastText = "";

	constructor(credentialStore: CredentialStore, context: vscode.ExtensionContext) {
		this.credentialStore = credentialStore;
		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.item.command = "thermoworks.refresh";
		this.item.text = "$(flame) --";
		this.item.tooltip = "ThermoWorks: Loading...";

		context.subscriptions.push(
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration("thermoworks.refreshInterval")) {
					this.scheduleNext();
				}
			}),
		);
	}

	async start(): Promise<void> {
		this.item.show();
		await this.refresh();
		if (!this.disposed) {
			this.scheduleNext();
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
		// Invalidate in-flight refreshes and cancel scheduled ones
		this.generation++;
		this.cancelTimer();

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
			// Resume normal refresh after clearing demo
			this.scheduleNext();
		}
	}

	async refresh(): Promise<void> {
		if (this.refreshing || this.disposed) return;
		this.refreshing = true;
		const gen = this.generation;

		try {
			const creds = await this.credentialStore.getCredentials();
			if (this.isStale(gen)) return;

			if (!creds) {
				this.item.text = "$(flame) Login";
				this.item.tooltip =
					"ThermoWorks: No credentials found. Use 'ThermoWorks: Login' or run 'thermoworks auth login' in CLI.";
				return;
			}

			const config = await loadConfig();
			if (this.isStale(gen)) return;

			if (config.devices.length === 0) {
				this.item.text = "$(flame) No devices";
				this.item.tooltip =
					"ThermoWorks: No devices configured. Run 'thermoworks copilot setup' in your terminal.";
				return;
			}

			if (!this.client) {
				this.client = new ThermoworksCloud({ email: creds.email, password: creds.password });
			}

			const client = this.client;
			const allDevices = await client.getDevices();
			if (this.isStale(gen)) return;

			const parts: string[] = [];
			const tooltipLines: string[] = ["**ThermoWorks Temperatures**", ""];
			let overallAlarm: AlarmState = "none";

			for (const deviceConfig of config.devices) {
				const device = allDevices.find((d) => d.serial === deviceConfig.serial);
				if (!device) continue;

				const allChannels = await client.getAllDeviceChannels(device.serial);
				if (this.isStale(gen)) return;

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
							parts.push(
								`${deviceConfig.label}:${chLabel}:${Math.round(ch.value)}\u00B0${ch.units}`,
							);
							tooltipLines.push(
								`🌡️ ${deviceConfig.label} → ${chLabel}: ${Math.round(ch.value)}°${ch.units}`,
							);
							overallAlarm = escalateAlarm(overallAlarm, getChannelsAlarmState([ch]));
						}
					}
				}
			}

			if (this.isStale(gen)) return;

			if (parts.length > 0) {
				this.lastText = `$(flame) ${parts.join(" · ")}`;
				this.item.text = this.lastText;
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
			this.consecutiveFailures = 0;
		} catch (error) {
			if (this.isStale(gen)) return;
			this.consecutiveFailures++;
			this.closeClient();
			this.applyAlarmStyle("none");

			const message = error instanceof Error ? error.message : "Unknown error";
			this.lastText = "$(flame) --";
			this.item.text = this.lastText;
			this.item.tooltip = `ThermoWorks: Error — ${message}. Click to retry.`;
		} finally {
			this.refreshing = false;
			// Always reschedule with the correct interval (normal or backoff)
			if (!this.isStale(gen)) {
				this.scheduleNext();
			}
		}
	}

	dispose(): void {
		this.disposed = true;
		this.generation++;
		this.cancelTimer();
		this.stopBlink();
		this.closeClient();
		this.item.dispose();
	}

	private isStale(gen: number): boolean {
		return this.disposed || gen !== this.generation;
	}

	private invalidateAndReset(): void {
		this.generation++;
		this.consecutiveFailures = 0;
		this.applyAlarmStyle("none");
		this.closeClient();
	}

	private getRefreshMs(): number {
		const configMs =
			vscode.workspace.getConfiguration("thermoworks").get<number>("refreshInterval", 60) * 1000;
		const backoffMs =
			this.consecutiveFailures > 0
				? Math.min(BACKOFF_BASE_MS * 2 ** (this.consecutiveFailures - 1), MAX_BACKOFF_MS)
				: 0;
		return Math.max(configMs, MIN_REFRESH_MS, backoffMs);
	}

	private scheduleNext(): void {
		this.cancelTimer();
		if (this.disposed) return;
		const ms = this.getRefreshMs();
		this.timer = setTimeout(() => this.refresh(), ms);
	}

	private cancelTimer(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
	}

	private closeClient(): void {
		this.client?.close();
		this.client = undefined;
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
