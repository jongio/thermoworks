/** Options parsed from global CLI flags. */
export interface OutputOptions {
	json: boolean;
}

/**
 * Write structured data as pretty-printed JSON to stdout.
 * Used by commands when `--json` is active.
 */
export function outputJson(data: unknown): void {
	console.log(JSON.stringify(data, null, 2));
}

/**
 * Parse global flags (e.g., `--json`) from raw argv, returning
 * the parsed options and the remaining args for command routing.
 */
export function parseGlobalFlags(args: string[]): { options: OutputOptions; remaining: string[] } {
	const json = args.includes("--json");
	const remaining = args.filter((a) => a !== "--json");
	return { options: { json }, remaining };
}
