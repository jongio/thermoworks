import type { CalibrationPoint, CalibrationRecord } from "thermoworks-sdk";
import { useTemperatureUnit } from "../hooks/useTemperatureUnit.ts";
import { cn } from "../lib/utils.ts";

interface CalibrationViewProps {
	records: CalibrationRecord[];
}

function resultBadgeClass(result: string | null): string {
	switch (result?.toLowerCase()) {
		case "pass":
			return "bg-green-500/15 text-green-700 dark:text-green-400";
		case "fail":
			return "bg-red-500/15 text-red-700 dark:text-red-400";
		default:
			return "bg-muted text-muted-foreground";
	}
}

function formatDate(date: Date | null): string {
	if (!date) return "--";
	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function PointsTable({ points, label }: { points: CalibrationPoint[]; label: string }) {
	const { formatTemp } = useTemperatureUnit();

	if (points.length === 0) return null;

	return (
		<div className="mt-3">
			<h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
				{label}
			</h4>
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-border text-left">
							<th className="py-1.5 pr-3 font-medium text-muted-foreground">Ch</th>
							<th className="py-1.5 pr-3 font-medium text-muted-foreground">Reference</th>
							<th className="py-1.5 pr-3 font-medium text-muted-foreground">Measured</th>
							<th className="py-1.5 pr-3 font-medium text-muted-foreground">Deviation</th>
							<th className="py-1.5 font-medium text-muted-foreground">Result</th>
						</tr>
					</thead>
					<tbody>
						{points.map((point, idx) => (
							<tr
								key={`${point.channel}-${idx}`}
								className="border-b border-border/50 last:border-0"
							>
								<td className="py-1.5 pr-3 tabular-nums">{point.channel}</td>
								<td className="py-1.5 pr-3 tabular-nums font-mono">
									{formatTemp(point.referenceValue, point.units)}
								</td>
								<td className="py-1.5 pr-3 tabular-nums font-mono">
									{formatTemp(point.value, point.units)}
								</td>
								<td className="py-1.5 pr-3 tabular-nums font-mono">
									{point.deviation > 0 ? "+" : ""}
									{point.deviation.toFixed(1)}°
								</td>
								<td className="py-1.5">
									<span
										className={cn(
											"inline-block rounded px-1.5 py-0.5 text-xs font-medium",
											resultBadgeClass(point.result),
										)}
									>
										{point.result || "--"}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function CalibrationRecordCard({ record }: { record: CalibrationRecord }) {
	return (
		<div className="rounded-md border border-border p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-sm font-medium truncate">{formatDate(record.calibrationDate)}</p>
					{record.performedBy && (
						<p className="text-xs text-muted-foreground mt-0.5">By: {record.performedBy}</p>
					)}
				</div>
				{record.result && (
					<span
						className={cn(
							"shrink-0 rounded px-2 py-0.5 text-xs font-medium",
							resultBadgeClass(record.result),
						)}
					>
						{record.result}
					</span>
				)}
			</div>

			{(record.referenceDetail || record.statedAccuracy) && (
				<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
					{record.referenceDetail && <span>Ref: {record.referenceDetail}</span>}
					{record.statedAccuracy && <span>Accuracy: {record.statedAccuracy}</span>}
				</div>
			)}

			{(record.ambientTemperature || record.ambientHumidity) && (
				<div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
					{record.ambientTemperature && <span>Ambient: {record.ambientTemperature}</span>}
					{record.ambientHumidity && <span>Humidity: {record.ambientHumidity}</span>}
				</div>
			)}

			<PointsTable points={record.lowPointAdjustments} label="Low Point Adjustments" />
			<PointsTable points={record.highPointReference} label="High Point Reference" />
		</div>
	);
}

export function CalibrationView({ records }: CalibrationViewProps) {
	if (records.length === 0) {
		return (
			<div className="text-sm text-muted-foreground text-center py-8 border border-border rounded-md">
				No calibration data recorded
			</div>
		);
	}

	return (
		<div className="space-y-3">
			{records.map((record) => (
				<CalibrationRecordCard key={record.calibrationId} record={record} />
			))}
		</div>
	);
}
