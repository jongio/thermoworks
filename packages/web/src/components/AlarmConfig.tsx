import { Bell, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AlarmSetOptions } from "thermoworks-sdk";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { enqueueAlarmMutation } from "../lib/offline-mutations.ts";
import { cn } from "../lib/utils.ts";

interface AlarmConfigProps {
	client: ThermoworksWebClient;
	serial: string;
	channelNumber: number;
	channelUnits: string;
	currentHighValue: number | null;
	currentHighEnabled: boolean;
	currentLowValue: number | null;
	currentLowEnabled: boolean;
	onClose: () => void;
	onSaved: () => void;
}

interface FormState {
	highEnabled: boolean;
	highValue: string;
	lowEnabled: boolean;
	lowValue: string;
}

function parseThreshold(value: string): number | null {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	const num = Number(trimmed);
	return Number.isFinite(num) ? num : null;
}

function validate(state: FormState): string | null {
	if (!state.highEnabled && !state.lowEnabled) {
		return null; // No alarms set - valid (will disable both)
	}

	if (state.highEnabled) {
		const high = parseThreshold(state.highValue);
		if (high === null) return "High alarm value must be a valid number";
	}

	if (state.lowEnabled) {
		const low = parseThreshold(state.lowValue);
		if (low === null) return "Low alarm value must be a valid number";
	}

	if (state.highEnabled && state.lowEnabled) {
		const high = parseThreshold(state.highValue);
		const low = parseThreshold(state.lowValue);
		if (high !== null && low !== null && high <= low) {
			return "High alarm must be greater than low alarm";
		}
	}

	return null;
}

export function AlarmConfig({
	client,
	serial,
	channelNumber,
	channelUnits,
	currentHighValue,
	currentHighEnabled,
	currentLowValue,
	currentLowEnabled,
	onClose,
	onSaved,
}: AlarmConfigProps) {
	const [form, setForm] = useState<FormState>({
		highEnabled: currentHighEnabled,
		highValue: currentHighValue != null ? String(currentHighValue) : "",
		lowEnabled: currentLowEnabled,
		lowValue: currentLowValue != null ? String(currentLowValue) : "",
	});
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const dialogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", handleEscape);
		return () => document.removeEventListener("keydown", handleEscape);
	}, [onClose]);

	useEffect(() => {
		dialogRef.current?.focus();
	}, []);

	const handleSave = useCallback(async () => {
		const validationError = validate(form);
		if (validationError) {
			setError(validationError);
			return;
		}

		setError(null);
		setSaving(true);

		try {
			const config: AlarmSetOptions = {};

			if (form.highEnabled) {
				const value = parseThreshold(form.highValue);
				if (value !== null) {
					config.high = { value, units: channelUnits, enabled: true };
				}
			} else {
				// Disable high alarm
				config.high = { value: currentHighValue ?? 0, units: channelUnits, enabled: false };
			}

			if (form.lowEnabled) {
				const value = parseThreshold(form.lowValue);
				if (value !== null) {
					config.low = { value, units: channelUnits, enabled: true };
				}
			} else {
				// Disable low alarm
				config.low = { value: currentLowValue ?? 0, units: channelUnits, enabled: false };
			}

			if (!config.high && !config.low) {
				onClose();
				return;
			}

			if (!navigator.onLine) {
				await enqueueAlarmMutation({
					serial,
					channel: channelNumber,
					config,
					currentHighValue,
					currentHighEnabled,
					currentLowValue,
					currentLowEnabled,
					channelUnits,
				});
			} else {
				await client.setAlarm(serial, channelNumber, config);
			}
			onSaved();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save alarm");
		} finally {
			setSaving(false);
		}
	}, [
		form,
		client,
		serial,
		channelNumber,
		channelUnits,
		currentHighValue,
		currentHighEnabled,
		currentLowValue,
		currentLowEnabled,
		onClose,
		onSaved,
	]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss for modal overlay
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			role="presentation"
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-labelledby="alarm-config-title"
				aria-modal="true"
				tabIndex={-1}
				className={cn(
					"w-full max-w-sm rounded-lg border border-border bg-background p-5 shadow-lg",
					"focus-visible:outline-none",
				)}
			>
				<div className="flex items-center justify-between mb-4">
					<h3 id="alarm-config-title" className="text-base font-semibold flex items-center gap-2">
						<Bell className="h-4 w-4" aria-hidden="true" />
						Alarm Settings
					</h3>
					<button
						type="button"
						onClick={onClose}
						className="rounded p-1 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						aria-label="Close alarm settings"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="space-y-4">
					{/* High alarm */}
					<fieldset className="space-y-2">
						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="alarm-high-enabled"
								checked={form.highEnabled}
								onChange={(e) => setForm((f) => ({ ...f, highEnabled: e.target.checked }))}
								className="h-4 w-4 rounded border-border"
							/>
							<label htmlFor="alarm-high-enabled" className="text-sm font-medium">
								High alarm
							</label>
						</div>
						{form.highEnabled && (
							<div className="flex items-center gap-2 pl-6">
								<input
									type="number"
									id="alarm-high-value"
									value={form.highValue}
									onChange={(e) => setForm((f) => ({ ...f, highValue: e.target.value }))}
									placeholder="Temperature"
									step="0.1"
									className={cn(
										"w-full rounded-md border border-border bg-background px-2.5 py-1.5",
										"text-sm font-mono tabular-nums",
										"placeholder:text-muted-foreground",
										"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									)}
									aria-label="High alarm temperature"
								/>
								<span className="text-sm text-muted-foreground shrink-0">{`\u00B0${channelUnits}`}</span>
							</div>
						)}
					</fieldset>

					{/* Low alarm */}
					<fieldset className="space-y-2">
						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="alarm-low-enabled"
								checked={form.lowEnabled}
								onChange={(e) => setForm((f) => ({ ...f, lowEnabled: e.target.checked }))}
								className="h-4 w-4 rounded border-border"
							/>
							<label htmlFor="alarm-low-enabled" className="text-sm font-medium">
								Low alarm
							</label>
						</div>
						{form.lowEnabled && (
							<div className="flex items-center gap-2 pl-6">
								<input
									type="number"
									id="alarm-low-value"
									value={form.lowValue}
									onChange={(e) => setForm((f) => ({ ...f, lowValue: e.target.value }))}
									placeholder="Temperature"
									step="0.1"
									className={cn(
										"w-full rounded-md border border-border bg-background px-2.5 py-1.5",
										"text-sm font-mono tabular-nums",
										"placeholder:text-muted-foreground",
										"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									)}
									aria-label="Low alarm temperature"
								/>
								<span className="text-sm text-muted-foreground shrink-0">{`\u00B0${channelUnits}`}</span>
							</div>
						)}
					</fieldset>
				</div>

				{error && (
					<p className="mt-3 text-xs text-destructive" role="alert">
						{error}
					</p>
				)}

				<div className="mt-5 flex items-center justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						disabled={saving}
						className={cn(
							"rounded-md px-3 py-1.5 text-sm",
							"border border-border hover:bg-muted",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"transition-colors",
							"disabled:opacity-50",
						)}
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={saving}
						className={cn(
							"rounded-md px-3 py-1.5 text-sm font-medium",
							"bg-primary text-primary-foreground hover:bg-primary/90",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"transition-colors",
							"disabled:opacity-50",
						)}
					>
						{saving ? "Saving..." : "Save"}
					</button>
				</div>
			</div>
		</div>
	);
}
