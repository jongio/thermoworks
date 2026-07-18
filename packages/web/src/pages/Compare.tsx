import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import type { ArchiveChannel, DeviceChannel, TemperatureReading } from "thermoworks-sdk";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import {
	TEMPERATURE_CHART_FALLBACK_COLORS,
	TemperatureChart,
} from "../components/TemperatureChart.tsx";
import { useDevices } from "../hooks/useDevices.ts";
import { useTemperatureUnit } from "../hooks/useTemperatureUnit.ts";
import type { DeviceWithChannels } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

const STORAGE_KEY = "thermoworks-web:compare-selected-channels:v1";
const MAX_READING_POINTS = 1_000;

interface CompareChannel {
	id: string;
	deviceSerial: string;
	deviceName: string;
	channelIndex: number;
	channel: DeviceChannel;
	label: string;
	color: string;
}

function sanitizeDisplayLabel(value: string | null | undefined, fallback: string): string {
	const withoutControlCharacters = Array.from(value ?? "", (character) => {
		const code = character.charCodeAt(0);
		return code < 32 || (code >= 127 && code <= 159) ? " " : character;
	}).join("");
	const cleaned = withoutControlCharacters.replace(/\s+/g, " ").trim();
	return (cleaned || fallback).slice(0, 120);
}

function channelId(deviceSerial: string, channel: DeviceChannel, index: number): string {
	return `${deviceSerial}::${channel.number ?? index}`;
}

function getChannelFallbackLabel(channel: DeviceChannel, index: number): string {
	return `Ch ${channel.number ?? index + 1}`;
}

function getChannelTimestamp(channel: DeviceChannel): Date {
	return channel.lastTelemetrySaved ?? channel.lastSeen ?? new Date();
}

function loadSelection(): string[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((value): value is string => typeof value === "string");
	} catch {
		return [];
	}
}

function getSelectableChannels(devices: DeviceWithChannels[]): CompareChannel[] {
	const channels: CompareChannel[] = [];

	for (const item of devices) {
		const deviceName = sanitizeDisplayLabel(item.device.label, item.device.serial);
		for (let index = 0; index < item.channels.length; index++) {
			const channel = item.channels[index];
			if (!channel || channel.enabled === false) continue;
			const id = channelId(item.device.serial, channel, index);
			const label = `${deviceName} · ${sanitizeDisplayLabel(
				channel.label,
				getChannelFallbackLabel(channel, index),
			)}`;
			const fallbackColor =
				TEMPERATURE_CHART_FALLBACK_COLORS[
					channels.length % TEMPERATURE_CHART_FALLBACK_COLORS.length
				] ?? "#6b7280";
			const color =
				channel.color && channel.color !== "none" && channel.color !== "transparent"
					? channel.color
					: fallbackColor;

			channels.push({
				id,
				deviceSerial: item.device.serial,
				deviceName,
				channelIndex: index,
				channel,
				label,
				color,
			});
		}
	}

	return channels;
}

function appendLiveReadings(
	previous: Record<string, TemperatureReading[]>,
	selected: CompareChannel[],
): Record<string, TemperatureReading[]> {
	let changed = false;
	const next: Record<string, TemperatureReading[]> = { ...previous };

	for (const item of selected) {
		if (item.channel.value == null) continue;
		const reading = {
			value: item.channel.value,
			timestamp: getChannelTimestamp(item.channel),
			units: item.channel.units ?? "F",
		};
		const existing = next[item.id] ?? [];
		const last = existing[existing.length - 1];
		if (
			last &&
			last.timestamp.getTime() === reading.timestamp.getTime() &&
			last.value === reading.value &&
			last.units === reading.units
		) {
			continue;
		}

		next[item.id] = [...existing, reading].slice(-MAX_READING_POINTS);
		changed = true;
	}

	return changed ? next : previous;
}

function toArchiveChannel(
	item: CompareChannel,
	readings: TemperatureReading[],
	index: number,
): ArchiveChannel {
	return {
		number: `compare_${index}`,
		label: item.label,
		units: item.channel.units ?? "F",
		value: item.channel.value,
		status: item.channel.status,
		enabled: item.channel.enabled,
		color: item.color,
		type: item.channel.type,
		alarmHigh: item.channel.alarmHigh,
		alarmLow: item.channel.alarmLow,
		minimum: item.channel.minimum,
		maximum: item.channel.maximum,
		recentReadings: readings,
	};
}

export function Compare() {
	const { client } = useOutletContext<AppOutletContext>();
	const { unit } = useTemperatureUnit();
	const { data, isLoading, error, lastUpdated, refresh } = useDevices(client);
	const [selectedIds, setSelectedIds] = useState<string[]>(loadSelection);
	const [readingsById, setReadingsById] = useState<Record<string, TemperatureReading[]>>({});

	const selectableChannels = useMemo(() => getSelectableChannels(data), [data]);
	const selectableById = useMemo(
		() => new Map(selectableChannels.map((channel) => [channel.id, channel])),
		[selectableChannels],
	);
	const selectedChannels = useMemo(
		() =>
			selectedIds
				.map((id) => selectableById.get(id))
				.filter((channel): channel is CompareChannel => Boolean(channel)),
		[selectedIds, selectableById],
	);

	useEffect(() => {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds));
		} catch {
			// Storage unavailable — selection just won't persist.
		}
	}, [selectedIds]);

	useEffect(() => {
		setReadingsById((current) => appendLiveReadings(current, selectedChannels));
	}, [selectedChannels]);

	const chartChannels = useMemo(
		() =>
			selectedChannels
				.map((item, index) => {
					const readings = readingsById[item.id] ?? [];
					if (readings.length === 0) return null;
					return toArchiveChannel(item, readings, index);
				})
				.filter((channel): channel is ArchiveChannel => Boolean(channel)),
		[selectedChannels, readingsById],
	);

	function toggleChannel(id: string) {
		setSelectedIds((current) =>
			current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Compare channels</h1>
					<p className="text-sm text-muted-foreground">
						Select live channels from multiple devices to view them on one chart.
					</p>
				</div>
				<button
					type="button"
					onClick={refresh}
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm",
						"border border-border text-muted-foreground",
						"hover:bg-muted hover:text-foreground transition-colors",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					)}
				>
					<RefreshCw className="h-4 w-4" aria-hidden="true" />
					Refresh
				</button>
			</div>

			{error && (
				<div className="rounded-md border border-destructive p-3 text-sm text-destructive">
					{error}
				</div>
			)}

			<section className="rounded-lg border border-border bg-card p-4">
				<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
					<div>
						<h2 className="font-medium">Available channels</h2>
						<p className="text-xs text-muted-foreground">
							{selectedChannels.length} selected
							{lastUpdated ? ` · updated ${lastUpdated.toLocaleTimeString()}` : ""}
						</p>
					</div>
					{isLoading && <span className="text-xs text-muted-foreground">Loading…</span>}
				</div>

				{selectableChannels.length > 0 ? (
					<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{selectableChannels.map((item) => (
							<label
								key={item.id}
								className={cn(
									"flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 text-sm",
									"hover:bg-muted/50",
								)}
							>
								<input
									type="checkbox"
									checked={selectedIds.includes(item.id)}
									onChange={() => toggleChannel(item.id)}
									aria-label={`Select ${item.label}`}
									className="rounded border-border"
								/>
								<span
									className="h-3 w-3 shrink-0 rounded-full"
									style={{ backgroundColor: item.color }}
									aria-hidden="true"
								/>
								<span className="min-w-0">
									<span className="block truncate font-medium">{item.label}</span>
									<span className="block truncate text-xs text-muted-foreground">
										{item.channel.value != null
											? `${item.channel.value.toFixed(1)}°${item.channel.units ?? "F"}`
											: `No live reading · ${item.deviceSerial}`}
									</span>
								</span>
							</label>
						))}
					</div>
				) : (
					<p className="text-sm text-muted-foreground">No active channels available.</p>
				)}
			</section>

			<section className="rounded-lg border border-border bg-card p-4">
				<div className="mb-3">
					<h2 className="font-medium">Live comparison</h2>
					<p className="text-xs text-muted-foreground">
						Selected channel labels, colors, and values use the active temperature unit.
					</p>
				</div>

				{chartChannels.length > 0 ? (
					<div className="space-y-3">
						<ul className="flex flex-wrap gap-2" aria-label="Selected channel legend">
							{chartChannels.map((channel) => (
								<li
									key={channel.number}
									className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs"
								>
									<span
										className="h-2.5 w-2.5 rounded-full"
										style={{ backgroundColor: channel.color ?? "#6b7280" }}
										aria-hidden="true"
									/>
									{channel.label} · °{unit}
								</li>
							))}
						</ul>
						<TemperatureChart channels={chartChannels} />
					</div>
				) : (
					<p className="py-8 text-center text-sm text-muted-foreground">
						Select channels with live readings to start comparing.
					</p>
				)}
			</section>
		</div>
	);
}
