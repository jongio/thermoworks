import { useState } from "react";
import type { Device, DeviceChannel, DeviceHealth } from "thermoworks-sdk";
import { cn } from "../lib/utils.ts";

/** Threshold in milliseconds: 5 minutes for warning-level staleness. */
const STALE_WARNING_MS = 5 * 60 * 1000;
/** Threshold in milliseconds: 30 minutes for critical-level staleness. */
const STALE_CRITICAL_MS = 30 * 60 * 1000;
/** Battery percentage below which a warning is issued. */
const BATTERY_WARNING_THRESHOLD = 20;
/** Battery percentage below which a critical issue is issued. */
const BATTERY_CRITICAL_THRESHOLD = 5;

/**
 * Browser-local implementation of health assessment.
 * Mirrors the SDK's assessDeviceHealth logic to avoid pulling in Node.js-only
 * SDK runtime dependencies into the browser bundle.
 */
function assessHealth(device: Device, channels: DeviceChannel[]): DeviceHealth {
	const issues: DeviceHealth["issues"] = [];
	const nowMs = Date.now();

	const timestamps: number[] = [];
	if (device.lastSeen) timestamps.push(device.lastSeen.getTime());
	for (const ch of channels) {
		if (ch.lastSeen) timestamps.push(ch.lastSeen.getTime());
	}

	if (timestamps.length > 0) {
		const mostRecent = Math.max(...timestamps);
		const ageMs = nowMs - mostRecent;

		if (ageMs >= STALE_CRITICAL_MS) {
			const minutes = Math.round(ageMs / 60_000);
			issues.push({
				code: "stale_reading",
				severity: "critical",
				message: "Reading is critically stale",
				detail: `Last reading was ${minutes} minutes ago`,
			});
		} else if (ageMs >= STALE_WARNING_MS) {
			const minutes = Math.round(ageMs / 60_000);
			issues.push({
				code: "stale_reading",
				severity: "warning",
				message: "Reading may be stale",
				detail: `Last reading was ${minutes} minutes ago`,
			});
		}
	}

	if (device.battery != null) {
		if (device.battery < BATTERY_CRITICAL_THRESHOLD) {
			issues.push({
				code: "low_battery",
				severity: "critical",
				message: "Battery critically low",
				detail: `Battery at ${device.battery}%`,
			});
		} else if (device.battery < BATTERY_WARNING_THRESHOLD) {
			issues.push({
				code: "low_battery",
				severity: "warning",
				message: "Battery low",
				detail: `Battery at ${device.battery}%`,
			});
		}
	}

	if (device.status !== "online") {
		issues.push({
			code: "offline",
			severity: "warning",
			message: "Device is offline",
			detail: device.status ? `Status: ${device.status}` : undefined,
		});
	}

	let overall: DeviceHealth["overall"] = "good";
	for (const issue of issues) {
		if (issue.severity === "critical") {
			overall = "critical";
			break;
		}
		if (issue.severity === "warning") overall = "warning";
	}

	return { overall, issues };
}

interface DeviceHealthBadgeProps {
	device: Device;
	channels: DeviceChannel[];
}

const HEALTH_COLORS: Record<DeviceHealth["overall"], string> = {
	good: "bg-green-500",
	warning: "bg-amber-500",
	critical: "bg-red-500",
};

const HEALTH_LABELS: Record<DeviceHealth["overall"], string> = {
	good: "Healthy",
	warning: "Warning",
	critical: "Critical",
};

export function DeviceHealthBadge({ device, channels }: DeviceHealthBadgeProps) {
	const [showTooltip, setShowTooltip] = useState(false);
	const health = assessHealth(device, channels);

	if (health.overall === "good") {
		return (
			<span
				role="img"
				className={cn("inline-block h-2 w-2 rounded-full", HEALTH_COLORS.good)}
				title="Healthy"
				aria-label="Device health: healthy"
			/>
		);
	}

	return (
		<span className="relative inline-block">
			<button
				type="button"
				className={cn(
					"inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white",
					HEALTH_COLORS[health.overall],
				)}
				aria-label={`Device health: ${HEALTH_LABELS[health.overall]}`}
				onMouseEnter={() => setShowTooltip(true)}
				onMouseLeave={() => setShowTooltip(false)}
				onClick={() => setShowTooltip((prev) => !prev)}
			>
				{HEALTH_LABELS[health.overall]}
			</button>
			{showTooltip && health.issues.length > 0 && (
				<div
					className={cn(
						"absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-border",
						"bg-popover p-2 text-xs text-popover-foreground shadow-md",
					)}
					role="tooltip"
				>
					<ul className="space-y-1">
						{health.issues.map((issue) => (
							<li key={issue.code} className="flex items-start gap-1.5">
								<span
									className={cn(
										"mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
										issue.severity === "critical" ? "bg-red-500" : "bg-amber-500",
									)}
								/>
								<span>
									{issue.message}
									{issue.detail && (
										<span className="block text-muted-foreground">{issue.detail}</span>
									)}
								</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</span>
	);
}
