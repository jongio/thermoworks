import type { AlarmState, DeviceChannel } from "thermoworks-sdk";
import { getChannelAlarmState } from "thermoworks-sdk";
import * as vscode from "vscode";

/**
 * Tracks alarm state transitions per device channel and fires
 * VS Code desktop notifications only on state changes.
 */
export class AlarmNotifier implements vscode.Disposable {
	private readonly previousStates = new Map<string, AlarmState>();
	private disposed = false;

	/**
	 * Check channels for alarm state changes and notify the user.
	 * Only fires a notification when a channel transitions from "none" to "high"/"low".
	 *
	 * @param deviceLabel - Human-readable device name (e.g. "Smoker")
	 * @param serial - Device serial number (used as part of the state key)
	 * @param channels - Current channel readings from the device
	 */
	checkAndNotify(deviceLabel: string, serial: string, channels: DeviceChannel[]): void {
		if (this.disposed || !this.isEnabled()) return;

		for (const channel of channels) {
			if (channel.value == null || channel.units == null) continue;

			const channelKey = `${serial}:${channel.number ?? "0"}`;
			const currentState = getChannelAlarmState(channel);
			const previousState = this.previousStates.get(channelKey) ?? "none";

			this.previousStates.set(channelKey, currentState);

			// Only notify on transitions INTO an alarm state (not ongoing alarms)
			if (currentState !== "none" && previousState === "none") {
				this.fireNotification(deviceLabel, channel, currentState);
			}
		}
	}

	/** Clear all tracked state (e.g. on logout or dispose). */
	reset(): void {
		this.previousStates.clear();
	}

	dispose(): void {
		this.disposed = true;
		this.previousStates.clear();
	}

	private isEnabled(): boolean {
		return vscode.workspace.getConfiguration("thermoworks").get<boolean>("notifications", true);
	}

	private fireNotification(deviceLabel: string, channel: DeviceChannel, state: AlarmState): void {
		const channelLabel = channel.label ?? `Ch${channel.number ?? "?"}`;
		const temp = Math.round(channel.value!);
		const units = channel.units!;
		const threshold = this.getThresholdText(channel, state);

		const message = `${deviceLabel} - ${channelLabel}: ${temp}\u00B0${units}${threshold}`;

		if (state === "high") {
			vscode.window.showErrorMessage(`\u{1F321}\uFE0F High alarm: ${message}`);
		} else {
			vscode.window.showWarningMessage(`\u{1F321}\uFE0F Low alarm: ${message}`);
		}
	}

	private getThresholdText(channel: DeviceChannel, state: AlarmState): string {
		const alarm = state === "high" ? channel.alarmHigh : channel.alarmLow;
		if (alarm?.value != null && alarm.units != null) {
			const direction = state === "high" ? "above" : "below";
			return ` (${direction} ${alarm.value}\u00B0${alarm.units})`;
		}
		return "";
	}
}
