import { Bell } from "lucide-react";
import { useState } from "react";
import type { DeviceChannel } from "thermoworks-sdk";
import { useTemperatureUnit } from "../hooks/useTemperatureUnit.ts";
import { type AlarmState, getChannelAlarmState, type ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";
import { AlarmConfig } from "./AlarmConfig.tsx";

interface ChannelReadingProps {
	channel: DeviceChannel;
	client?: ThermoworksWebClient;
	serial?: string;
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

export function ChannelReading({ channel, client, serial, onAlarmSaved }: ChannelReadingProps) {
	const { formatTemp } = useTemperatureUnit();
	const alarmState = getChannelAlarmState(channel);
	const label = channel.label ?? `Ch ${channel.number ?? "?"}`;
	const hasReading = channel.value != null && channel.units != null;
	const [showAlarmConfig, setShowAlarmConfig] = useState(false);

	const canConfigureAlarm = client != null && serial != null && channel.number != null;

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
						<span className={cn("text-lg tabular-nums font-mono", alarmColorClass(alarmState))}>
							{formatTemp(channel.value, channel.units)}
						</span>
					) : (
						<span className="text-sm text-muted-foreground">--</span>
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
