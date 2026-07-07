import type { DeviceChannel } from "thermoworks-sdk";
import { cn } from "../lib/utils.ts";

interface StallBadgeProps {
	channel: DeviceChannel;
}

/** Threshold (degrees per unit time) below which rate is considered "stalling". */
const STALL_RATE_THRESHOLD = 0.5;

/** Threshold (degrees per unit time) above which rate is considered "rapid". */
const RAPID_RATE_THRESHOLD = 5;

/**
 * Displays a small badge below the temperature reading to indicate
 * stall or rapid change conditions based on the channel's rateOfChange.
 *
 * Only renders when the condition is actually detected.
 */
export function StallBadge({ channel }: StallBadgeProps) {
	const rate = channel.rateOfChange;
	const unit = channel.rateOfChangeUnit ?? "/5min";

	if (rate == null) return null;

	const absRate = Math.abs(rate);

	// Rapid change: rate exceeds threshold
	if (absRate >= RAPID_RATE_THRESHOLD) {
		const sign = rate > 0 ? "+" : "";
		const label = `Rising fast ${sign}${rate}\u00B0${unit}`;
		if (rate < 0) {
			return (
				<span
					className={cn(
						"inline-flex items-center gap-1 rounded-full px-2 py-0.5",
						"text-[10px] font-medium",
						"bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
					)}
					role="status"
					aria-label={`Falling fast ${rate}\u00B0${unit}`}
				>
					<span aria-hidden="true">{"\u2744\uFE0F"}</span>
					Falling fast {rate}&deg;{unit}
				</span>
			);
		}
		return (
			<span
				className={cn(
					"inline-flex items-center gap-1 rounded-full px-2 py-0.5",
					"text-[10px] font-medium",
					"bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
				)}
				role="status"
				aria-label={label}
			>
				<span aria-hidden="true">{"\uD83D\uDD25"}</span>
				Rising fast {sign}
				{rate}&deg;{unit}
			</span>
		);
	}

	// Stall: rate is near zero
	if (absRate <= STALL_RATE_THRESHOLD) {
		return (
			<span
				className={cn(
					"inline-flex items-center gap-1 rounded-full px-2 py-0.5",
					"text-[10px] font-medium",
					"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
				)}
				role="status"
				aria-label="Temperature stalling"
			>
				<span aria-hidden="true">{"\u23F8"}</span>
				Stalling
			</span>
		);
	}

	return null;
}
