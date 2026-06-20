import type { SearchOptions } from "thermoworks-sdk";
import { ThermoworksCloud } from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

const USAGE = "Usage: thermoworks search <query> [--collection device|accounts|users] [--limit N]";

const VALID_COLLECTIONS = new Set<SearchOptions["collection"]>(["device", "accounts", "users"]);

/** Parse a named flag value from args (e.g., "--limit" "20" → "20"). */
function getFlagValue(args: string[], flag: string): string | undefined {
	const idx = args.indexOf(flag);
	if (idx === -1 || idx + 1 >= args.length) return undefined;
	return args[idx + 1];
}

/** Flags that consume a subsequent value. */
const FLAGS_WITH_VALUES = new Set(["--collection", "--limit"]);

/** Extract positional arguments (everything that is not a flag or a flag value). */
function getPositionals(args: string[]): string[] {
	const positionals: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;
		if (FLAGS_WITH_VALUES.has(arg)) {
			i += 1; // skip the flag's value on next iteration
		} else if (arg.startsWith("--")) {
			// skip standalone flags
		} else {
			positionals.push(arg);
		}
	}
	return positionals;
}

/**
 * Extract a display label from a search hit document.
 * Tries common fields in priority order and returns the first non-empty string.
 */
function getDisplayLabel(document: Record<string, unknown>): string | undefined {
	for (const key of ["label", "name", "serial", "email"]) {
		const val = document[key];
		if (val !== undefined && val !== null && String(val).length > 0) {
			return String(val);
		}
	}
	return undefined;
}

/**
 * Full-text search across devices, accounts, or users.
 *
 * Accepts the args after "search" from the CLI, e.g.:
 *   `thermoworks search brisket --collection device --limit 10`
 * maps to `search(["brisket", "--collection", "device", "--limit", "10"], options)`.
 */
export async function search(args: string[], options: OutputOptions): Promise<void> {
	// --- Parse query from positionals ---
	const positionals = getPositionals(args);
	const query = positionals.join(" ").trim();

	if (!query) {
		console.error(USAGE);
		process.exit(1);
	}

	// --- Parse --collection ---
	const collectionRaw = getFlagValue(args, "--collection") ?? "device";
	if (!VALID_COLLECTIONS.has(collectionRaw as SearchOptions["collection"])) {
		console.error(`Invalid collection: ${collectionRaw}. Must be one of: device, accounts, users.`);
		process.exit(1);
	}
	const collection = collectionRaw as SearchOptions["collection"];

	// --- Parse --limit ---
	const limitRaw = getFlagValue(args, "--limit");
	let pageSize = 20;
	if (limitRaw !== undefined) {
		const n = Number(limitRaw);
		if (!Number.isInteger(n) || n < 1 || n > 100) {
			console.error(`Invalid limit: ${limitRaw}. Must be an integer from 1 to 100.`);
			process.exit(1);
		}
		pageSize = n;
	}

	// --- Auth ---
	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		const result = await client.search(query, { collection, pageSize });

		if (options.json) {
			outputJson(result);
			return;
		}

		if (result.hits.length === 0) {
			console.log(`No results found for "${query}".`);
			return;
		}

		for (const hit of result.hits) {
			const label = getDisplayLabel(hit.document);
			const labelPart = label ? `  ${label}` : "";
			console.log(`  ${hit.id}${labelPart}  (score: ${hit.score.toFixed(2)})`);
		}
	} finally {
		client.close();
	}
}
