import { Globe, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { Device, DeviceChannel } from "thermoworks-sdk";
import { ChannelReading } from "../components/ChannelReading.tsx";
import { ShareError, ShareHeader, ShareLoading } from "../components/ShareLayout.tsx";
import { TemperatureUnitProvider } from "../context/TemperatureUnitContext.tsx";
import { getPublicDevice, getPublicDeviceChannels } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

const REFRESH_INTERVAL_MS = 30_000;

export function SharedDeviceView() {
	const { serial } = useParams<{ serial: string }>();
	const [device, setDevice] = useState<Device | null>(null);
	const [channels, setChannels] = useState<DeviceChannel[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const fetchData = useCallback(async () => {
		if (!serial) return;
		setIsLoading(true);
		setError(null);

		try {
			const [dev, chs] = await Promise.all([
				getPublicDevice(serial),
				getPublicDeviceChannels(serial),
			]);
			if (!dev) {
				setError("Device not found or not publicly shared.");
				setDevice(null);
				setChannels([]);
			} else {
				setDevice(dev);
				setChannels(chs);
				setLastUpdated(new Date());
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load shared device.");
		} finally {
			setIsLoading(false);
		}
	}, [serial]);

	useEffect(() => {
		fetchData();
		intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL_MS);
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [fetchData]);

	if (!serial) {
		return <ShareError message="No device ID provided." />;
	}

	if (isLoading && !device) {
		return <ShareLoading />;
	}

	if (error && !device) {
		return <ShareError message={error} />;
	}

	if (!device) {
		return <ShareError message="Device not found." />;
	}

	const name = device.label ?? device.serial;
	const enabledChannels = channels.filter((ch) => ch.enabled !== false);

	return (
		<TemperatureUnitProvider>
			<div className="min-h-screen">
				<ShareHeader />
				<main className="mx-auto max-w-2xl px-4 py-6">
					{/* Device info card */}
					<article className="rounded-lg border border-border bg-card p-5 shadow-sm">
						{/* Badge + status */}
						<div className="flex items-center justify-between mb-4">
							<span
								className={cn(
									"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
									"bg-muted text-xs font-medium text-muted-foreground",
								)}
							>
								<Globe className="h-3 w-3" />
								Shared device
							</span>
							{device.status && (
								<div className="flex items-center gap-1.5" role="status">
									<span
										className={cn(
											"h-2 w-2 rounded-full",
											device.status === "online" ? "bg-green-500" : "bg-neutral-400",
										)}
									/>
									<span className="text-xs text-muted-foreground capitalize">{device.status}</span>
								</div>
							)}
						</div>

						{/* Device name and type */}
						<h1 className="text-xl font-semibold tracking-tight mb-1">{name}</h1>
						<p className="text-sm text-muted-foreground mb-4">
							{device.type ?? device.device ?? "Device"}{" "}
							<span className="font-mono">{device.serial}</span>
						</p>

						{/* Channel readings */}
						{enabledChannels.length > 0 ? (
							<div className="space-y-2">
								{enabledChannels.map((channel, idx) => (
									<ChannelReading key={channel.number ?? idx} channel={channel} />
								))}
							</div>
						) : (
							<p className="text-sm text-muted-foreground italic">No active channels</p>
						)}

						{/* Refresh info */}
						<div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
							{lastUpdated && <span>Updated {lastUpdated.toLocaleTimeString()}</span>}
							<button
								type="button"
								onClick={fetchData}
								disabled={isLoading}
								className={cn(
									"inline-flex items-center gap-1 rounded-md px-2 py-1",
									"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									"disabled:opacity-50",
								)}
							>
								<RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
								Refresh
							</button>
						</div>
					</article>
				</main>
			</div>
		</TemperatureUnitProvider>
	);
}
