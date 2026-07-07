import type { DeviceChannel } from "thermoworks-sdk";
import { cn } from "../lib/utils.ts";

interface EtaBadgeProps {
	channel: DeviceChannel;
	/** Render a larger display variant for the detail page. */
	size?: "sm" | "lg";
}

/**
 * Predict estimated minutes remaining given current temp, target, and rate.
 * This is a local browser-safe implementation of the SDK's predictDoneTime.
 */
function predictMinutesRemaining(
	current: number,
	target: number,
	rateOfChange: number,
): number | null {
	if (current >= target) return 0;
	if (rateOfChange <= 0) return null;
	return Math.round((target - current) / rateOfChange);
}

/**
 * Displays estimated time to target based on the channel's rate of change
 * and high alarm value. Only renders when a high alarm target is set and
 * the rate of change is positive.
 */
export function EtaBadge({ channel, size = "sm" }: EtaBadgeProps) {
	const rate = channel.rateOfChange;
	const target = channel.alarmHigh?.enabled ? channel.alarmHigh.value : null;
	const current = channel.value;

	// Only show when we have the necessary data for a prediction.
	if (rate == null || target == null || current == null) return null;

	const estimatedMinutes = predictMinutesRemaining(current, target, rate);

	// Don't render when prediction is unavailable (stalled or falling).
	if (estimatedMinutes == null) return null;

	// Already done: no need to show an ETA badge.
	if (estimatedMinutes === 0) return null;

	const label = formatEta(estimatedMinutes);
	const isAlmostDone = estimatedMinutes <= 15;
	// Low confidence when rate is very slow (susceptible to stalls).
	const isLowConfidence = rate < 0.1;

	const colorClasses = isLowConfidence
		? "bg-neutral-100 text-neutral-500 dark:bg-neutral-800/40 dark:text-neutral-400"
		: isAlmostDone
			? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
			: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";

	if (size === "lg") {
		return (
			<div
				className={cn(
					"inline-flex items-center gap-2 rounded-lg px-3 py-1.5",
					"text-sm font-medium",
					colorClasses,
				)}
				role="status"
				aria-label={`Estimated time remaining: ${label}`}
			>
				<span aria-hidden="true">⏱</span>
				<span>{label} remaining</span>
			</div>
		);
	}

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-0.5",
				"text-[10px] font-medium",
				colorClasses,
			)}
			role="status"
			aria-label={`Estimated time remaining: ${label}`}
		>
			<span aria-hidden="true">⏱</span>
			{label}
		</span>
	);
}

/** Format minutes into a human-readable ETA string. */
function formatEta(minutes: number): string {
	if (minutes < 60) {
		return `~${minutes} min`;
	}
	const hours = Math.floor(minutes / 60);
	const remaining = minutes % 60;
	if (remaining === 0) {
		return `~${hours} hr`;
	}
	return `~${hours} hr ${remaining} min`;
}
