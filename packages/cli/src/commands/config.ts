import type { OutputOptions } from "../output.js";
import {
	getPreferencesPath,
	isKnownKey,
	KNOWN_KEYS,
	loadPreferences,
	type PreferenceKey,
	type Preferences,
	savePreferences,
	validatePreferenceValue,
} from "../preferences.js";

function usage(): never {
	console.error(
		[
			"Usage: thermoworks config <subcommand>",
			"",
			"  config set <key> <value>   Set a default preference",
			"  config get <key>           Show a single preference value",
			"  config list                Show all preferences",
			"  config unset <key>         Remove a preference",
			"  config path                Show the preferences file path",
			"",
			`  Keys: ${KNOWN_KEYS.join(", ")}`,
		].join("\n"),
	);
	process.exit(1);
}

function rejectUnknownKey(key: string): never {
	console.error(`Unknown key "${key}". Known keys: ${KNOWN_KEYS.join(", ")}`);
	process.exit(1);
}

function readValue(prefs: Preferences, key: PreferenceKey): string | undefined {
	const value = prefs[key];
	return value === undefined ? undefined : String(value);
}

async function set(key: string | undefined, value: string | undefined): Promise<void> {
	if (!key || value === undefined) {
		console.error("Usage: thermoworks config set <key> <value>");
		process.exit(1);
	}
	if (!isKnownKey(key)) rejectUnknownKey(key);

	const validated = validatePreferenceValue(key, value);
	if (!validated.ok) {
		console.error(`Invalid value for ${key}: ${validated.error}`);
		process.exit(1);
	}

	const prefs = await loadPreferences();
	const next: Preferences = { ...prefs, [key]: validated.value };
	await savePreferences(next);
	console.log(`Set ${key} = ${validated.value}`);
}

async function get(key: string | undefined, options: OutputOptions): Promise<void> {
	if (!key) {
		console.error("Usage: thermoworks config get <key>");
		process.exit(1);
	}
	if (!isKnownKey(key)) rejectUnknownKey(key);

	const prefs = await loadPreferences();
	const value = readValue(prefs, key);
	if (options.json) {
		console.log(JSON.stringify({ [key]: prefs[key] ?? null }, null, 2));
		return;
	}
	console.log(value ?? "(not set)");
}

async function list(options: OutputOptions): Promise<void> {
	const prefs = await loadPreferences();
	if (options.json) {
		console.log(JSON.stringify(prefs, null, 2));
		return;
	}
	for (const key of KNOWN_KEYS) {
		console.log(`${key} = ${readValue(prefs, key) ?? "(not set)"}`);
	}
}

async function unset(key: string | undefined): Promise<void> {
	if (!key) {
		console.error("Usage: thermoworks config unset <key>");
		process.exit(1);
	}
	if (!isKnownKey(key)) rejectUnknownKey(key);

	const prefs = await loadPreferences();
	if (prefs[key] === undefined) {
		console.log(`${key} is not set.`);
		return;
	}
	delete prefs[key];
	await savePreferences(prefs);
	console.log(`Unset ${key}`);
}

/** The config command: manage local default preferences. */
export async function config(args: string[], options: OutputOptions): Promise<void> {
	const subcommand = args[0];
	switch (subcommand) {
		case "set":
			await set(args[1], args[2]);
			break;
		case "get":
			await get(args[1], options);
			break;
		case "list":
			await list(options);
			break;
		case "unset":
			await unset(args[1]);
			break;
		case "path":
			console.log(getPreferencesPath());
			break;
		default:
			usage();
	}
}
