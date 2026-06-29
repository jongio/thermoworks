import { writeFile } from "node:fs/promises";

import type { DeviceHistory } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import type { OutputOptions } from "../output.js";
import { formatHistoryTrend } from "./sparkline.js";

type HistoryFormat = "table" | "csv" | "json";

/** Parsed options for the history command. */
interface HistoryOptions {
	serial: string;
	format: HistoryFormat;
	limit?: number;
	output?: string;
}

/**
 * Parse history-specific CLI args.
 * Expected: SERIAL [--limit N] [--format table|csv|json] [--output PATH]
 *
 * Format precedence: explicit --format wins; otherwise if global --json is
 * set, use json; otherwise table.
 */
export function parseHistoryArgs(args: string[], globalOptions: OutputOptions): HistoryOptions {
	const serial = args[0];
	if (!serial || serial.startsWith("--")) {
		console.error(
			"Usage: thermoworks history <SERIAL> [--limit N] [--format table|csv|json] [--output PATH]",
		);
		process.exit(1);
	}

	let format: HistoryFormat | undefined;
	let limit: number | undefined;
	let output: string | undefined;

	for (let i = 1; i < args.length; i++) {
		switch (args[i]) {
			case "--format":
				{
					const val = args[++i];
					if (val !== "table" && val !== "csv" && val !== "json") {
						console.error("--format must be 'table', 'csv', or 'json'");
						process.exit(1);
					}
					format = val;
				}
				break;
			case "--limit":
				{
					const raw = args[++i];
					const n = Number(raw);
					if (!raw || !Number.isInteger(n) || n < 1) {
						console.error(`--limit must be a positive integer, got: ${raw}`);
						process.exit(1);
					}
					limit = n;
				}
				break;
			case "--output":
				output = args[++i];
				if (!output) {
					console.error("--output requires a file path");
					process.exit(1);
				}
				break;
			default:
				console.error(`Unknown option: ${args[i]}`);
				process.exit(1);
		}
	}

	// Format precedence: explicit --format > global --json > default table
	const resolvedFormat = format ?? (globalOptions.json ? "json" : "table");

	return { serial, format: resolvedFormat, limit, output };
}

/** Format readings as an aligned table with header. */
export function formatTable(readings: DeviceHistory["readings"]): string {
	if (readings.length === 0) return "";

	const header = { timestamp: "Timestamp", value: "Value", units: "Units" };

	const rows = readings.map((r, index) => ({
		timestamp: r.timestamp,
		value: String(r.value),
		units: r.units,
		trend: formatHistoryTrend(readings, index),
	}));

	const tsWidth = Math.max(header.timestamp.length, ...rows.map((r) => r.timestamp.length));
	const valWidth = Math.max(header.value.length, ...rows.map((r) => r.value.length));
	const unitWidth = Math.max(header.units.length, ...rows.map((r) => r.units.length));
	const trendWidth = Math.max("Trend".length, ...rows.map((r) => r.trend.length));

	const lines: string[] = [];
	lines.push(
		`${header.timestamp.padEnd(tsWidth)}  ${header.value.padEnd(valWidth)}  ${header.units.padEnd(unitWidth)}  ${"Trend".padEnd(trendWidth)}`,
	);
	for (const row of rows) {
		lines.push(
			`${row.timestamp.padEnd(tsWidth)}  ${row.value.padEnd(valWidth)}  ${row.units.padEnd(unitWidth)}  ${row.trend.padEnd(trendWidth)}`,
		);
	}

	return `${lines.join("\n")}\n`;
}

/** Format readings as CSV with header line. */
export function formatCsv(readings: DeviceHistory["readings"]): string {
	const header = "timestamp,value,units";
	const lines = readings.map((r) => `${r.timestamp},${r.value},${r.units}`);
	return `${[header, ...lines].join("\n")}\n`;
}

/** Main history command handler. */
export async function history(args: string[], options: OutputOptions): Promise<void> {
	const opts = parseHistoryArgs(args, options);

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const data = await client.getHistory(opts.serial);

		// The API returns readings in chronological order. --limit N takes the
		// N most recent readings (from the end of the array).
		const readings = opts.limit ? data.readings.slice(-opts.limit) : data.readings;

		let content: string;
		switch (opts.format) {
			case "csv":
				content = formatCsv(readings);
				break;
			case "json":
				content = `${JSON.stringify({ deviceId: data.deviceId, readings }, null, 2)}\n`;
				break;
			default:
				if (readings.length === 0) {
					console.log(`No history available for ${opts.serial}.`);
					return;
				}
				content = formatTable(readings);
				break;
		}

		if (opts.output) {
			await writeFile(opts.output, content, "utf8");
			console.error(`Wrote ${readings.length} readings to ${opts.output}.`);
		} else {
			process.stdout.write(content);
		}
	} finally {
		client.close();
	}
}
