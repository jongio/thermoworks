import { Archive as ArchiveIcon, Clock, Globe } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Archive, ArchiveChannel } from "thermoworks-sdk";
import { ShareError, ShareHeader, ShareLoading } from "../components/ShareLayout.tsx";
import { getPublicArchive } from "../lib/api.ts";
import { cn, formatTemp } from "../lib/utils.ts";

export function SharedArchiveView() {
	const { serial, archiveId } = useParams<{ serial: string; archiveId: string }>();
	const [archive, setArchive] = useState<Archive | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchData = useCallback(async () => {
		if (!serial || !archiveId) return;
		setIsLoading(true);
		setError(null);

		try {
			const result = await getPublicArchive(serial, archiveId);
			if (!result) {
				setError("Archive not found or not publicly shared.");
			} else {
				setArchive(result);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load shared archive.");
		} finally {
			setIsLoading(false);
		}
	}, [serial, archiveId]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	if (!serial || !archiveId) {
		return <ShareError message="Invalid archive link." />;
	}

	if (isLoading && !archive) {
		return <ShareLoading />;
	}

	if (error && !archive) {
		return <ShareError message={error} />;
	}

	if (!archive) {
		return <ShareError message="Archive not found." />;
	}

	const sessionLabel = archive.label ?? archive.deviceLabel ?? "Session";
	const duration = formatDuration(archive.start, archive.end);
	const enabledChannels = archive.channels?.filter((ch) => ch.enabled !== false) ?? [];

	return (
		<div className="min-h-screen">
			<ShareHeader />
			<main className="mx-auto max-w-2xl px-4 py-6">
				<article className="rounded-lg border border-border bg-card p-5 shadow-sm">
					{/* Badge */}
					<div className="flex items-center justify-between mb-4">
						<span
							className={cn(
								"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5",
								"bg-muted text-xs font-medium text-muted-foreground",
							)}
						>
							<Globe className="h-3 w-3" />
							Shared archive
						</span>
						{archive.type && (
							<span className="text-xs text-muted-foreground capitalize">{archive.type}</span>
						)}
					</div>

					{/* Session info */}
					<h1 className="text-xl font-semibold tracking-tight mb-1">{sessionLabel}</h1>

					{/* Metadata row */}
					<div className="flex flex-wrap gap-3 mb-4 text-sm text-muted-foreground">
						{duration && (
							<span className="inline-flex items-center gap-1">
								<Clock className="h-3.5 w-3.5" />
								{duration}
							</span>
						)}
						{archive.count != null && (
							<span className="inline-flex items-center gap-1">
								<ArchiveIcon className="h-3.5 w-3.5" />
								{archive.count.toLocaleString()} readings
							</span>
						)}
					</div>

					{/* Time range */}
					{(archive.start || archive.end) && (
						<div className="mb-4 rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
							{archive.start && <span>Started {archive.start.toLocaleString()}</span>}
							{archive.start && archive.end && <span className="mx-1.5">-</span>}
							{archive.end && <span>Ended {archive.end.toLocaleString()}</span>}
						</div>
					)}

					{/* Notes */}
					{archive.notes && (
						<p className="mb-4 text-sm text-muted-foreground italic">{archive.notes}</p>
					)}

					{/* Channel summaries */}
					{enabledChannels.length > 0 ? (
						<div className="space-y-3">
							<h3 className="text-sm font-medium text-muted-foreground">Channels</h3>
							{enabledChannels.map((channel, idx) => (
								<ArchiveChannelCard key={channel.number ?? idx} channel={channel} />
							))}
						</div>
					) : (
						<p className="text-sm text-muted-foreground italic">No channel data</p>
					)}
				</article>
			</main>
		</div>
	);
}

// ─── Archive channel card ────────────────────────────────────────────────────

function ArchiveChannelCard({ channel }: { channel: ArchiveChannel }) {
	const label = channel.label ?? `Ch ${channel.number ?? "?"}`;
	const hasValue = channel.value != null && channel.units != null;

	return (
		<div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
			<div className="flex items-center justify-between mb-1.5">
				<span className="text-sm font-medium">{label}</span>
				{hasValue && (
					<span className="text-lg font-mono tabular-nums">
						{formatTemp(channel.value)}°{channel.units}
					</span>
				)}
			</div>

			{/* Min/Max summary */}
			{(channel.minimum || channel.maximum) && (
				<div className="flex gap-3 text-xs text-muted-foreground">
					{channel.minimum?.value != null && (
						<span>
							Min: {formatTemp(channel.minimum.value)}°{channel.minimum.units ?? channel.units}
						</span>
					)}
					{channel.maximum?.value != null && (
						<span>
							Max: {formatTemp(channel.maximum.value)}°{channel.maximum.units ?? channel.units}
						</span>
					)}
				</div>
			)}

			{/* Recent readings count */}
			{channel.recentReadings.length > 0 && (
				<p className="mt-1 text-xs text-muted-foreground">
					{channel.recentReadings.length} recent readings
				</p>
			)}
		</div>
	);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(start: Date | null, end: Date | null): string | null {
	if (!start || !end) return null;
	const ms = end.getTime() - start.getTime();
	if (ms < 0) return null;

	const totalMinutes = Math.floor(ms / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours === 0) return `${minutes}m`;
	if (minutes === 0) return `${hours}h`;
	return `${hours}h ${minutes}m`;
}
