import type { Archive } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Parsed arguments specific to the `archives` command. */
export interface ArchivesArgs {
	serial: string;
	id?: string;
	limit?: number;
	from?: Date;
	to?: Date;
}

export type ArchivesParseResult = ArchivesArgs | { error: string } | null;

function parseDateFlag(
	value: string | undefined,
	flag: "--from" | "--to",
): Date | { error: string } {
	if (!value) return { error: `${flag} requires a value` };
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return { error: `${flag} must be a valid date, got "${value}"` };
	}
	if (flag === "--to" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
		date.setUTCHours(23, 59, 59, 999);
	}
	return date;
}

/**
 * Parse command-specific args for `archives`.
 * Expected: `archives SERIAL [--id ID] [--limit N] [--from DATE] [--to DATE]`
 * Returns null if serial is missing.
 */
export function parseArchivesArgs(args: string[]): ArchivesParseResult {
	const positional: string[] = [];
	let id: string | undefined;
	let limit: number | undefined;
	let from: Date | undefined;
	let to: Date | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--id") {
			const next = args[++i];
			if (next) id = next;
		} else if (arg === "--limit") {
			const next = args[++i];
			if (next) limit = Number.parseInt(next, 10);
		} else if (arg === "--from") {
			const parsed = parseDateFlag(args[++i], "--from");
			if ("error" in parsed) return parsed;
			from = parsed;
		} else if (arg === "--to") {
			const parsed = parseDateFlag(args[++i], "--to");
			if ("error" in parsed) return parsed;
			to = parsed;
		} else if (arg && !arg.startsWith("--")) {
			positional.push(arg);
		}
	}

	// positional[0] is "archives" (the command name), positional[1] is the serial
	const serial = positional[1];
	if (!serial) return null;

	return {
		serial,
		id,
		limit,
		...(from ? { from } : {}),
		...(to ? { to } : {}),
	};
}

/** Filter archives by start date, skipping undated archives when a date filter is active. */
export function filterArchivesByDate(archives: Archive[], from?: Date, to?: Date): Archive[] {
	if (!from && !to) return archives;
	return archives.filter((archive) => {
		if (!archive.start) return false;
		const start = archive.start.getTime();
		if (from && start < from.getTime()) return false;
		if (to && start > to.getTime()) return false;
		return true;
	});
}

/** Format a duration between two dates as a human-readable string. */
function formatDuration(start: Date | null, end: Date | null): string {
	if (!start || !end) return "-";
	const ms = end.getTime() - start.getTime();
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

/** Format a Date as a locale string, or "-" if null. */
function formatDateTime(date: Date | null): string {
	if (!date) return "-";
	return date.toLocaleString();
}

/**
 * List or show archived cooking sessions for a device.
 *
 * - Without `--id`: lists archives showing label, times, duration, reading count.
 * - With `--id`: shows detailed view including per-channel min/max/last.
 */
export async function archives(
	parsedArgs: ArchivesArgs,
	options: OutputOptions = { json: false },
): Promise<void> {
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		if (parsedArgs.id) {
			await showArchiveDetail(client, parsedArgs.serial, parsedArgs.id, options);
		} else {
			await listArchives(client, parsedArgs.serial, parsedArgs.limit, options, {
				from: parsedArgs.from,
				to: parsedArgs.to,
			});
		}
	} finally {
		client.close();
	}
}

async function listArchives(
	client: ThermoworksCloud,
	serial: string,
	limit: number | undefined,
	options: OutputOptions,
	dateFilter: { from?: Date; to?: Date } = {},
): Promise<void> {
	const allArchives = await client.getArchives(serial, limit ? { limit } : undefined);
	const archiveList = filterArchivesByDate(allArchives, dateFilter.from, dateFilter.to);

	if (options.json) {
		outputJson(archiveList);
		return;
	}

	if (archiveList.length === 0) {
		console.log("No archives found.");
		return;
	}

	console.log(`Found ${archiveList.length} archive${archiveList.length > 1 ? "s" : ""}:\n`);

	for (const archive of archiveList) {
		const name = archive.label || archive.id;
		const duration = formatDuration(archive.start, archive.end);
		const start = formatDateTime(archive.start);
		const count = archive.count ?? 0;

		console.log(`  ${name}`);
		console.log(`    Start: ${start}  Duration: ${duration}  Readings: ${count}`);
		console.log(`    ID: ${archive.id}`);
		console.log("");
	}
}

async function showArchiveDetail(
	client: ThermoworksCloud,
	serial: string,
	archiveId: string,
	options: OutputOptions,
): Promise<void> {
	const archive = await client.getArchive(serial, archiveId);

	if (options.json) {
		outputJson(archive);
		return;
	}

	const name = archive.label || archive.id;
	const duration = formatDuration(archive.start, archive.end);

	console.log(`Archive: ${name}`);
	console.log(`  ID:       ${archive.id}`);
	console.log(`  Start:    ${formatDateTime(archive.start)}`);
	console.log(`  End:      ${formatDateTime(archive.end)}`);
	console.log(`  Duration: ${duration}`);
	console.log(`  Readings: ${archive.count ?? 0}`);
	if (archive.notes) console.log(`  Notes:    ${archive.notes}`);

	const channels = archive.channels;
	if (channels && channels.length > 0) {
		console.log("\n  Channels:");
		for (const ch of channels) {
			const label = ch.label || `Ch ${ch.number ?? "?"}`;
			const unit = ch.units ?? "";
			const min = ch.minimum?.value != null ? `${ch.minimum.value}\u00B0${unit}` : "-";
			const max = ch.maximum?.value != null ? `${ch.maximum.value}\u00B0${unit}` : "-";
			const last = ch.value != null ? `${ch.value}\u00B0${unit}` : "-";

			console.log(`    ${label}: min=${min} max=${max} last=${last}`);
		}
	}
}
