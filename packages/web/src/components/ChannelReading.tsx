import { Bell, X } from "lucide-react";
import { useState } from "react";
import type { DeviceChannel } from "thermoworks-sdk";
import { formatSnoozeRemaining, SNOOZE_PRESETS, useAlarmSnooze } from "../hooks/useAlarmSnooze.ts";
import { useTemperatureUnit } from "../hooks/useTemperatureUnit.ts";
import { type AlarmState, getChannelAlarmState, type ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { AlarmConfig } from "./AlarmConfig.tsx";

/** 5 minutes in milliseconds. */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

/** Check whether a channel reading is stale (older than 5 minutes). */
function isChannelStale(channel: DeviceChannel): boolean {
	if (!channel.lastSeen) return false;
	return Date.now() - channel.lastSeen.getTime() >= STALE_THRESHOLD_MS;
}

interface ChannelReadingProps {
	channel: DeviceChannel;
	client?: ThermoworksWebClient;
	serial?: string;
	/** Resolved display name (custom label > cloud label > "Ch N"). */
	displayName?: string;
	onAlarmSaved?: () => void;
}

function alarmColorClass(state: AlarmState): string {
	switch (state) {
		case "high":
			return "text-alarm-high font-bold";
		case "low":
			return "text-alarm-low font-bold";
		case "none":
			return "text-foreground";
	}
}

function alarmBgClass(state: AlarmState): string {
	switch (state) {
		case "high":
			return "bg-alarm-high/10 border-alarm-high/30";
		case "low":
			return "bg-alarm-low/10 border-alarm-low/30";
		case "none":
			return "bg-muted/50 border-border";
	}
}

export function ChannelReading({
	channel,
	client,
	serial,
	displayName,
	onAlarmSaved,
}: ChannelReadingProps) {
	const { formatTemp } = useTemperatureUnit();
	const alarmState = getChannelAlarmState(channel);
	const label = displayName ?? channel.label ?? `Ch ${channel.number ?? "?"}`;
	const hasReading = channel.value != null && channel.units != null;
	const stale = isChannelStale(channel);
	const [showAlarmConfig, setShowAlarmConfig] = useState(false);

	const canConfigureAlarm = client != null && serial != null && channel.number != null;

	// Alarm snooze state (local to browser, does not touch cloud settings).
	const { snooze, unsnooze, isSnoozed, getRemainingMs } = useAlarmSnooze();
	const channelNumber = channel.number;

	return (
		<>
			<div
				className={cn(
					"flex items-center justify-between rounded-md border px-3 py-2",
					alarmBgClass(alarmState),
				)}
			>
				<span className="text-sm text-muted-foreground truncate mr-2">{label}</span>
				<div className="flex items-center gap-2">
					{hasReading ? (
						<span
							className={cn(
								"text-lg tabular-nums font-mono",
								alarmColorClass(alarmState),
								stale && "opacity-50",
							)}
						>
							{formatTemp(channel.value, channel.units)}
						</span>
					) : (
						<span className="text-sm text-muted-foreground">--</span>
					)}
					{stale && (
						<span
							role="status"
							className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
							aria-label="Stale reading"
						>
							stale
						</span>
					)}
					{canConfigureAlarm && (
						<button
							type="button"
							onClick={() => setShowAlarmConfig(true)}
							className={cn(
								"rounded p-1 transition-colors",
								"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								channel.alarmHigh?.enabled || channel.alarmLow?.enabled
									? "text-primary"
									: "text-muted-foreground",
							)}
							aria-label={`Configure alarm for ${label}`}
							title="Configure alarm"
						>
							<Bell className="h-3.5 w-3.5" />
						</button>
					)}
				</div>
			</div>
			{alarmState !== "none" &&
				serial != null &&
				channelNumber != null &&
				(isSnoozed(serial, channelNumber, alarmState) ? (
					<div className="flex items-center gap-1.5 px-3 pb-1">
						<span
							role="status"
							className={cn(
								"rounded bg-muted px-1.5 py-0.5",
								"text-[10px] font-medium text-muted-foreground",
							)}
							aria-label="Alarm snoozed"
						>
							Snoozed: {formatSnoozeRemaining(getRemainingMs(serial, channelNumber, alarmState))}
						</span>
						<button
							type="button"
							onClick={() => unsnooze(serial, channelNumber, alarmState)}
							className={cn(
								"rounded p-0.5 transition-colors",
								"text-muted-foreground hover:bg-muted hover:text-foreground",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							)}
							aria-label={`Cancel snooze for ${label}`}
							title="Cancel snooze"
						>
							<X className="h-3 w-3" />
						</button>
					</div>
				) : (
					<fieldset
						className="flex items-center gap-1 border-0 px-3 pb-1"
						aria-label={`Snooze alarm for ${label}`}
					>
						<span className="text-[10px] text-muted-foreground">Snooze:</span>
						{SNOOZE_PRESETS.map((minutes) => (
							<button
								key={minutes}
								type="button"
								onClick={() => snooze(serial, channelNumber, alarmState, minutes)}
								className={cn(
									"rounded px-1.5 py-0.5 text-[10px] font-medium",
									"text-muted-foreground transition-colors",
									"hover:bg-muted hover:text-foreground",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								)}
								aria-label={`Snooze alarm for ${minutes} minutes`}
							>
								{minutes}m
							</button>
						))}
					</fieldset>
				))}
			{showAlarmConfig && canConfigureAlarm && (
				<AlarmConfig
					client={client}
					serial={serial}
					channelNumber={Number(channel.number)}
					channelUnits={channel.units ?? "F"}
					currentHighValue={channel.alarmHigh?.value ?? null}
					currentHighEnabled={channel.alarmHigh?.enabled ?? false}
					currentLowValue={channel.alarmLow?.value ?? null}
					currentLowEnabled={channel.alarmLow?.enabled ?? false}
					onClose={() => setShowAlarmConfig(false)}
					onSaved={() => {
						setShowAlarmConfig(false);
						onAlarmSaved?.();
					}}
				/>
			)}
		</>
	);
}
