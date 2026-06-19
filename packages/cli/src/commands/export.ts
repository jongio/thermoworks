import { writeFile } from "node:fs/promises";

import type { Archive } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";

/** A flattened reading row for export output. */
export interface ExportRow {
	timestamp: string;
	channel: string;
	value: number;
	units: string;
}

/** Parsed options for the export command. */
export interface ExportOptions {
	serial: string;
	archiveId?: string;
	format: "csv" | "json";
	output?: string;
}

/**
 * Parse export-specific CLI args from remaining argv after global flags.
 * Expected: export SERIAL [--archive ID] [--format csv|json] [--output PATH]
 */
export function parseExportArgs(args: string[]): ExportOptions {
	// args[0] is "export", args[1] is SERIAL
	const serial = args[1];
	if (!serial || serial.startsWith("--")) {
		throw new Error(
			"Usage: thermoworks export SERIAL [--archive ID] [--format csv|json] [--output PATH]",
		);
	}

	let archiveId: string | undefined;
	let format: "csv" | "json" = "json";
	let output: string | undefined;

	for (let i = 2; i < args.length; i++) {
		switch (args[i]) {
			case "--archive":
				archiveId = args[++i];
				if (!archiveId) throw new Error("--archive requires a value");
				break;
			case "--format":
				{
					const val = args[++i];
					if (val !== "csv" && val !== "json") {
						throw new Error("--format must be 'csv' or 'json'");
					}
					format = val;
				}
				break;
			case "--output":
				output = args[++i];
				if (!output) throw new Error("--output requires a file path");
				break;
			default:
				throw new Error(`Unknown option: ${args[i]}`);
		}
	}

	return { serial, archiveId, format, output };
}

/**
 * Flatten an archive's channel readings into export rows.
 * Each reading becomes a row with its channel label, value, timestamp, and units.
 */
export function flattenArchive(archive: Archive): ExportRow[] {
	const rows: ExportRow[] = [];
	const channels = archive.channels ?? [];

	for (const channel of channels) {
		const label = channel.label ?? channel.number ?? "unknown";
		for (const reading of channel.recentReadings ?? []) {
			rows.push({
				timestamp: reading.timestamp.toISOString(),
				channel: label,
				value: reading.value,
				units: reading.units,
			});
		}
	}

	// Sort by timestamp ascending for consistent output
	rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
	return rows;
}

/** Format rows as CSV with header line. */
export function formatCsv(rows: ExportRow[]): string {
	const header = "timestamp,channel,value,units";
	const lines = rows.map(
		(r) => `${r.timestamp},${escapeCsvField(r.channel)},${r.value},${r.units}`,
	);
	return `${[header, ...lines].join("\n")}\n`;
}

/** Escape a CSV field if it contains commas, quotes, or newlines. */
function escapeCsvField(field: string): string {
	if (field.includes(",") || field.includes('"') || field.includes("\n")) {
		return `"${field.replace(/"/g, '""')}"`;
	}
	return field;
}

/** Format rows as JSON (pretty-printed array of objects). */
export function formatJson(rows: ExportRow[]): string {
	return `${JSON.stringify(rows, null, 2)}\n`;
}

/** Main export command handler. */
export async function exportData(args: string[]): Promise<void> {
	const options = parseExportArgs(args);

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		let archive: Archive;

		if (options.archiveId) {
			archive = await client.getArchive(options.serial, options.archiveId);
		} else {
			const archives = await client.getArchives(options.serial, { limit: 1 });
			if (archives.length === 0) {
				console.error(`No archives found for device '${options.serial}'`);
				process.exit(1);
			}
			// biome-ignore lint/style/noNonNullAssertion: guarded by length check above
			archive = archives[0]!;
		}

		const rows = flattenArchive(archive);
		const content = options.format === "csv" ? formatCsv(rows) : formatJson(rows);

		if (options.output) {
			await writeFile(options.output, content, "utf8");
			console.error(`Exported ${rows.length} readings to ${options.output}`);
		} else {
			process.stdout.write(content);
		}
	} finally {
		client.close();
	}
}
