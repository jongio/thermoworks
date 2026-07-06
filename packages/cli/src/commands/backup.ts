import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Archive } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { maybeRedact, type OutputOptions, outputJson } from "../output.js";
import { flattenArchive, formatCsv, formatJson } from "./export.js";

const DEFAULT_OUTPUT_DIR = "thermoworks-backup";
const DEFAULT_LIMIT = 20;

/** Parsed options for the backup command. */
export interface BackupOptions {
	/** Limit the backup to a single device. When omitted, every device is backed up. */
	serial?: string;
	/** Directory to write archive files into. */
	output: string;
	/** Output format for each archive file. */
	format: "csv" | "json";
	/** Maximum number of archives to fetch per device. */
	limit: number;
}

/** A record of one archive written to disk. */
export interface BackupEntry {
	serial: string;
	archiveId: string;
	label: string | null;
	file: string;
	readings: number;
}

/**
 * Parse backup-specific CLI args from remaining argv after global flags.
 * Expected: backup [SERIAL] [--output DIR] [--format csv|json] [--limit N]
 */
export function parseBackupArgs(args: string[]): BackupOptions {
	// args[0] is "backup"
	let serial: string | undefined;
	let output = DEFAULT_OUTPUT_DIR;
	let format: "csv" | "json" = "json";
	let limit = DEFAULT_LIMIT;

	for (let i = 1; i < args.length; i++) {
		const arg = args[i];
		switch (arg) {
			case "--output":
			case "-o":
				{
					const val = args[++i];
					if (!val) throw new Error("--output requires a directory path");
					output = val;
				}
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
			case "--limit":
				{
					const val = args[++i];
					const n = Number(val);
					if (!Number.isInteger(n) || n < 1) {
						throw new Error("--limit must be a positive integer");
					}
					limit = n;
				}
				break;
			default:
				if (!arg || arg.startsWith("--")) {
					throw new Error(`Unknown option: ${arg}`);
				}
				if (serial) {
					throw new Error(`Unexpected argument: ${arg}`);
				}
				serial = arg;
		}
	}

	return { serial, output, format, limit };
}

/** Replace filesystem-unfriendly characters so a value is safe to use in a filename. */
function sanitize(part: string): string {
	return part.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Main backup command handler. */
export async function backup(args: string[], options: OutputOptions): Promise<void> {
	const opts = parseBackupArgs(args);

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });
	const ext = opts.format === "csv" ? "csv" : "json";

	try {
		const serials = opts.serial ? [opts.serial] : (await client.getDevices()).map((d) => d.serial);

		if (serials.length === 0) {
			if (options.json) {
				outputJson([]);
				return;
			}
			console.error("No devices found.");
			return;
		}

		await mkdir(opts.output, { recursive: true });

		const entries: BackupEntry[] = [];

		for (const serial of serials) {
			const archives = await client.getArchives(serial, { limit: opts.limit });
			for (const listed of archives) {
				// Archive list entries usually include readings, but fall back to a
				// full fetch when a listed archive has no channel data.
				let full: Archive = listed;
				if (!listed.channels || listed.channels.length === 0) {
					full = await client.getArchive(serial, listed.id);
				}

				const rows = maybeRedact(flattenArchive(full));
				const content = opts.format === "csv" ? formatCsv(rows) : formatJson(rows);
				const file = join(opts.output, `${sanitize(serial)}-${sanitize(listed.id)}.${ext}`);
				await writeFile(file, content, "utf8");

				entries.push({
					serial,
					archiveId: listed.id,
					label: full.label,
					file,
					readings: rows.length,
				});
			}
		}

		if (options.json) {
			outputJson(entries);
			return;
		}

		if (entries.length === 0) {
			console.error("No archives found to back up.");
			return;
		}

		for (const entry of entries) {
			console.log(`${entry.file}  (${entry.readings} readings)`);
		}

		const totalReadings = entries.reduce((sum, entry) => sum + entry.readings, 0);
		console.error(
			`Backed up ${entries.length} archive(s), ${totalReadings} readings total, to ${opts.output}`,
		);
	} finally {
		client.close();
	}
}
