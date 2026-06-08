import type { DeviceChannel } from "thermoworks-sdk";
import { useTemperatureUnit } from "../hooks/useTemperatureUnit.ts";
import { type AlarmState, getChannelAlarmState } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

interface ChannelReadingProps {
	channel: DeviceChannel;
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

export function ChannelReading({ channel }: ChannelReadingProps) {
	const { formatTemp } = useTemperatureUnit();
	const alarmState = getChannelAlarmState(channel);
	const label = channel.label ?? `Ch ${channel.number ?? "?"}`;
	const hasReading = channel.value != null && channel.units != null;

	return (
		<div
			className={cn(
				"flex items-center justify-between rounded-md border px-3 py-2",
				alarmBgClass(alarmState),
			)}
		>
			<span className="text-sm text-muted-foreground truncate mr-2">{label}</span>
			{hasReading ? (
				<span className={cn("text-lg tabular-nums font-mono", alarmColorClass(alarmState))}>
					{formatTemp(channel.value, channel.units)}
				</span>
			) : (
				<span className="text-sm text-muted-foreground">--</span>
			)}
		</div>
	);
}
