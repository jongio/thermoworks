import type { CalibrationPoint, CalibrationRecord } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

// ANSI color helpers
const green = (text: string): string => `\x1b[32m${text}\x1b[0m`;
const red = (text: string): string => `\x1b[31m${text}\x1b[0m`;
const bold = (text: string): string => `\x1b[1m${text}\x1b[0m`;
const dim = (text: string): string => `\x1b[2m${text}\x1b[0m`;

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
): Promise<void> {
	if (!serial) {
		console.error("Usage: thermoworks calibration <SERIAL>");
		process.exit(1);
	}

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const records = await client.getCalibration(serial);

		if (options.json) {
			outputJson(records);
			return;
		}

		if (records.length === 0) {
			console.log(`No calibration records found for ${serial}.`);
			return;
		}

		for (let i = 0; i < records.length; i++) {
			const rec = records[i]!;
			if (i > 0) console.log("");

			console.log(bold(`Calibration: ${rec.calibrationId}`));
			console.log(`  Date:        ${formatDate(rec.calibrationDate)}`);
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
	} finally {
		client.close();
	}
}
