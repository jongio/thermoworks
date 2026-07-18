import { Download, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { Archive } from "thermoworks-sdk";
import type { ThermoworksWebClient } from "../lib/api.ts";
import {
	createCookReportSharePayload,
	loadCookAnnotations,
	normalizeAnnotation,
	saveCookAnnotations,
} from "../lib/cook-annotations.ts";
import { buildCookReport, type CookAnnotation, formatReportDuration } from "../lib/cook-report.ts";
import { downloadBlob } from "../lib/export.ts";
import { cn, formatTemp } from "../lib/utils.ts";
import { ShareManager } from "./ShareManager.tsx";
import { TemperatureChart } from "./TemperatureChart.tsx";

interface CookReportProps {
	readonly archive: Archive;
	readonly serial?: string;
	readonly client?: ThermoworksWebClient | null;
	readonly readOnly?: boolean;
	readonly initialAnnotations?: readonly CookAnnotation[];
	readonly initialTargetTemp?: number | null;
	readonly initialTargetTolerance?: number | null;
}

interface AnnotationFormState {
	readonly id: string | null;
	readonly timestamp: string;
	readonly label: string;
	readonly note: string;
}

function toDateTimeInputValue(date: Date): string {
	const offsetMs = date.getTimezoneOffset() * 60_000;
	return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeInputValue(value: string): Date | null {
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function createAnnotationId(): string {
	return `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultTargetTemp(archive: Archive): number | null {
	const firstChannel = archive.channels?.find((channel) => channel.enabled !== false);
	return firstChannel?.alarmHigh?.value ?? null;
}

function formatDate(date: Date): string {
	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function CookReport({
	archive,
	serial,
	client,
	readOnly = false,
	initialAnnotations,
	initialTargetTemp,
	initialTargetTolerance,
}: CookReportProps) {
	const [annotations, setAnnotations] = useState<CookAnnotation[]>(() =>
		initialAnnotations ? [...initialAnnotations] : readOnly ? [] : loadCookAnnotations(archive.id),
	);
	const [targetTemp, setTargetTemp] = useState<number | null>(
		initialTargetTemp ?? defaultTargetTemp(archive),
	);
	const [targetTolerance, setTargetTolerance] = useState<number | null>(
		initialTargetTolerance ?? 5,
	);
	const [showShare, setShowShare] = useState(false);
	const firstReading =
		archive.channels?.[0]?.recentReadings[0]?.timestamp ?? archive.start ?? new Date();
	const [form, setForm] = useState<AnnotationFormState>({
		id: null,
		timestamp: toDateTimeInputValue(firstReading),
		label: "",
		note: "",
	});

	useEffect(() => {
		if (!readOnly) saveCookAnnotations(archive.id, annotations);
	}, [annotations, archive.id, readOnly]);

	const report = useMemo(
		() => buildCookReport(archive, { annotations, targetTemp, targetTolerance }),
		[archive, annotations, targetTemp, targetTolerance],
	);
	const sharePayload = useMemo(
		() => createCookReportSharePayload(archive, annotations, targetTemp, targetTolerance),
		[archive, annotations, targetTemp, targetTolerance],
	);

	function resetForm() {
		setForm({ id: null, timestamp: toDateTimeInputValue(firstReading), label: "", note: "" });
	}

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const timestamp = fromDateTimeInputValue(form.timestamp);
		if (!timestamp) return;
		const normalized = normalizeAnnotation({
			id: form.id ?? createAnnotationId(),
			timestamp,
			label: form.label,
			note: form.note,
		});
		if (!normalized) return;
		setAnnotations((current) => {
			const withoutCurrent = current.filter((annotation) => annotation.id !== normalized.id);
			return [...withoutCurrent, normalized].sort(
				(a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
			);
		});
		resetForm();
	}

	function handleEdit(annotation: CookAnnotation) {
		setForm({
			id: annotation.id,
			timestamp: toDateTimeInputValue(annotation.timestamp),
			label: annotation.label,
			note: annotation.note ?? "",
		});
	}

	function handleExport() {
		downloadBlob(
			JSON.stringify(report, null, 2),
			`cook-report-${archive.id}.json`,
			"application/json",
		);
	}

	return (
		<section
			className="space-y-4 rounded-lg border border-border bg-card p-4"
			aria-labelledby="cook-report-heading"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h3 id="cook-report-heading" className="text-base font-semibold">
						Cook report
					</h3>
					<p className="text-sm text-muted-foreground">{report.title}</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
						Target
						<input
							type="number"
							value={targetTemp ?? ""}
							onChange={(event) =>
								setTargetTemp(event.target.value ? Number(event.target.value) : null)
							}
							className="w-20 rounded border border-border bg-background px-2 py-1 text-foreground"
							aria-label="Target temperature"
						/>
					</label>
					<label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
						±
						<input
							type="number"
							value={targetTolerance ?? ""}
							onChange={(event) =>
								setTargetTolerance(event.target.value ? Number(event.target.value) : null)
							}
							className="w-16 rounded border border-border bg-background px-2 py-1 text-foreground"
							aria-label="Target tolerance"
						/>
					</label>
					<button
						type="button"
						onClick={handleExport}
						className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
					>
						<Download className="h-3.5 w-3.5" />
						Export report
					</button>
					{client && serial && (
						<button
							type="button"
							onClick={() => setShowShare(true)}
							className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
						>
							<Share2 className="h-3.5 w-3.5" />
							Share report
						</button>
					)}
				</div>
			</div>

			<div className="grid gap-2 sm:grid-cols-4" data-testid="cook-report-summary">
				<SummaryCard label="Duration" value={formatReportDuration(report.summary.durationMs)} />
				<SummaryCard
					label="Min"
					value={
						report.summary.minTemp == null
							? "—"
							: `${formatTemp(report.summary.minTemp)}°${report.summary.units ?? ""}`
					}
				/>
				<SummaryCard
					label="Max"
					value={
						report.summary.maxTemp == null
							? "—"
							: `${formatTemp(report.summary.maxTemp)}°${report.summary.units ?? ""}`
					}
				/>
				<SummaryCard
					label="Time at target"
					value={
						report.summary.timeAtTargetMs == null
							? "Set a target"
							: formatReportDuration(report.summary.timeAtTargetMs)
					}
				/>
			</div>

			<TemperatureChart channels={report.channels} annotations={report.annotations} />

			{!readOnly && (
				<form
					className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-[auto_1fr_1fr_auto]"
					onSubmit={handleSubmit}
				>
					<input
						type="datetime-local"
						value={form.timestamp}
						onChange={(event) =>
							setForm((current) => ({ ...current, timestamp: event.target.value }))
						}
						className="rounded border border-border bg-background px-2 py-1 text-sm"
						aria-label="Annotation time"
					/>
					<input
						type="text"
						value={form.label}
						onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
						placeholder="Short label"
						className="rounded border border-border bg-background px-2 py-1 text-sm"
						aria-label="Annotation label"
						required
					/>
					<input
						type="text"
						value={form.note}
						onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
						placeholder="Optional note"
						className="rounded border border-border bg-background px-2 py-1 text-sm"
						aria-label="Annotation note"
					/>
					<div className="flex gap-1">
						<button
							type="submit"
							className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
						>
							<Plus className="h-3.5 w-3.5" />
							{form.id ? "Save" : "Add"}
						</button>
						{form.id && (
							<button
								type="button"
								onClick={resetForm}
								className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
							>
								Cancel
							</button>
						)}
					</div>
				</form>
			)}

			<div data-testid="annotation-timeline">
				<h4 className="mb-2 text-sm font-medium">Annotation timeline</h4>
				{report.annotations.length === 0 ? (
					<p className="text-sm text-muted-foreground">No annotations yet.</p>
				) : (
					<ol className="space-y-2">
						{report.annotations.map((annotation) => (
							<li key={annotation.id} className="rounded-md border border-border p-3">
								<div className="flex items-start justify-between gap-2">
									<div>
										<div className="text-sm font-medium">{annotation.label}</div>
										<div className="text-xs text-muted-foreground">
											{formatDate(annotation.timestamp)}
										</div>
										{annotation.note && (
											<p className="mt-1 text-sm text-muted-foreground">{annotation.note}</p>
										)}
									</div>
									{!readOnly && (
										<div className="flex gap-1">
											<button
												type="button"
												onClick={() => handleEdit(annotation)}
												className="rounded p-1 hover:bg-muted"
												aria-label={`Edit ${annotation.label}`}
											>
												<Pencil className="h-3.5 w-3.5" />
											</button>
											<button
												type="button"
												onClick={() =>
													setAnnotations((current) =>
														current.filter((item) => item.id !== annotation.id),
													)
												}
												className="rounded p-1 hover:bg-muted"
												aria-label={`Remove ${annotation.label}`}
											>
												<Trash2 className="h-3.5 w-3.5" />
											</button>
										</div>
									)}
								</div>
							</li>
						))}
					</ol>
				)}
			</div>

			{showShare && client && serial && (
				<ShareManager
					serial={serial}
					archiveId={archive.id}
					client={client}
					reportPayload={sharePayload}
					onClose={() => setShowShare(false)}
				/>
			)}
		</section>
	);
}

function SummaryCard({ label, value }: { readonly label: string; readonly value: string }) {
	return (
		<div className={cn("rounded-md border border-border bg-muted/30 px-3 py-2")}>
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="text-sm font-semibold">{value}</div>
		</div>
	);
}
