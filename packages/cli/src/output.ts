/** Options parsed from global CLI flags. */
export interface OutputOptions {
	json: boolean;
	/** When true, mask account and device identifiers in JSON and file output. */
	redact?: boolean;
}

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

// Keys whose string value is a link or secret that should be dropped entirely.
const LINK_TOKEN_KEYS = new Set([
	"token",
	"sharetoken",
	"sharelink",
	"publiclink",
	"url",
	"href",
	"macaddress",
	"mac",
	"ssid",
	"bssid",
]);
const ACCOUNT_KEYS = new Set(["accountid", "account"]);
const USER_KEYS = new Set(["userid"]);
// Keys whose string value is a device serial.
const SERIAL_KEYS = new Set(["serial", "serialnumber", "deviceid"]);
// Serials shorter than this are not substring-replaced, to avoid masking
// unrelated text (units, short codes) that happens to contain the value.
const MIN_SERIAL_LEN = 4;

/**
 * A stateful redactor that masks account and device identifiers. Placeholders
 * are stable within one instance, so the same serial always maps to the same
 * label and relationships in the data stay readable.
 */
export interface Redactor {
	redact<T>(data: T): T;
}

/** Create a redactor with its own placeholder maps. */
export function createRedactor(): Redactor {
	const serialMap = new Map<string, string>();
	const accountMap = new Map<string, string>();
	const userMap = new Map<string, string>();
	const emailMap = new Map<string, string>();

	function assign(map: Map<string, string>, key: string, prefix: string): string {
		const existing = map.get(key);
		if (existing) return existing;
		const label = `${prefix}_${map.size + 1}`;
		map.set(key, label);
		return label;
	}

	function maskEmail(value: string): string {
		return value.replace(EMAIL_RE, (match) => {
			const label = assign(emailMap, match, "redacted");
			return `${label}@example.com`;
		});
	}

	// Pass one: collect serial values so they can be masked wherever they appear
	// (including inside file paths and other strings), not just under their key.
	function collect(value: unknown, keyLower?: string): void {
		if (typeof value === "string") {
			if (keyLower && SERIAL_KEYS.has(keyLower) && value.length >= MIN_SERIAL_LEN) {
				assign(serialMap, value, "SERIAL");
			}
			return;
		}
		if (Array.isArray(value)) {
			for (const item of value) collect(item);
			return;
		}
		if (value && typeof value === "object") {
			for (const [k, v] of Object.entries(value)) collect(v, k.toLowerCase());
		}
	}

	function maskString(value: string, keyLower?: string): string {
		if (keyLower && LINK_TOKEN_KEYS.has(keyLower)) return "REDACTED";
		if (keyLower && ACCOUNT_KEYS.has(keyLower)) return assign(accountMap, value, "ACCOUNT");
		if (keyLower && USER_KEYS.has(keyLower)) return assign(userMap, value, "USER");

		let out = value;
		if (keyLower && SERIAL_KEYS.has(keyLower) && value.length >= MIN_SERIAL_LEN) {
			assign(serialMap, value, "SERIAL");
		}
		for (const [serial, label] of serialMap) {
			if (out.includes(serial)) out = out.split(serial).join(label);
		}
		out = maskEmail(out);
		return out;
	}

	function transform(value: unknown, keyLower?: string): unknown {
		if (typeof value === "string") return maskString(value, keyLower);
		if (Array.isArray(value)) return value.map((item) => transform(item));
		if (value && typeof value === "object") {
			const out: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(value)) out[k] = transform(v, k.toLowerCase());
			return out;
		}
		return value;
	}

	return {
		redact<T>(data: T): T {
			collect(data);
			return transform(data) as T;
		},
	};
}

let activeRedactor: Redactor | null = null;

/** Enable or disable redaction for the current CLI process. */
export function setRedaction(enabled: boolean): void {
	activeRedactor = enabled ? createRedactor() : null;
}

/** Apply the active redactor to a value, or return it unchanged when off. */
export function maybeRedact<T>(data: T): T {
	return activeRedactor ? activeRedactor.redact(data) : data;
}

/**
 * Write structured data as pretty-printed JSON to stdout.
 * Used by commands when `--json` is active. Honors `--redact`.
 */
export function outputJson(data: unknown): void {
	console.log(JSON.stringify(maybeRedact(data), null, 2));
}

/**
 * Parse global flags (e.g., `--json`, `--redact`) from raw argv, returning
 * the parsed options and the remaining args for command routing.
 */
export function parseGlobalFlags(args: string[]): { options: OutputOptions; remaining: string[] } {
	const json = args.includes("--json");
	const redact = args.includes("--redact");
	const remaining = args.filter((a) => a !== "--json" && a !== "--redact");
	return { options: { json, redact }, remaining };
}
