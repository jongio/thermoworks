import {
	type Archive,
	type ArchiveChannel,
	type CalibrationRecord,
	type Device,
	type DeviceChannel,
	type DeviceEvent,
	type FanSettings,
	formatTimeAgo,
	getChannelAlarmState,
	type User,
} from "thermoworks-sdk";
import * as vscode from "vscode";
import { applyUnitPreference, getUnitPreference, type TemperatureUnit } from "../temperature-utils";

// ─── Base Node ───────────────────────────────────────────────────────────────

export type TreeNode =
	| AccountNode
	| AccountDetailNode
	| DevicesFolderNode
	| DeviceNode
	| ChannelNode
	| DeviceDetailNode
	| FanDetailNode
	| FirmwareWarningNode
	| EventsFolderNode
	| EventNode
	| ArchivesFolderNode
	| ArchiveNode
	| ArchiveChannelNode
	| CalibrationFolderNode
	| CalibrationRecordNode
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

	constructor(deviceCount: number, firmwareUpdateCount = 0) {
		super("Devices", vscode.TreeItemCollapsibleState.Expanded);
		this.id = "thermoworks-devices";
		this.contextValue = "devicesFolder";

		if (firmwareUpdateCount > 0) {
			this.iconPath = new vscode.ThemeIcon("alert", new vscode.ThemeColor("charts.orange"));
			this.description = `${deviceCount} - ${firmwareUpdateCount} update${firmwareUpdateCount > 1 ? "s" : ""} available`;
		} else {
			this.iconPath = new vscode.ThemeIcon("server");
			this.description = `${deviceCount}`;
		}
	}
}

export class DeviceNode extends vscode.TreeItem {
	readonly type = "device" as const;
	readonly serial: string;

	constructor(device: Device, hasAlarm: boolean, firmwareOutdated = false) {
		const label = device.label || device.serial;
		super(label, vscode.TreeItemCollapsibleState.Collapsed);
		this.serial = device.serial;
		this.id = `thermoworks-device-${device.serial}`;
		this.contextValue = device.fan != null ? "deviceWithFan" : "device";

		const isOnline = device.status === "online";
		const hasSession = device.sessionStart != null;
		const statusParts: string[] = [device.type ?? "Unknown"];
		if (!isOnline) statusParts.push("(Offline)");
		if (firmwareOutdated) statusParts.push("\u2B06\uFE0F Update");
		if (hasSession) {
			const sessionText = device.sessionLabel || "Recording";
			const elapsed = formatElapsed(device.sessionStart);
			statusParts.push(`\uD83D\uDD34 ${sessionText}${elapsed ? ` ${elapsed}` : ""}`);
		}
		this.description = statusParts.join(" ");

		// Icon priority: alarm > firmware outdated > session recording > thumbnail > online/offline
		if (hasAlarm) {
			this.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("charts.red"));
		} else if (firmwareOutdated) {
			this.iconPath = new vscode.ThemeIcon("alert", new vscode.ThemeColor("charts.orange"));
		} else if (hasSession) {
			this.iconPath = new vscode.ThemeIcon("record", new vscode.ThemeColor("charts.red"));
		} else if (device.thumbnail) {
			this.iconPath = vscode.Uri.parse(device.thumbnail);
		} else if (isOnline) {
			this.iconPath = new vscode.ThemeIcon("pulse", new vscode.ThemeColor("charts.green"));
		} else {
			this.iconPath = new vscode.ThemeIcon("circle-outline");
		}
	}
}

export class ChannelNode extends vscode.TreeItem {
	readonly type = "channel" as const;
	readonly serial: string;
	readonly channelNumber: number;

	constructor(channel: DeviceChannel, deviceSerial: string, index: number) {
		const label = channel.label || `Channel ${index + 1}`;
		const alarm = getChannelAlarmState(channel);

		let valueText: string;
		if (channel.value != null && channel.units != null) {
			const pref = getUnitPreference();
			const converted = applyUnitPreference(channel.value, channel.units as TemperatureUnit, pref);
			valueText = `${Math.round(converted.value)}\u00B0${converted.unit}`;
		} else {
			valueText = "--";
		}

		super(label, vscode.TreeItemCollapsibleState.None);
		this.serial = deviceSerial;
		this.channelNumber = channel.number ? Number.parseInt(channel.number, 10) : index;
		this.id = `thermoworks-channel-${deviceSerial}-${index}`;
		this.description = valueText;
		this.contextValue = "channelNode";

		const thresholdParts: string[] = [];
		if (channel.alarmHigh?.enabled && channel.alarmHigh.value != null) {
			thresholdParts.push(`High: ${channel.alarmHigh.value}\u00B0${channel.alarmHigh.units ?? ""}`);
		}
		if (channel.alarmLow?.enabled && channel.alarmLow.value != null) {
			thresholdParts.push(`Low: ${channel.alarmLow.value}\u00B0${channel.alarmLow.units ?? ""}`);
		}
		const thresholdInfo = thresholdParts.length > 0 ? ` [${thresholdParts.join(", ")}]` : "";

		switch (alarm) {
			case "high":
				this.iconPath = new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("charts.red"));
				this.tooltip = `${label}: ${valueText} - HIGH ALARM${thresholdInfo}`;
				break;
			case "low":
				this.iconPath = new vscode.ThemeIcon("circle-filled", new vscode.ThemeColor("charts.blue"));
				this.tooltip = `${label}: ${valueText} - LOW ALARM${thresholdInfo}`;
				break;
			default:
				this.iconPath = new vscode.ThemeIcon(
					"circle-filled",
					new vscode.ThemeColor("charts.green"),
				);
				this.tooltip = `${label}: ${valueText}${thresholdInfo}`;
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

export class FanDetailNode extends vscode.TreeItem {
	readonly type = "fanDetail" as const;

	constructor(fan: FanSettings, deviceSerial: string, units: string | null) {
		const stateLabel = fan.state != null && fan.state > 0 ? "running" : "idle";
		const tempPart = fan.setTemp != null ? `${fan.setTemp}\u00B0${units ?? "F"}` : "not set";
		super(`Fan: ${tempPart} (${stateLabel})`, vscode.TreeItemCollapsibleState.None);
		this.id = `thermoworks-fan-${deviceSerial}`;
		this.iconPath = new vscode.ThemeIcon(
			stateLabel === "running" ? "sync~spin" : "circle-outline",
			stateLabel === "running" ? new vscode.ThemeColor("charts.green") : undefined,
		);
		this.contextValue = "fanDetail";
		this.tooltip = `Fan controller: ${stateLabel}\nTarget: ${tempPart}\nConnected: ${fan.connected ? "yes" : "no"}`;
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

// ─── Event Nodes ─────────────────────────────────────────────────────────────

export class EventsFolderNode extends vscode.TreeItem {
	readonly type = "eventsFolder" as const;

	constructor(eventCount: number) {
		super("Events", vscode.TreeItemCollapsibleState.Collapsed);
		this.id = "thermoworks-events";
		this.contextValue = "eventsFolder";
		this.iconPath = new vscode.ThemeIcon("history");
		this.description = `${eventCount}`;
	}
}

/** Maps numeric severity to icon, color, and label. */
export function getSeverityDisplay(severity: number): {
	icon: string;
	color: vscode.ThemeColor;
	label: string;
} {
	if (severity >= 3) {
		return { icon: "error", color: new vscode.ThemeColor("charts.red"), label: "critical" };
	}
	if (severity === 2) {
		return { icon: "warning", color: new vscode.ThemeColor("charts.orange"), label: "warning" };
	}
	return { icon: "info", color: new vscode.ThemeColor("charts.blue"), label: "info" };
}

export class EventNode extends vscode.TreeItem {
	readonly type = "event" as const;
	readonly event: DeviceEvent;

	constructor(event: DeviceEvent) {
		const label = event.eventType;
		super(label, vscode.TreeItemCollapsibleState.None);
		this.event = event;
		this.id = `thermoworks-event-${event.id}`;
		this.contextValue = "event";

		const { icon, color, label: severityLabel } = getSeverityDisplay(event.severity);
		this.iconPath = new vscode.ThemeIcon(icon, color);
		this.description = formatTimeAgo(event.eventTime);

		const tooltipParts = [`**${event.eventType}** (${severityLabel})`, `Device: ${event.deviceId}`];
		if (event.channelId) tooltipParts.push(`Channel: ${event.channelId}`);
		if (event.valueBefore != null || event.valueAfter != null) {
			tooltipParts.push(`Change: ${event.valueBefore ?? "--"} → ${event.valueAfter ?? "--"}`);
		}
		tooltipParts.push(`Time: ${event.eventTime.toLocaleString()}`);
		this.tooltip = new vscode.MarkdownString(tooltipParts.join("\n\n"));

		this.command = {
			command: "thermoworks.showEventDetails",
			title: "Show Event Details",
			arguments: [event],
		};
	}
}

// ─── Archive Nodes ───────────────────────────────────────────────────────────

export class ArchivesFolderNode extends vscode.TreeItem {
	readonly type = "archivesFolder" as const;
	readonly serial: string;

	constructor(serial: string) {
		super("Archives", vscode.TreeItemCollapsibleState.Collapsed);
		this.serial = serial;
		this.id = `thermoworks-archives-${serial}`;
		this.iconPath = new vscode.ThemeIcon("history");
		this.contextValue = "archivesFolder";
	}
}

export class ArchiveNode extends vscode.TreeItem {
	readonly type = "archive" as const;
	readonly serial: string;
	readonly archive: Archive;

	constructor(archive: Archive, serial: string) {
		const label = archive.label || `Session ${archive.id.slice(0, 6)}`;
		super(label, vscode.TreeItemCollapsibleState.Collapsed);
		this.serial = serial;
		this.archive = archive;
		this.id = `thermoworks-archive-${serial}-${archive.id}`;
		this.contextValue = "archive";
		this.iconPath = new vscode.ThemeIcon("notebook");
		this.description = formatArchiveDuration(archive.start, archive.end);
		this.tooltip = buildArchiveTooltip(archive);
	}
}

export class ArchiveChannelNode extends vscode.TreeItem {
	readonly type = "archiveChannel" as const;

	constructor(channel: ArchiveChannel, serial: string, archiveId: string, index: number) {
		const label = channel.label || `Channel ${index + 1}`;
		const minMax = formatMinMax(channel);
		super(label, vscode.TreeItemCollapsibleState.None);
		this.id = `thermoworks-archive-ch-${serial}-${archiveId}-${index}`;
		this.description = minMax;
		this.iconPath = new vscode.ThemeIcon("graph-line");
		this.contextValue = "archiveChannel";
	}
}

// ─── Calibration Nodes ───────────────────────────────────────────────────────

export class CalibrationFolderNode extends vscode.TreeItem {
	readonly type = "calibrationFolder" as const;
	readonly serial: string;

	constructor(serial: string) {
		super("Calibration", vscode.TreeItemCollapsibleState.Collapsed);
		this.serial = serial;
		this.id = `thermoworks-calibration-${serial}`;
		this.iconPath = new vscode.ThemeIcon("beaker");
		this.contextValue = "calibrationFolder";
	}
}

export class CalibrationRecordNode extends vscode.TreeItem {
	readonly type = "calibrationRecord" as const;

	constructor(record: CalibrationRecord, index: number) {
		const dateStr = record.calibrationDate
			? record.calibrationDate.toLocaleDateString()
			: "Unknown date";
		const resultStr = record.result ?? "No result";
		super(`${dateStr}`, vscode.TreeItemCollapsibleState.None);
		this.id = `thermoworks-calibration-record-${record.calibrationId}-${index}`;
		this.description = resultStr;
		this.iconPath = new vscode.ThemeIcon("check");

		const tooltipParts = [`Date: ${dateStr}`, `Result: ${resultStr}`];
		if (record.performedBy) {
			tooltipParts.push(`Performed by: ${record.performedBy}`);
		}
		if (record.lowPointAdjustments.length > 0) {
			tooltipParts.push(`Low points: ${record.lowPointAdjustments.length}`);
		}
		if (record.highPointReference.length > 0) {
			tooltipParts.push(`High points: ${record.highPointReference.length}`);
		}
		this.tooltip = tooltipParts.join("\n");
	}
}

// ─── Duration Helpers ─────────────────────────────────────────────────────────

/**
 * Format elapsed time from a start date to now (or a given reference time).
 * Returns compact human-readable duration: "2h 5m" / "45m" / "30s".
 */
export function formatElapsed(start: Date, now: Date = new Date()): string {
	const ms = now.getTime() - start.getTime();
	if (ms < 0) return "";
	const totalSeconds = Math.floor(ms / 1_000);
	if (totalSeconds < 60) {
		return `${totalSeconds}s`;
	}
	const totalMinutes = Math.floor(totalSeconds / 60);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}

// ─── Archive Helpers ─────────────────────────────────────────────────────────

export function formatArchiveDuration(start: Date | null, end: Date | null): string {
	if (!start || !end) return "";
	const ms = end.getTime() - start.getTime();
	if (ms < 0) return "";
	const totalMinutes = Math.floor(ms / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0) {
		return `${hours}h ${minutes}m`;
	}
	return `${minutes}m`;
}

export function formatMinMax(channel: ArchiveChannel): string {
	const parts: string[] = [];
	if (channel.minimum?.value != null) {
		const units = channel.minimum.units ?? channel.units ?? "";
		parts.push(`min ${Math.round(channel.minimum.value)}\u00B0${units}`);
	}
	if (channel.maximum?.value != null) {
		const units = channel.maximum.units ?? channel.units ?? "";
		parts.push(`max ${Math.round(channel.maximum.value)}\u00B0${units}`);
	}
	return parts.join(" / ") || "--";
}

function buildArchiveTooltip(archive: Archive): string {
	const lines: string[] = [];
	if (archive.label) lines.push(archive.label);
	if (archive.start) {
		lines.push(`Start: ${archive.start.toLocaleString()}`);
	}
	if (archive.end) {
		lines.push(`End: ${archive.end.toLocaleString()}`);
	}
	if (archive.count != null) {
		lines.push(`Readings: ${archive.count}`);
	}
	if (archive.notes) {
		lines.push(`Notes: ${archive.notes}`);
	}
	return lines.join("\n");
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
	averageTemp?: { value: number; units: string } | null,
): TreeNode[] {
	const children: TreeNode[] = [];

	// Firmware update warning (shown first for visibility)
	if (firmwareOutdated && device.firmware) {
		children.push(new FirmwareWarningNode(device.firmware, device.serial));
	}

	// Temperature channels (filter out humidity-only)
	const tempChannels = channels.filter((ch) => ch.enabled !== false && ch.units !== "H");
	for (let i = 0; i < tempChannels.length; i++) {
		const ch = tempChannels[i];
		if (ch) {
			children.push(new ChannelNode(ch, device.serial, i));
		}
	}

	// Fan controller info (shown after channels for visibility)
	if (device.fan != null) {
		children.push(new FanDetailNode(device.fan, device.serial, device.deviceDisplayUnits));
	}

	// Average temperature (when available)
	if (averageTemp) {
		children.push(
			new DeviceDetailNode(
				"Avg Temp",
				`${Math.round(averageTemp.value)}\u00B0${averageTemp.units}`,
				device.serial,
			),
		);
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

	// Calibration folder (loads on expand)
	children.push(new CalibrationFolderNode(device.serial));

	// Archives folder (always present, loads on expand)
	children.push(new ArchivesFolderNode(device.serial));

	return children;
}
