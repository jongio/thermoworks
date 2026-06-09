import { Wind } from "lucide-react";
import { useCallback, useState } from "react";
import type { FanSettings } from "thermoworks-sdk";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

interface FanControllerProps {
	client: ThermoworksWebClient;
	serial: string;
	fan: FanSettings;
	onUpdated?: () => void;
}

/**
 * Fan controller panel for Billows-compatible devices.
 * Allows toggling the fan connection and setting the target temperature.
 */
export function FanController({ client, serial, fan, onUpdated }: FanControllerProps) {
	const [targetInput, setTargetInput] = useState(fan.setTemp?.toString() ?? "");
	const [saving, setSaving] = useState(false);
	const [toggling, setToggling] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleToggle = useCallback(async () => {
		setToggling(true);
		setError(null);
		try {
			const result = await client.setFanEnabled(serial, !fan.connection);
			if (!result.success) {
				setError("Failed to update fan state");
			} else {
				onUpdated?.();
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update fan state");
		} finally {
			setToggling(false);
		}
	}, [client, serial, fan.connection, onUpdated]);

	const handleSetTarget = useCallback(async () => {
		const trimmed = targetInput.trim();
		if (trimmed === "" || !Number.isFinite(Number(trimmed))) {
			setError("Enter a valid temperature");
			return;
		}
		const value = Number(trimmed);
		setSaving(true);
		setError(null);
		try {
			const result = await client.setFanTarget(serial, value);
			if (!result.success) {
				setError("Failed to set target temperature");
			} else {
				onUpdated?.();
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to set target temperature");
		} finally {
			setSaving(false);
		}
	}, [client, serial, targetInput, onUpdated]);

	const isActive = fan.connection;

	return (
		<div className="rounded-md border border-border p-3 space-y-3">
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<Wind
						className={cn(
							"h-4 w-4 shrink-0",
							isActive ? "text-blue-500 animate-pulse" : "text-muted-foreground",
						)}
						aria-hidden="true"
					/>
					<span className="text-sm font-medium">Fan Controller</span>
					{fan.connected && <span className="text-xs text-muted-foreground">(connected)</span>}
				</div>
				<button
					type="button"
					onClick={handleToggle}
					disabled={toggling}
					aria-pressed={isActive}
					className={cn(
						"relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
						"transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:cursor-not-allowed disabled:opacity-50",
						isActive ? "bg-blue-500" : "bg-muted",
					)}
					aria-label={isActive ? "Disable fan" : "Enable fan"}
				>
					<span
						className={cn(
							"pointer-events-none block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform",
							isActive ? "translate-x-4" : "translate-x-0.5",
						)}
					/>
				</button>
			</div>

			{isActive && (
				<div className="flex items-center gap-2">
					<label htmlFor="fan-target" className="text-xs text-muted-foreground shrink-0">
						Target:
					</label>
					<input
						id="fan-target"
						type="number"
						value={targetInput}
						onChange={(e) => setTargetInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSetTarget();
						}}
						placeholder="225"
						className={cn(
							"w-20 rounded-md border border-border bg-background px-2 py-1",
							"text-xs tabular-nums placeholder:text-muted-foreground",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
					/>
					<span className="text-xs text-muted-foreground">°F</span>
					<button
						type="button"
						onClick={handleSetTarget}
						disabled={saving}
						className={cn(
							"rounded-md px-2 py-1 text-xs font-medium",
							"bg-primary text-primary-foreground hover:bg-primary/90",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"disabled:cursor-not-allowed disabled:opacity-50",
							"transition-colors",
						)}
					>
						{saving ? "Saving..." : "Set"}
					</button>
				</div>
			)}

			{fan.setTemp != null && (
				<p className="text-xs text-muted-foreground">Current target: {fan.setTemp}°F</p>
			)}

			{error && <p className="text-xs text-destructive">{error}</p>}
		</div>
	);
}
