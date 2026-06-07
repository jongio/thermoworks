import type { DeviceChannel, Device, User } from "thermoworks-sdk";
import * as vscode from "vscode";

type AlarmState = "none" | "low" | "high";

function getChannelAlarm(channel: DeviceChannel): AlarmState {
	if (channel.alarmHigh?.alarming) return "high";
	if (channel.alarmLow?.alarming) return "low";
	return "none";
}

function formatTimeAgo(date: Date | null): string {
	if (!date) return "Never";
	const now = Date.now();
	const diff = now - date.getTime();
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

// ─── Base Node ───────────────────────────────────────────────────────────────

export type TreeNode =
	| AccountNode
	| AccountDetailNode
	| DevicesFolderNode
	| DeviceNode
	| ChannelNode
	| DeviceDetailNode
	| FirmwareWarningNode
	| ActionNode
	| ErrorNode
	| LoadingNode;

// ─── Account Nodes ───────────────────────────────────────────────────────────

export class AccountNode extends vscode.TreeItem {
	readonly type = "account" as const;

	constructor(user: User) {
		super("Account", vscode.TreeItemCollapsibleState.Expanded);
		this.id = "thermoworks-account";
		this.iconPath = new vscode.ThemeIcon("account");
		this.contextValue = "account";
		this.description = user.email ?? undefined;
	}
}

export class AccountDetailNode extends vscode.TreeItem {
	readonly type = "accountDetail" as const;

	constructor(label: string, value: string, icon?: string) {
		super(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None);
		this.id = `thermoworks-account-${label.toLowerCase().replace(/\s+/g, "-")}`;
		if (icon) {
			this.iconPath = new vscode.ThemeIcon(icon);
		}
	}
}

export class ActionNode extends vscode.TreeItem {
	readonly type = "action" as const;

	constructor(label: string, commandId: string, icon: string, id: string) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.id = id;
		this.iconPath = new vscode.ThemeIcon(icon);
		this.command = { command: commandId, title: label };
	}
}

// ─── Device Nodes ────────────────────────────────────────────────────────────

export class DevicesFolderNode extends vscode.TreeItem {
	readonly type = "devicesFolder" as const;

	constructor(deviceCount: number) {
		super("Devices", vscode.TreeItemCollapsibleState.Expanded);
		this.id = "thermoworks-devices";
		this.iconPath = new vscode.ThemeIcon("server");
		this.description = `${deviceCount}`;
		this.contextValue = "devicesFolder";
	}
}

export class DeviceNode extends vscode.TreeItem {
	readonly type = "device" as const;
	readonly serial: string;

	constructor(device: Device, hasAlarm: boolean) {
		const label = device.label || device.serial;
		super(label, vscode.TreeItemCollapsibleState.Collapsed);
		this.serial = device.serial;
		this.id = `thermoworks-device-${device.serial}`;
		this.contextValue = "device";

		const isOnline = device.status === "online";
		const statusEmoji = isOnline ? "" : " (Offline)";
		this.description = `${device.type ?? "Unknown"}${statusEmoji}`;

		// Use product thumbnail image when available
		if (device.thumbnail) {
			this.iconPath = vscode.Uri.parse(device.thumbnail);
		} else if (hasAlarm) {
			this.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("charts.red"));
		} else if (isOnline) {
			this.iconPath = new vscode.ThemeIcon("pulse", new vscode.ThemeColor("charts.green"));
		} else {
			this.iconPath = new vscode.ThemeIcon("circle-outline");
		}
	}
}

export class ChannelNode extends vscode.TreeItem {
	readonly type = "channel" as const;

	constructor(channel: DeviceChannel, deviceSerial: string, index: number) {
		const label = channel.label || `Channel ${index + 1}`;
		const alarm = getChannelAlarm(channel);

		let valueText: string;
		if (channel.value != null && channel.units != null) {
			valueText = `${Math.round(channel.value)}\u00B0${channel.units}`;
		} else {
			valueText = "--";
		}

		super(label, vscode.TreeItemCollapsibleState.None);
		this.id = `thermoworks-channel-${deviceSerial}-${index}`;
		this.description = valueText;
		this.contextValue = "channel";

		switch (alarm) {
			case "high":
				this.iconPath = new vscode.ThemeIcon(
					"circle-filled",
					new vscode.ThemeColor("charts.red"),
				);
				this.tooltip = `${label}: ${valueText} - HIGH ALARM`;
				break;
			case "low":
				this.iconPath = new vscode.ThemeIcon(
					"circle-filled",
					new vscode.ThemeColor("charts.blue"),
				);
				this.tooltip = `${label}: ${valueText} - LOW ALARM`;
				break;
			default:
				this.iconPath = new vscode.ThemeIcon(
					"circle-filled",
					new vscode.ThemeColor("charts.green"),
				);
				this.tooltip = `${label}: ${valueText}`;
				break;
		}
	}
}

export class DeviceDetailNode extends vscode.TreeItem {
	readonly type = "deviceDetail" as const;

	constructor(label: string, value: string, deviceSerial: string) {
		super(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None);
		this.id = `thermoworks-detail-${deviceSerial}-${label.toLowerCase().replace(/\s+/g, "-")}`;
		this.iconPath = new vscode.ThemeIcon("info");
	}
}

export class FirmwareWarningNode extends vscode.TreeItem {
	readonly type = "firmwareWarning" as const;

	constructor(currentVersion: string, deviceSerial: string) {
		super("Firmware update available", vscode.TreeItemCollapsibleState.None);
		this.id = `thermoworks-firmware-${deviceSerial}`;
		this.description = `current: ${currentVersion}`;
		this.iconPath = new vscode.ThemeIcon("alert", new vscode.ThemeColor("charts.orange"));
		this.tooltip = `Device firmware ${currentVersion} is outdated. Update via the ThermoWorks app.`;
		this.contextValue = "firmwareWarning";
	}
}

// ─── Utility Nodes ───────────────────────────────────────────────────────────

export class ErrorNode extends vscode.TreeItem {
	readonly type = "error" as const;

	constructor(message: string) {
		super(message, vscode.TreeItemCollapsibleState.None);
		this.id = "thermoworks-error";
		this.iconPath = new vscode.ThemeIcon("error");
	}
}

export class LoadingNode extends vscode.TreeItem {
	readonly type = "loading" as const;

	constructor() {
		super("Loading...", vscode.TreeItemCollapsibleState.None);
		this.id = "thermoworks-loading";
		this.iconPath = new vscode.ThemeIcon("loading~spin");
	}
}

// ─── Helper to build device children ─────────────────────────────────────────

export function buildDeviceChildren(
	device: Device,
	channels: DeviceChannel[],
	firmwareOutdated = false,
): TreeNode[] {
	const children: TreeNode[] = [];

	// Firmware update warning (shown first for visibility)
	if (firmwareOutdated && device.firmware) {
		children.push(new FirmwareWarningNode(device.firmware, device.serial));
	}

	// Temperature channels (filter out humidity-only)
	const tempChannels = channels.filter(
		(ch) => ch.enabled !== false && ch.units !== "H",
	);
	for (let i = 0; i < tempChannels.length; i++) {
		children.push(new ChannelNode(tempChannels[i]!, device.serial, i));
	}

	// Device metadata
	if (device.battery != null) {
		children.push(new DeviceDetailNode("Battery", `${device.battery}%`, device.serial));
	}
	if (device.lastSeen) {
		children.push(new DeviceDetailNode("Last Seen", formatTimeAgo(device.lastSeen), device.serial));
	}
	if (device.firmware && !firmwareOutdated) {
		children.push(new DeviceDetailNode("Firmware", device.firmware, device.serial));
	}

	return children;
}
