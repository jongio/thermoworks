import { Maximize2, Minimize2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { OfflineCacheProvider } from "../context/OfflineCacheContext.tsx";
import { TemperatureUnitProvider } from "../context/TemperatureUnitContext.tsx";
import { useDevices } from "../hooks/useDevices.ts";
import { useSubscription } from "../hooks/useSubscription.ts";
import { useTemperatureUnit } from "../hooks/useTemperatureUnit.ts";
import {
	type AlarmState,
	type DeviceWithChannels,
	getChannelAlarmState,
	ThermoworksWebClient,
} from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

/** Interval in ms to auto-rotate between devices when in single-device view. */
const AUTO_ROTATE_INTERVAL_MS = 8_000;

/** Threshold for switching from grid to single-device auto-rotate view. */
const GRID_MAX_CHANNELS = 12;

interface ChannelDisplay {
	/** Stable identifier for keying: serial + channel number. */
	id: string;
	deviceName: string;
	channelLabel: string;
	value: number | null;
	units: string | null;
	alarmState: AlarmState;
	targets: ChannelTarget[];
}

interface ChannelTarget {
	kind: "high" | "low";
	value: number;
	units: string;
	alarming: boolean;
}

function extractChannels(devices: DeviceWithChannels[]): ChannelDisplay[] {
	const results: ChannelDisplay[] = [];
	for (const { device, channels } of devices) {
		const deviceName = device.label ?? device.serial;
		for (const channel of channels) {
			if (channel.enabled === false) continue;
			results.push({
				id: `${device.serial}-${channel.number ?? channel.label ?? results.length}`,
				deviceName,
				channelLabel: channel.label ?? `Ch ${channel.number ?? "?"}`,
				value: channel.value ?? null,
				units: channel.units ?? null,
				alarmState: getChannelAlarmState(channel),
				targets: [
					channel.alarmHigh?.enabled && channel.alarmHigh.value != null && channel.alarmHigh.units
						? {
								kind: "high",
								value: channel.alarmHigh.value,
								units: channel.alarmHigh.units,
								alarming: channel.alarmHigh.alarming,
							}
						: null,
					channel.alarmLow?.enabled && channel.alarmLow.value != null && channel.alarmLow.units
						? {
								kind: "low",
								value: channel.alarmLow.value,
								units: channel.alarmLow.units,
								alarming: channel.alarmLow.alarming,
							}
						: null,
				].filter((target): target is ChannelTarget => target !== null),
			});
		}
	}
	return results;
}

function alarmBorderClass(state: AlarmState): string {
	switch (state) {
		case "high":
			return "border-alarm-high";
		case "low":
			return "border-alarm-low";
		case "none":
			return "border-neutral-700";
	}
}

function alarmTextClass(state: AlarmState): string {
	switch (state) {
		case "high":
			return "text-alarm-high";
		case "low":
			return "text-alarm-low";
		case "none":
			return "text-neutral-100";
	}
}

function alarmPulseClass(state: AlarmState): string {
	if (state === "high" || state === "low") return "animate-pulse";
	return "";
}

function formatTargetGap({
	current,
	currentUnits,
	target,
	convert,
	unit,
}: {
	current: number;
	currentUnits: string;
	target: ChannelTarget;
	convert: (value: number, fromUnit: string) => number;
	unit: string;
}): string {
	const currentValue = convert(current, currentUnits);
	const targetValue = convert(target.value, target.units);
	const delta = target.kind === "high" ? targetValue - currentValue : currentValue - targetValue;
	const absDelta = Math.abs(delta).toFixed(1);

	if (Math.abs(delta) < 0.05) return `At ${target.kind} target`;
	if (target.kind === "high") {
		return delta > 0
			? `${absDelta}°${unit} to high target`
			: `${absDelta}°${unit} past high target`;
	}
	return delta > 0 ? `${absDelta}°${unit} above low target` : `${absDelta}°${unit} past low target`;
}

/** Single channel tile for the grid/carousel layout. */
function ChannelTile({ channel, large }: { channel: ChannelDisplay; large?: boolean }) {
	const { convert, formatTemp, unit } = useTemperatureUnit();
	const hasReading = channel.value != null && channel.units != null;

	return (
		<section
			className={cn(
				"flex flex-col items-center justify-center rounded-lg border-2 p-4",
				alarmBorderClass(channel.alarmState),
				alarmPulseClass(channel.alarmState),
				large ? "min-h-[60vh]" : "min-h-[200px]",
			)}
			aria-label={`${channel.channelLabel} on ${channel.deviceName}`}
		>
			<span className="text-neutral-400 text-sm tracking-wide uppercase truncate max-w-full">
				{channel.deviceName}
			</span>
			<span className="text-neutral-300 text-lg mt-1 truncate max-w-full">
				{channel.channelLabel}
			</span>
			{hasReading ? (
				<span
					className={cn(
						"font-mono tabular-nums font-bold mt-3",
						large ? "text-7xl sm:text-8xl md:text-9xl" : "text-4xl sm:text-5xl md:text-6xl",
						alarmTextClass(channel.alarmState),
					)}
				>
					{formatTemp(channel.value as number, channel.units as string)}
				</span>
			) : (
				<span className="text-neutral-500 text-5xl mt-3 font-mono">--</span>
			)}
			{hasReading && channel.targets.length > 0 && (
				<div className="mt-3 flex flex-col items-center gap-1 text-neutral-300 text-sm">
					{channel.targets.map((target) => (
						<span
							key={target.kind}
							className={cn(
								target.kind === "high" ? "text-alarm-high" : "text-alarm-low",
								target.alarming && "font-semibold",
							)}
						>
							{formatTargetGap({
								current: channel.value as number,
								currentUnits: channel.units as string,
								target,
								convert,
								unit,
							})}
						</span>
					))}
				</div>
			)}
		</section>
	);
}

/** Grid layout showing all channels simultaneously. */
function ChannelGrid({ channels }: { channels: ChannelDisplay[] }) {
	const colCount = channels.length <= 2 ? 1 : channels.length <= 4 ? 2 : 3;

	return (
		<div
			className={cn(
				"grid gap-4 p-4 h-full content-center",
				colCount === 1 && "grid-cols-1",
				colCount === 2 && "grid-cols-1 sm:grid-cols-2",
				colCount === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
			)}
		>
			{channels.map((ch) => (
				<ChannelTile key={ch.id} channel={ch} />
			))}
		</div>
	);
}

/** Single channel carousel with auto-rotation. */
function ChannelCarousel({ channels }: { channels: ChannelDisplay[] }) {
	const [activeIndex, setActiveIndex] = useState(0);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		if (channels.length <= 1) return;
		intervalRef.current = setInterval(() => {
			setActiveIndex((prev) => (prev + 1) % channels.length);
		}, AUTO_ROTATE_INTERVAL_MS);
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [channels.length]);

	// Clamp index if channels shrink
	const safeIndex = activeIndex < channels.length ? activeIndex : 0;
	const current = channels[safeIndex];
	if (!current) return null;

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 flex items-center justify-center p-4">
				<div className="w-full max-w-3xl">
					<ChannelTile channel={current} large />
				</div>
			</div>
			{channels.length > 1 && (
				<div
					className="flex justify-center gap-2 pb-4"
					role="tablist"
					aria-label="Channel indicators"
				>
					{channels.map((ch, idx) => (
						<button
							key={ch.id}
							type="button"
							role="tab"
							aria-selected={idx === safeIndex}
							aria-label={`${ch.channelLabel} on ${ch.deviceName}`}
							className={cn(
								"h-3 w-3 rounded-full transition-colors",
								idx === safeIndex ? "bg-neutral-100" : "bg-neutral-600",
							)}
							onClick={() => setActiveIndex(idx)}
						/>
					))}
				</div>
			)}
		</div>
	);
}

/** Inner pit display content that consumes context providers. */
function PitDisplayContent({ client }: { client: ThermoworksWebClient }) {
	const { intervalMs } = useSubscription({ enabled: true });
	const { data, isLoading, error } = useDevices(client, { pollingInterval: intervalMs });
	const [isFullscreen, setIsFullscreen] = useState(false);

	const channels = useMemo(() => extractChannels(data), [data]);
	const useGrid = channels.length > 0 && channels.length <= GRID_MAX_CHANNELS;

	const toggleFullscreen = useCallback(async () => {
		try {
			if (!document.fullscreenElement) {
				await document.documentElement.requestFullscreen();
				setIsFullscreen(true);
			} else {
				await document.exitFullscreen();
				setIsFullscreen(false);
			}
		} catch {
			// Fullscreen API not available or denied
		}
	}, []);

	// Sync fullscreen state with browser changes (e.g., user presses Escape)
	useEffect(() => {
		function handleChange() {
			setIsFullscreen(!!document.fullscreenElement);
		}
		document.addEventListener("fullscreenchange", handleChange);
		return () => document.removeEventListener("fullscreenchange", handleChange);
	}, []);

	// Keyboard shortcut: Escape exits pit mode (navigates back)
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape" && !document.fullscreenElement) {
				window.location.hash = "#/";
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	if (isLoading && channels.length === 0) {
		return (
			<div className="flex items-center justify-center h-screen bg-neutral-950 text-neutral-400">
				<p className="text-xl">Loading devices...</p>
			</div>
		);
	}

	if (error && channels.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-screen bg-neutral-950 text-neutral-400 gap-4">
				<p className="text-xl">Failed to load devices</p>
				<p className="text-sm">{error}</p>
				<Link to="/" className="text-sm underline text-neutral-300 hover:text-white">
					Return to Dashboard
				</Link>
			</div>
		);
	}

	if (channels.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-screen bg-neutral-950 text-neutral-400 gap-4">
				<p className="text-xl">No active channels</p>
				<p className="text-sm">Connect a device to see temperatures here.</p>
				<Link to="/" className="text-sm underline text-neutral-300 hover:text-white">
					Return to Dashboard
				</Link>
			</div>
		);
	}

	return (
		<div className="h-screen bg-neutral-950 text-neutral-100 flex flex-col overflow-hidden">
			{/* Minimal header toolbar */}
			<div className="flex items-center justify-between px-4 py-2 shrink-0">
				<Link
					to="/"
					className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-neutral-100 text-sm transition-colors"
					aria-label="Exit pit display"
				>
					<X className="h-4 w-4" />
					<span className="hidden sm:inline">Exit</span>
				</Link>
				<span className="text-neutral-500 text-xs">
					{channels.length} channel{channels.length !== 1 ? "s" : ""} active
				</span>
				<button
					type="button"
					onClick={toggleFullscreen}
					className="text-neutral-400 hover:text-neutral-100 transition-colors p-1 rounded"
					aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
				>
					{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
				</button>
			</div>

			{/* Main content */}
			<div className="flex-1 min-h-0">
				{useGrid ? <ChannelGrid channels={channels} /> : <ChannelCarousel channels={channels} />}
			</div>
		</div>
	);
}

/** Restore the authenticated client from session storage. */
function restoreClient(): ThermoworksWebClient | null {
	const client = new ThermoworksWebClient();
	return client.isAuthenticated ? client : null;
}

/**
 * Full-screen pit display page.
 * Shows temperatures in a large, glanceable format suitable for
 * tablets, kitchen screens, or shop TVs during long cooks.
 */
export function PitDisplay() {
	const [client] = useState(restoreClient);

	if (!client) {
		return (
			<div className="flex flex-col items-center justify-center h-screen bg-neutral-950 text-neutral-400 gap-4">
				<p className="text-xl">Not signed in</p>
				<p className="text-sm">Sign in from the dashboard to use pit display mode.</p>
				<Link to="/" className="text-sm underline text-neutral-300 hover:text-white">
					Go to Dashboard
				</Link>
			</div>
		);
	}

	return (
		<TemperatureUnitProvider>
			<OfflineCacheProvider>
				<PitDisplayContent client={client} />
			</OfflineCacheProvider>
		</TemperatureUnitProvider>
	);
}
