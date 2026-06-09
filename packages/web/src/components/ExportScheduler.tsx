import {
	Calendar,
	CheckCircle2,
	Clock,
	Download,
	Plus,
	Trash2,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDevices } from "../hooks/useDevices.ts";
import {
	type ChannelSelection,
	type ExportFrequency,
	isScheduleDue,
	useExportScheduler,
} from "../hooks/useExportScheduler.ts";
import type { ThermoworksWebClient } from "../lib/api.ts";
import { toCSV } from "../lib/export.ts";
import { cn } from "../lib/utils.ts";

// ─── Sub-components ──────────────────────────────────────────────────────────

interface DeviceChannelPickerProps {
	client: ThermoworksWebClient;
	selected: ChannelSelection[];
	onChange: (next: ChannelSelection[]) => void;
}

function DeviceChannelPicker({ client, selected, onChange }: DeviceChannelPickerProps) {
	const { data: devices, isLoading } = useDevices(client, { pollingInterval: 60_000 });

	const isSelected = useCallback(
		(serial: string, channelNumber: string) =>
			selected.some((s) => s.deviceSerial === serial && s.channelNumber === channelNumber),
		[selected],
	);

	function toggle(serial: string, channelNumber: string) {
		if (isSelected(serial, channelNumber)) {
			onChange(
				selected.filter((s) => !(s.deviceSerial === serial && s.channelNumber === channelNumber)),
			);
		} else {
			onChange([...selected, { deviceSerial: serial, channelNumber }]);
		}
	}

	if (isLoading && devices.length === 0) {
		return <p className="text-sm text-muted-foreground">Loading devices...</p>;
	}

	if (devices.length === 0) {
		return <p className="text-sm text-muted-foreground">No devices found.</p>;
	}

	return (
		<div className="space-y-3">
			{devices.map(({ device, channels }) => (
				<div key={device.serial} className="rounded-md border border-border p-3">
					<p className="text-sm font-medium mb-2">
						{device.label ?? device.serial}
						<span className="ml-2 text-xs text-muted-foreground">{device.serial}</span>
					</p>
					<div className="flex flex-wrap gap-2">
						{channels
							.filter((ch) => ch.enabled !== false)
							.map((ch) => {
								const num = ch.number ?? "0";
								const checked = isSelected(device.serial, num);
								return (
									<label
										key={num}
										className={cn(
											"inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs cursor-pointer transition-colors",
											checked
												? "border-primary bg-primary/10 text-primary"
												: "border-border hover:bg-muted",
										)}
									>
										<input
											type="checkbox"
											className="sr-only"
											checked={checked}
											onChange={() => toggle(device.serial, num)}
										/>
										<span
											className="h-2 w-2 rounded-full"
											style={{ backgroundColor: ch.color ?? "#6b7280" }}
											aria-hidden="true"
										/>
										{ch.label ?? `Ch ${num}`}
									</label>
								);
							})}
					</div>
				</div>
			))}
		</div>
	);
}

// ─── Create Schedule Form ────────────────────────────────────────────────────

interface CreateScheduleFormProps {
	client: ThermoworksWebClient;
	onSubmit: (name: string, frequency: ExportFrequency, channels: ChannelSelection[]) => void;
	onCancel: () => void;
}

function CreateScheduleForm({ client, onSubmit, onCancel }: CreateScheduleFormProps) {
	const [name, setName] = useState("");
	const [frequency, setFrequency] = useState<ExportFrequency>("daily");
	const [channels, setChannels] = useState<ChannelSelection[]>([]);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim() || channels.length === 0) return;
		onSubmit(name.trim(), frequency, channels);
	}

	const isValid = name.trim().length > 0 && channels.length > 0;

	return (
		<form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-4">
			<h3 className="text-sm font-medium">New Export Schedule</h3>

			{/* Name */}
			<div>
				<label htmlFor="schedule-name" className="block text-xs font-medium mb-1">
					Schedule Name
				</label>
				<input
					id="schedule-name"
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="e.g., Daily Smoker Report"
					className={cn(
						"w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
						"placeholder:text-muted-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					)}
				/>
			</div>

			{/* Frequency */}
			<div>
				<label htmlFor="schedule-frequency" className="block text-xs font-medium mb-1">
					Frequency
				</label>
				<div className="flex gap-2">
					{(["daily", "weekly", "monthly"] as const).map((freq) => (
						<button
							key={freq}
							type="button"
							onClick={() => setFrequency(freq)}
							className={cn(
								"rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
								frequency === freq
									? "bg-primary text-primary-foreground"
									: "bg-muted text-muted-foreground hover:bg-muted/80",
							)}
							aria-pressed={frequency === freq}
						>
							{freq}
						</button>
					))}
				</div>
			</div>

			{/* Channel Selection */}
			<div>
				<p className="text-xs font-medium mb-2">
					Channels ({channels.length} selected)
				</p>
				<DeviceChannelPicker client={client} selected={channels} onChange={setChannels} />
			</div>

			{/* Actions */}
			<div className="flex items-center gap-2 pt-2">
				<button
					type="submit"
					disabled={!isValid}
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium",
						"bg-primary text-primary-foreground",
						"hover:bg-primary/90 transition-colors",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						!isValid && "opacity-50 cursor-not-allowed",
					)}
				>
					<Plus className="h-4 w-4" />
					Create Schedule
				</button>
				<button
					type="button"
					onClick={onCancel}
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium",
						"border border-border",
						"hover:bg-muted transition-colors",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					)}
				>
					Cancel
				</button>
			</div>
		</form>
	);
}

// ─── Main ExportScheduler Component ──────────────────────────────────────────

interface ExportSchedulerProps {
	client: ThermoworksWebClient;
}

export function ExportScheduler({ client }: ExportSchedulerProps) {
	const {
		schedules,
		history,
		addSchedule,
		removeSchedule,
		toggleSchedule,
		markRun,
		getDueSchedules,
		clearHistory,
	} = useExportScheduler();
	const { data: devices } = useDevices(client, { pollingInterval: 60_000 });
	const [showForm, setShowForm] = useState(false);

	// Check for due schedules on mount and run them.
	useEffect(() => {
		const due = getDueSchedules();
		for (const schedule of due) {
			runExport(schedule.id);
		}
		// Only run on mount — intentionally omit deps to avoid re-running.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const runExport = useCallback(
		(scheduleId: string) => {
			const schedule = schedules.find((s) => s.id === scheduleId);
			if (!schedule) return;

			try {
				// Build CSV data from current device readings for the selected channels.
				const rows: Record<string, unknown>[] = [];
				for (const selection of schedule.channels) {
					const deviceData = devices.find((d) => d.device.serial === selection.deviceSerial);
					if (!deviceData) continue;
					const channel = deviceData.channels.find(
						(ch) => (ch.number ?? "0") === selection.channelNumber,
					);
					if (!channel) continue;
					rows.push({
						device: deviceData.device.label ?? deviceData.device.serial,
						serial: deviceData.device.serial,
						channel: channel.label ?? `Ch ${selection.channelNumber}`,
						value: channel.value,
						units: channel.units ?? "F",
						timestamp: new Date().toISOString(),
					});
				}

				if (rows.length === 0) {
					markRun(scheduleId, "failed", "No data available for selected channels");
					return;
				}

				const columns = [
					{ key: "device", label: "Device" },
					{ key: "serial", label: "Serial" },
					{ key: "channel", label: "Channel" },
					{ key: "value", label: "Temperature" },
					{ key: "units", label: "Units" },
					{ key: "timestamp", label: "Timestamp" },
				];

				const csv = toCSV(rows, columns);
				const filename = `${schedule.name.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
				const blob = new Blob([csv], { type: "text/csv" });
				const url = URL.createObjectURL(blob);
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = filename;
				anchor.click();
				URL.revokeObjectURL(url);

				markRun(scheduleId, "completed");
			} catch (err) {
				markRun(
					scheduleId,
					"failed",
					err instanceof Error ? err.message : "Export failed",
				);
			}
		},
		[schedules, devices, markRun],
	);

	const frequencyLabel = useMemo(
		() =>
			(freq: ExportFrequency): string => {
				switch (freq) {
					case "daily":
						return "Every day";
					case "weekly":
						return "Every week";
					case "monthly":
						return "Every month";
				}
			},
		[],
	);

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Calendar className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
					<h1 className="text-lg font-semibold tracking-tight">Export Schedules</h1>
				</div>
				{!showForm && (
					<button
						type="button"
						onClick={() => setShowForm(true)}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
							"bg-primary text-primary-foreground",
							"hover:bg-primary/90 transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
					>
						<Plus className="h-4 w-4" />
						New Schedule
					</button>
				)}
			</div>

			{/* Info Banner */}
			<div className="rounded-md border border-border bg-muted/50 p-3">
				<p className="text-xs text-muted-foreground">
					Scheduled exports run automatically when you open the app and a schedule is due.
					CSV files download directly to your browser. Email notifications are not yet supported.
				</p>
			</div>

			{/* Create Form */}
			{showForm && (
				<CreateScheduleForm
					client={client}
					onSubmit={(name, frequency, channels) => {
						addSchedule(name, frequency, channels);
						setShowForm(false);
					}}
					onCancel={() => setShowForm(false)}
				/>
			)}

			{/* Active Schedules */}
			<section>
				<h2 className="text-sm font-medium mb-3">Active Schedules</h2>
				{schedules.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No schedules configured. Create one to start automatic exports.
					</p>
				) : (
					<div className="space-y-2">
						{schedules.map((schedule) => (
							<div
								key={schedule.id}
								className={cn(
									"flex items-center justify-between rounded-md border border-border p-3",
									!schedule.enabled && "opacity-60",
								)}
							>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-medium truncate">{schedule.name}</p>
									<div className="flex items-center gap-3 mt-1">
										<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
											<Clock className="h-3 w-3" />
											{frequencyLabel(schedule.frequency)}
										</span>
										<span className="text-xs text-muted-foreground">
											{schedule.channels.length} channel
											{schedule.channels.length !== 1 ? "s" : ""}
										</span>
										{isScheduleDue(schedule) && (
											<span className="text-xs text-amber-600 font-medium">Due</span>
										)}
									</div>
								</div>
								<div className="flex items-center gap-1.5">
									<button
										type="button"
										onClick={() => runExport(schedule.id)}
										title="Run now"
										className={cn(
											"inline-flex h-8 w-8 items-center justify-center rounded-md",
											"text-muted-foreground hover:bg-muted hover:text-foreground",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										)}
										aria-label={`Run export for ${schedule.name}`}
									>
										<Download className="h-4 w-4" />
									</button>
									<button
										type="button"
										onClick={() => toggleSchedule(schedule.id)}
										title={schedule.enabled ? "Disable" : "Enable"}
										className={cn(
											"inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium",
											schedule.enabled
												? "text-green-600 hover:bg-green-50 dark:hover:bg-green-950"
												: "text-muted-foreground hover:bg-muted",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										)}
										aria-label={
											schedule.enabled
												? `Disable ${schedule.name}`
												: `Enable ${schedule.name}`
										}
										aria-pressed={schedule.enabled}
									>
										{schedule.enabled ? "On" : "Off"}
									</button>
									<button
										type="button"
										onClick={() => removeSchedule(schedule.id)}
										title="Delete schedule"
										className={cn(
											"inline-flex h-8 w-8 items-center justify-center rounded-md",
											"text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
											"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										)}
										aria-label={`Delete ${schedule.name}`}
									>
										<Trash2 className="h-4 w-4" />
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</section>

			{/* Download History */}
			<section>
				<div className="flex items-center justify-between mb-3">
					<h2 className="text-sm font-medium">Download History</h2>
					{history.length > 0 && (
						<button
							type="button"
							onClick={clearHistory}
							className="text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							Clear
						</button>
					)}
				</div>
				{history.length === 0 ? (
					<p className="text-sm text-muted-foreground">No exports have run yet.</p>
				) : (
					<div className="space-y-1.5">
						{history.slice(0, 20).map((entry) => (
							<div
								key={entry.id}
								className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
							>
								{entry.status === "completed" ? (
									<CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
								) : (
									<XCircle className="h-4 w-4 text-destructive shrink-0" />
								)}
								<div className="min-w-0 flex-1">
									<p className="text-xs font-medium truncate">{entry.scheduleName}</p>
									<p className="text-xs text-muted-foreground">
										{new Date(entry.ranAt).toLocaleString()} - {entry.channelCount} channel
										{entry.channelCount !== 1 ? "s" : ""}
										{entry.error ? ` - ${entry.error}` : ""}
									</p>
								</div>
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
