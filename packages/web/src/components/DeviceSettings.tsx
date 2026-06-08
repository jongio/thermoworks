import { AlertTriangle, ChevronDown, ChevronRight, Save } from "lucide-react";
import { useState } from "react";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { cn } from "../lib/utils.ts";

interface DeviceSettingsProps {
	client: ThermoworksWebClient;
	serial: string;
	timezone: string | null;
	preferredUnits: string | null;
}

export function DeviceSettings({ client, serial, timezone, preferredUnits }: DeviceSettingsProps) {
	const [expanded, setExpanded] = useState(false);
	const [tz, setTz] = useState(timezone ?? "");
	const [units, setUnits] = useState(preferredUnits ?? "F");
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveSuccess, setSaveSuccess] = useState(false);

	const [resetConfirmText, setResetConfirmText] = useState("");
	const [resetting, setResetting] = useState(false);
	const [resetError, setResetError] = useState<string | null>(null);
	const [resetSuccess, setResetSuccess] = useState(false);

	const handleSave = async () => {
		setSaving(true);
		setSaveError(null);
		setSaveSuccess(false);
		try {
			const state: Record<string, unknown> = {};
			if (tz) state.timeZone = tz;
			state.deviceDisplayUnits = units;
			const result = await client.updateDeviceState(serial, state);
			if (!result.success) throw new Error("Failed to save settings");
			setSaveSuccess(true);
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : "Failed to save settings");
		} finally {
			setSaving(false);
		}
	};

	const handleFactoryReset = async () => {
		setResetting(true);
		setResetError(null);
		setResetSuccess(false);
		try {
			const result = await client.factoryReset(serial);
			if (!result.success) throw new Error("Factory reset failed");
			setResetSuccess(true);
			setResetConfirmText("");
		} catch (err) {
			setResetError(err instanceof Error ? err.message : "Factory reset failed");
		} finally {
			setResetting(false);
		}
	};

	const resetEnabled = resetConfirmText === serial && !resetting;

	return (
		<section aria-labelledby="settings-heading">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex items-center gap-1.5 w-full text-left"
				aria-expanded={expanded}
				aria-controls="settings-content"
			>
				{expanded ? (
					<ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
				) : (
					<ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
				)}
				<h2 id="settings-heading" className="text-lg font-semibold">
					Settings
				</h2>
			</button>

			{expanded && (
				<div id="settings-content" className="mt-3 space-y-6">
					{/* Device state fields */}
					<div className="space-y-3">
						<div className="space-y-1.5">
							<label htmlFor="settings-timezone" className="text-sm font-medium">
								Timezone
							</label>
							<input
								id="settings-timezone"
								type="text"
								value={tz}
								onChange={(e) => setTz(e.target.value)}
								placeholder="e.g. America/Denver"
								className={cn(
									"w-full rounded-md border border-border bg-background px-3 py-2",
									"text-sm placeholder:text-muted-foreground",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								)}
							/>
						</div>

						<div className="space-y-1.5">
							<label htmlFor="settings-units" className="text-sm font-medium">
								Preferred Units
							</label>
							<select
								id="settings-units"
								value={units}
								onChange={(e) => setUnits(e.target.value)}
								className={cn(
									"w-full rounded-md border border-border bg-background px-3 py-2",
									"text-sm",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								)}
							>
								<option value="F">Fahrenheit (°F)</option>
								<option value="C">Celsius (°C)</option>
							</select>
						</div>

						<button
							type="button"
							onClick={handleSave}
							disabled={saving}
							className={cn(
								"inline-flex items-center gap-1.5 rounded-md px-3 py-2",
								"text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								"disabled:opacity-50 disabled:cursor-not-allowed",
								"transition-colors",
							)}
						>
							<Save className="h-4 w-4" aria-hidden="true" />
							{saving ? "Saving..." : "Save Settings"}
						</button>

						{saveError && <p className="text-xs text-destructive">{saveError}</p>}
						{saveSuccess && (
							<p className="text-xs text-green-600">Settings saved successfully.</p>
						)}
					</div>

					{/* Danger Zone */}
					<div className="rounded-md border-2 border-destructive/50 p-4 space-y-3">
						<div className="flex items-center gap-2">
							<AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
							<h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
						</div>

						<p className="text-xs text-muted-foreground">
							Factory reset will erase all device configuration, session history, and channel
							settings. This action is irreversible.
						</p>

						<div className="space-y-2">
							<label htmlFor="reset-confirm" className="text-xs font-medium">
								Type <span className="font-mono font-bold">{serial}</span> to confirm
							</label>
							<input
								id="reset-confirm"
								type="text"
								value={resetConfirmText}
								onChange={(e) => setResetConfirmText(e.target.value)}
								placeholder={serial}
								className={cn(
									"w-full rounded-md border border-border bg-background px-3 py-2",
									"text-sm font-mono placeholder:text-muted-foreground",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								)}
							/>
							<button
								type="button"
								onClick={handleFactoryReset}
								disabled={!resetEnabled}
								className={cn(
									"inline-flex items-center gap-1.5 rounded-md px-3 py-2",
									"text-sm font-medium",
									"bg-destructive text-destructive-foreground hover:bg-destructive/90",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									"disabled:opacity-50 disabled:cursor-not-allowed",
									"transition-colors",
								)}
							>
								<AlertTriangle className="h-4 w-4" aria-hidden="true" />
								{resetting ? "Resetting..." : "Factory Reset"}
							</button>
						</div>

						{resetError && <p className="text-xs text-destructive">{resetError}</p>}
						{resetSuccess && (
							<p className="text-xs text-green-600">
								Factory reset initiated. The device will restart shortly.
							</p>
						)}
					</div>
				</div>
			)}
		</section>
	);
}
