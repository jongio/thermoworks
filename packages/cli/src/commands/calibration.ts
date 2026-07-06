import type { CalibrationPoint } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

// ANSI color helpers
const green = (text: string): string => `\x1b[32m${text}\x1b[0m`;
const red = (text: string): string => `\x1b[31m${text}\x1b[0m`;
const yellow = (text: string): string => `\x1b[33m${text}\x1b[0m`;
const bold = (text: string): string => `\x1b[1m${text}\x1b[0m`;
const dim = (text: string): string => `\x1b[2m${text}\x1b[0m`;

/** Default months between recommended recalibrations. */
export const DEFAULT_RECAL_INTERVAL_MONTHS = 12;
/** A device is "due soon" once it is within this many days of the due date. */
const DUE_SOON_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Recalibration status for a calibration record. */
export type CalibrationStatus = "current" | "due-soon" | "overdue" | "unknown";

/** Computed recalibration timing for one calibration record. */
export interface CalibrationDue {
	status: CalibrationStatus;
	/** ISO date the device was calibrated, or null when unknown. */
	calibratedAt: string | null;
	/** ISO date the next recalibration is due, or null when unknown. */
	dueAt: string | null;
	/** Whole days until the due date (negative when overdue), or null. */
	daysRemaining: number | null;
}

function colorResult(result: string): string {
	const lower = result.toLowerCase();
	if (lower === "pass") return green("PASS");
	if (lower === "fail") return red("FAIL");
	return result;
}

function formatDate(date: Date | null): string {
	if (!date) return "N/A";
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

/** Add whole months to a date, clamping to the last day of shorter months. */
export function addMonths(date: Date, months: number): Date {
	const result = new Date(date.getTime());
	const day = result.getDate();
	result.setMonth(result.getMonth() + months);
	if (result.getDate() < day) {
		// Rolled into the next month (e.g. Jan 31 + 1). Step back to last valid day.
		result.setDate(0);
	}
	return result;
}

/**
 * Compute recalibration timing from a calibration date and an interval.
 * Returns an `unknown` status when no calibration date is available.
 */
export function computeCalibrationDue(
	calibrationDate: Date | null,
	intervalMonths: number,
	now: Date = new Date(),
): CalibrationDue {
	if (!calibrationDate || Number.isNaN(calibrationDate.getTime())) {
		return { status: "unknown", calibratedAt: null, dueAt: null, daysRemaining: null };
	}

	const dueAt = addMonths(calibrationDate, intervalMonths);
	const daysRemaining = Math.floor((dueAt.getTime() - now.getTime()) / MS_PER_DAY);

	let status: CalibrationStatus;
	if (daysRemaining < 0) {
		status = "overdue";
	} else if (daysRemaining <= DUE_SOON_DAYS) {
		status = "due-soon";
	} else {
		status = "current";
	}

	return {
		status,
		calibratedAt: calibrationDate.toISOString(),
		dueAt: dueAt.toISOString(),
		daysRemaining,
	};
}

/** Color a status label for terminal output. */
function colorStatus(due: CalibrationDue): string {
	switch (due.status) {
		case "current":
			return green("current");
		case "due-soon":
			return yellow(`due soon (${due.daysRemaining}d)`);
		case "overdue":
			return red(`overdue (${Math.abs(due.daysRemaining ?? 0)}d)`);
		default:
			return dim("unknown");
	}
}

/** Parse the recalibration interval from calibration command args. */
export function parseCalibrationInterval(args: string[]): number {
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--interval-months") {
			const raw = args[++i];
			const n = Number(raw);
			if (!Number.isInteger(n) || n < 1) {
				console.error("--interval-months must be a positive integer");
				process.exit(1);
			}
			return n;
		}
	}
	return DEFAULT_RECAL_INTERVAL_MONTHS;
}

function formatPointsTable(label: string, points: CalibrationPoint[]): void {
	if (points.length === 0) return;

	console.log(`\n  ${bold(label)}`);
	console.log(
		`  ${"Ch".padEnd(4)}${"Value".padEnd(12)}${"Reference".padEnd(12)}${"Deviation".padEnd(12)}${"Trim".padEnd(10)}${"Result"}`,
	);
	console.log(`  ${dim("-".repeat(58))}`);

	for (const pt of points) {
		const ch = String(pt.channel).padEnd(4);
		const value = `${pt.value}${pt.units}`.padEnd(12);
		const ref = `${pt.referenceValue}${pt.units}`.padEnd(12);
		const dev = `${pt.deviation > 0 ? "+" : ""}${pt.deviation}${pt.units}`.padEnd(12);
		const trim = (pt.trimValue != null ? `${pt.trimValue}` : "-").padEnd(10);
		const result = colorResult(pt.result);
		console.log(`  ${ch}${value}${ref}${dev}${trim}${result}`);
	}
}

export async function calibration(
	serial: string | undefined,
	options: OutputOptions = { json: false },
	args: string[] = [],
): Promise<void> {
	if (!serial) {
		console.error("Usage: thermoworks calibration <SERIAL> [--interval-months N]");
		process.exit(1);
	}

	const intervalMonths = parseCalibrationInterval(args);

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const records = await client.getCalibration(serial);

		if (options.json) {
			outputJson(
				records.map((rec) => ({
					...rec,
					recalibration: computeCalibrationDue(rec.calibrationDate, intervalMonths),
				})),
			);
			return;
		}

		if (records.length === 0) {
			console.log(`No calibration records found for ${serial}.`);
			return;
		}

		for (let i = 0; i < records.length; i++) {
			// biome-ignore lint/style/noNonNullAssertion: index is within bounds
			const rec = records[i]!;
			if (i > 0) console.log("");

			const due = computeCalibrationDue(rec.calibrationDate, intervalMonths);

			console.log(bold(`Calibration: ${rec.calibrationId}`));
			console.log(`  Date:        ${formatDate(rec.calibrationDate)}`);
			if (due.status !== "unknown" && due.dueAt) {
				console.log(`  Next due:    ${formatDate(new Date(due.dueAt))}`);
			}
			console.log(`  Status:      ${colorStatus(due)}`);
			if (rec.performedBy) console.log(`  Technician:  ${rec.performedBy}`);
			if (rec.manager) console.log(`  Manager:     ${rec.manager}`);
			if (rec.referenceDetail) console.log(`  Reference:   ${rec.referenceDetail}`);
			if (rec.statedAccuracy) console.log(`  Accuracy:    ${rec.statedAccuracy}`);
			if (rec.ambientTemperature) console.log(`  Ambient:     ${rec.ambientTemperature}`);
			if (rec.ambientHumidity) console.log(`  Humidity:    ${rec.ambientHumidity}`);
			if (rec.result) console.log(`  Result:      ${colorResult(rec.result)}`);

			formatPointsTable("Low-Point Adjustments", rec.lowPointAdjustments);
			formatPointsTable("High-Point Reference", rec.highPointReference);
		}

		if (intervalMonths !== DEFAULT_RECAL_INTERVAL_MONTHS) {
			console.log(dim(`\n  Recalibration interval: ${intervalMonths} months`));
		}
	} finally {
		client.close();
	}
}
