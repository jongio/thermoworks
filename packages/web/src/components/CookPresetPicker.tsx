import { ChefHat } from "lucide-react";
import { useMemo, useState } from "react";
import type { AlarmSetOptions } from "thermoworks-sdk";
import { useTemperatureGuide } from "../hooks/useTemperatureGuide.ts";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { buildCookPresets, guideWithFallback } from "../lib/temperatureGuide.ts";
import { cn } from "../lib/utils.ts";

export interface CookPresetChannel {
	number: number;
	label: string;
	units: string;
}

type StepState =
	| { status: "idle"; message: string }
	| { status: "pending"; message: string }
	| { status: "success"; message: string }
	| { status: "error"; message: string };

interface CookPresetPickerProps {
	client: ThermoworksWebClient;
	serial: string;
	channels: CookPresetChannel[];
	sessionActive: boolean;
	onSessionApplied: (label: string, startedAt: Date | null) => void;
}

function sanitizeDisplayText(value: string): string {
	return value.replace(/[<>&]/g, "").replace(/\p{C}/gu, "").trim();
}

function errorMessage(err: unknown, fallback: string): string {
	return err instanceof Error ? err.message : fallback;
}

function stepClassName(status: StepState["status"]): string {
	if (status === "success") return "text-green-600 dark:text-green-400";
	if (status === "error") return "text-destructive";
	if (status === "pending") return "text-muted-foreground";
	return "text-muted-foreground";
}

export function CookPresetPicker({
	client,
	serial,
	channels,
	sessionActive,
	onSessionApplied,
}: CookPresetPickerProps) {
	const { data, isLoading, error } = useTemperatureGuide(client);
	const presets = useMemo(() => buildCookPresets(guideWithFallback(data)), [data]);
	const safeChannels = useMemo(
		() =>
			channels.map((channel) => ({
				...channel,
				label: sanitizeDisplayText(channel.label) || `Channel ${channel.number}`,
			})),
		[channels],
	);
	const [presetId, setPresetId] = useState("");
	const [channelNumber, setChannelNumber] = useState("");
	const [applying, setApplying] = useState(false);
	const [sessionStep, setSessionStep] = useState<StepState>({
		status: "idle",
		message: "Session label not applied yet.",
	});
	const [alarmStep, setAlarmStep] = useState<StepState>({
		status: "idle",
		message: "Channel alarm not applied yet.",
	});

	const selectedPreset = presets.find((preset) => preset.id === presetId) ?? null;
	const selectedChannel =
		safeChannels.find((channel) => String(channel.number) === channelNumber) ?? null;

	const alarmConfig: AlarmSetOptions | null = selectedPreset
		? {
				high: {
					value: selectedPreset.item.temp,
					units: selectedPreset.item.units,
					enabled: true,
				},
			}
		: null;

	const applyPreset = async () => {
		if (!selectedPreset || !selectedChannel || !alarmConfig) return;
		setApplying(true);
		setSessionStep({ status: "pending", message: "Applying session label..." });
		setAlarmStep({ status: "pending", message: "Applying channel alarm..." });

		const sessionPromise = (async () => {
			if (sessionActive) {
				const result = await client.updateDeviceState(serial, {
					sessionLabel: selectedPreset.sessionLabel,
				});
				if (!result.success) throw new Error("Failed to update session label");
				return { startedAt: null };
			}
			const result = await client.startSession(serial, selectedPreset.sessionLabel);
			if (!result.success) throw new Error("Failed to start session");
			return { startedAt: new Date() };
		})();

		const alarmPromise = client.setAlarm(serial, selectedChannel.number, alarmConfig);
		const [sessionResult, alarmResult] = await Promise.allSettled([sessionPromise, alarmPromise]);

		if (sessionResult.status === "fulfilled") {
			onSessionApplied(selectedPreset.sessionLabel, sessionResult.value.startedAt);
			setSessionStep({
				status: "success",
				message: sessionActive
					? `Updated session label to "${selectedPreset.sessionLabel}".`
					: `Started session "${selectedPreset.sessionLabel}".`,
			});
		} else {
			setSessionStep({
				status: "error",
				message: errorMessage(sessionResult.reason, "Session step failed"),
			});
		}

		if (alarmResult.status === "fulfilled") {
			setAlarmStep({
				status: "success",
				message: `Set ${selectedChannel.label} high alarm to ${selectedPreset.item.temp}\u00B0${selectedPreset.item.units}.`,
			});
		} else {
			setAlarmStep({
				status: "error",
				message: errorMessage(alarmResult.reason, "Alarm step failed"),
			});
		}

		setApplying(false);
	};

	if (safeChannels.length === 0) return null;

	return (
		<section className="mt-3 rounded-md border border-border bg-muted/30 p-3">
			<div className="mb-2 flex items-center gap-1.5">
				<ChefHat className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
				<p className="text-xs font-semibold">Cook preset</p>
			</div>
			<div className="grid gap-2 sm:grid-cols-2">
				<label className="space-y-1 text-xs">
					<span className="text-muted-foreground">Food target</span>
					<select
						value={presetId}
						onChange={(e) => setPresetId(e.target.value)}
						className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
						aria-label="Cook preset"
					>
						<option value="">{isLoading ? "Loading presets..." : "Choose a preset"}</option>
						{presets.map((preset) => (
							<option key={preset.id} value={preset.id}>
								{preset.label} - {preset.item.temp}
								{"\u00B0"}
								{preset.item.units}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1 text-xs">
					<span className="text-muted-foreground">Device channel</span>
					<select
						value={channelNumber}
						onChange={(e) => setChannelNumber(e.target.value)}
						className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
						aria-label="Preset channel"
					>
						<option value="">Choose a channel</option>
						{safeChannels.map((channel) => (
							<option key={channel.number} value={channel.number}>
								{channel.label} ({`\u00B0${channel.units}`})
							</option>
						))}
					</select>
				</label>
			</div>

			{error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

			{selectedPreset && selectedChannel && alarmConfig?.high ? (
				<div className="mt-2 rounded-md border border-border bg-background p-2 text-xs">
					<p className="font-medium">Preview alarm changes</p>
					<ul className="mt-1 space-y-0.5 text-muted-foreground">
						<li>Session label: {selectedPreset.sessionLabel}</li>
						<li>
							{selectedChannel.label}: enable high alarm at {alarmConfig.high.value}
							{"\u00B0"}
							{alarmConfig.high.units}
						</li>
						<li>Low alarm: unchanged</li>
					</ul>
				</div>
			) : null}

			<div className="mt-2 flex items-center justify-between gap-2">
				<div className="space-y-0.5 text-xs" aria-live="polite">
					<p className={stepClassName(sessionStep.status)}>Session: {sessionStep.message}</p>
					<p className={stepClassName(alarmStep.status)}>Alarm: {alarmStep.message}</p>
				</div>
				<button
					type="button"
					onClick={applyPreset}
					disabled={!selectedPreset || !selectedChannel || applying}
					className={cn(
						"rounded-md px-2.5 py-1 text-xs font-medium",
						"bg-primary text-primary-foreground hover:bg-primary/90",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:opacity-50",
					)}
				>
					{applying ? "Applying..." : sessionActive ? "Update cook" : "Start preset cook"}
				</button>
			</div>
		</section>
	);
}
