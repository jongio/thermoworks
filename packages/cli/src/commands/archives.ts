import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Parsed arguments specific to the `archives` command. */
export interface ArchivesArgs {
	serial: string;
	id?: string;
	limit?: number;
}

/**
 * Parse command-specific args for `archives`.
 * Expected: `archives SERIAL [--id ID] [--limit N]`
 * Returns null if serial is missing.
 */
export function parseArchivesArgs(args: string[]): ArchivesArgs | null {
	const positional: string[] = [];
	let id: string | undefined;
	let limit: number | undefined;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--id") {
			const next = args[++i];
			if (next) id = next;
		} else if (arg === "--limit") {
			const next = args[++i];
			if (next) limit = Number.parseInt(next, 10);
		} else if (arg && !arg.startsWith("--")) {
			positional.push(arg);
		}
	}

	// positional[0] is "archives" (the command name), positional[1] is the serial
	const serial = positional[1];
	if (!serial) return null;

	return { serial, id, limit };
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
			await listArchives(client, parsedArgs.serial, parsedArgs.limit, options);
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
): Promise<void> {
	const archiveList = await client.getArchives(serial, limit ? { limit } : undefined);

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
