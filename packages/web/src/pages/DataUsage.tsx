import { Database, HardDrive, Loader2, RefreshCw } from "lucide-react";
import { Link, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "../components/AppLayout.tsx";
import { useDataUsage } from "../hooks/useDataUsage.ts";
import { cn } from "../lib/utils.ts";

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	if (unitIndex === 0) return `${Math.round(value)} ${units[unitIndex]}`;
	return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatDate(date: Date | null): string {
	if (!date) return "Not available";
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function formatBillingPrice(price: number, currency: string): string {
	if (!Number.isFinite(price) || price <= 0) return "Free";
	const normalizedPrice = Number.isInteger(price) && price >= 100 ? price / 100 : price;
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency,
		maximumFractionDigits: 2,
	}).format(normalizedPrice);
}

function UsageProgressBar({
	label,
	percent,
	tone = "default",
}: {
	label: string;
	percent: number;
	tone?: "default" | "warning" | "danger";
}) {
	const clamped = Math.max(0, Math.min(100, Math.round(percent)));

	return (
		<div
			className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
			role="progressbar"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={clamped}
		>
			<div
				className={cn(
					"h-full rounded-full transition-all",
					tone === "danger"
						? "bg-destructive"
						: tone === "warning"
							? "bg-orange-500"
							: "bg-primary",
				)}
				style={{ width: `${clamped}%` }}
			/>
		</div>
	);
}

export function DataUsage() {
	const { client } = useOutletContext<AppOutletContext>();
	const { usage, deviceUsage, plan, isLoading, error, lastUpdated, refresh } = useDataUsage(client);

	const limitBytes = usage?.limitBytes || plan?.storageLimitBytes || 0;
	const usagePercent = limitBytes > 0 && usage ? (usage.totalBytes / limitBytes) * 100 : 0;
	const usageTone =
		usagePercent >= 90 ? "danger" : usagePercent >= 70 ? "warning" : "default";
	const hasNoUsage = !isLoading && !error && (!!usage || !!plan) && (usage?.totalBytes ?? 0) === 0 && deviceUsage.length === 0;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-2">
					<Database className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
					<div>
						<h1 className="text-lg font-semibold tracking-tight">Data Usage</h1>
						<p className="text-sm text-muted-foreground">
							Monitor storage usage across your ThermoWorks Cloud devices.
						</p>
					</div>
				</div>
				<button
					type="button"
					onClick={refresh}
					disabled={isLoading}
					title="Refresh usage data"
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm",
						"text-muted-foreground hover:bg-muted hover:text-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:pointer-events-none disabled:opacity-50",
					)}
				>
					<RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} aria-hidden="true" />
					Refresh
				</button>
			</div>

			{lastUpdated && (
				<p className="text-xs text-muted-foreground">
					Last updated {lastUpdated.toLocaleTimeString()}
				</p>
			)}

			{error && (
				<div className="rounded-md border border-destructive/50 bg-destructive/10 p-4" role="alert">
					<p className="text-sm text-destructive">{error}</p>
				</div>
			)}

			{isLoading && !usage && (
				<div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card p-10">
					<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
					<span className="text-sm text-muted-foreground">Loading usage data...</span>
				</div>
			)}

			{hasNoUsage && (
				<div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
					<HardDrive className="mx-auto h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
					<h2 className="mt-4 text-base font-semibold">No data usage yet</h2>
					<p className="mt-2 text-sm text-muted-foreground">
						Start syncing devices to see storage usage totals and device-level breakdowns.
					</p>
				</div>
			)}

			{(usage || plan) && (
				<div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
					<section className="rounded-lg border border-border bg-card p-5">
						<div className="flex items-start justify-between gap-4">
							<div>
								<h2 className="text-base font-semibold">Current usage</h2>
								<p className="mt-1 text-sm text-muted-foreground">
									{usage?.periodStart || usage?.periodEnd
										? `${formatDate(usage?.periodStart ?? null)} - ${formatDate(usage?.periodEnd ?? null)}`
										: "Current billing period"}
								</p>
							</div>
							<span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground">
								{usage?.deviceCount ?? deviceUsage.length} devices
							</span>
						</div>

						<div className="mt-6 space-y-3">
							<div className="flex flex-wrap items-end justify-between gap-3">
								<div>
									<p className="text-2xl font-semibold">{formatBytes(usage?.totalBytes ?? 0)}</p>
									<p className="text-sm text-muted-foreground">
										{limitBytes > 0
											? `${Math.round(usagePercent)}% of ${formatBytes(limitBytes)}`
											: "Plan storage limit unavailable"}
									</p>
								</div>
								{limitBytes > 0 && (
									<p className="text-sm font-medium text-muted-foreground">
										{formatBytes(Math.max(limitBytes - (usage?.totalBytes ?? 0), 0))} remaining
									</p>
								)}
							</div>

							<UsageProgressBar
								label="Storage usage"
								percent={usagePercent}
								tone={usageTone}
							/>
						</div>
					</section>

					<section className="rounded-lg border border-border bg-card p-5">
						<h2 className="text-base font-semibold">Plan details</h2>
						<div className="mt-4 space-y-3 text-sm">
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">Plan</span>
								<span className="font-medium">{plan?.name ?? "Unknown"}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">Tier</span>
								<span>{plan?.tier ?? "N/A"}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">Storage limit</span>
								<span>{formatBytes(plan?.storageLimitBytes ?? limitBytes)}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">Device limit</span>
								<span>{plan?.deviceLimit ?? usage?.deviceCount ?? 0}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">Retention</span>
								<span>{plan?.retentionDays ? `${plan.retentionDays} days` : "Not available"}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">Renewal</span>
								<span>{formatDate(plan?.renewalDate ?? usage?.periodEnd ?? null)}</span>
							</div>
							<div className="flex items-center justify-between gap-3">
								<span className="text-muted-foreground">Price</span>
								<span>{formatBillingPrice(plan?.price ?? 0, plan?.currency ?? "USD")}</span>
							</div>
						</div>

						<Link
							to="/settings"
							className="mt-5 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							Upgrade plan
						</Link>
					</section>
				</div>
			)}

			<section className="rounded-lg border border-border bg-card p-5">
				<div className="flex items-center justify-between gap-3">
					<div>
						<h2 className="text-base font-semibold">Per-device usage</h2>
						<p className="mt-1 text-sm text-muted-foreground">
							See which devices are consuming the most storage.
						</p>
					</div>
					<span className="text-xs text-muted-foreground">{deviceUsage.length} devices</span>
				</div>

				{!isLoading && deviceUsage.length === 0 ? (
					<div className="mt-6 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
						Per-device usage will appear here once device history is available.
					</div>
				) : (
					<ul className="mt-6 space-y-4" aria-label="Per-device data usage">
						{deviceUsage.map((device) => (
							<li key={device.serial} className="space-y-2">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p className="font-medium">{device.label}</p>
										<p className="text-xs text-muted-foreground">{device.serial}</p>
									</div>
									<div className="text-right">
										<p className="font-medium">{formatBytes(device.bytes)}</p>
										<p className="text-xs text-muted-foreground">
											{Math.round(device.percentage)}% of total
											{device.lastSync && ` • Synced ${formatDate(device.lastSync)}`}
										</p>
									</div>
								</div>
								<UsageProgressBar
									label={`${device.label} usage`}
									percent={device.percentage}
									tone="default"
								/>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
