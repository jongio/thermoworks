import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const JOURNAL_DIR = join(homedir(), ".thermoworks");
const JOURNAL_PATH = join(JOURNAL_DIR, "journal.json");

/** A single logbook entry for a finished cook. */
export interface JournalEntry {
	id: string;
	createdAt: string;
	title: string;
	meat?: string;
	weightLb?: number;
	rating?: number;
	notes?: string;
	device?: string;
	archive?: string;
}

/** Fields accepted when adding an entry. The id and timestamp are generated. */
export type NewJournalEntry = Omit<JournalEntry, "id" | "createdAt">;

function isJournalEntry(value: unknown): value is JournalEntry {
	if (typeof value !== "object" || value === null) return false;
	const entry = value as Record<string, unknown>;
	return (
		typeof entry.id === "string" &&
		typeof entry.createdAt === "string" &&
		typeof entry.title === "string"
	);
}

/** Generate a short id that does not collide with existing ids. */
function generateId(existing: Set<string>): string {
	let id = "";
	do {
		id = Math.random().toString(36).slice(2, 8);
	} while (id.length < 6 || existing.has(id));
	return id;
}

/**
 * Read all journal entries. Returns an empty list when the file is missing.
 * A corrupt or unexpected file is reported once and treated as empty so a
 * bad file never crashes the command.
 */
export async function loadJournal(): Promise<JournalEntry[]> {
	try {
		const raw = await readFile(JOURNAL_PATH, "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			console.error("Warning: ~/.thermoworks/journal.json has invalid format, ignoring it.");
			return [];
		}
		return parsed.filter(isJournalEntry);
	} catch (err) {
		if (err instanceof SyntaxError) {
			console.error("Warning: ~/.thermoworks/journal.json is corrupted, ignoring it.");
		}
		return [];
	}
}

/** Write the full set of entries back to disk with safe permissions. */
export async function saveJournal(entries: JournalEntry[]): Promise<void> {
	await mkdir(JOURNAL_DIR, { recursive: true, mode: 0o700 });
	await writeFile(JOURNAL_PATH, `${JSON.stringify(entries, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
}

/** Add an entry, assigning a stable short id and created timestamp. */
export async function addEntry(input: NewJournalEntry): Promise<JournalEntry> {
	const entries = await loadJournal();
	const existing = new Set(entries.map((e) => e.id));
	const entry: JournalEntry = {
		id: generateId(existing),
		createdAt: new Date().toISOString(),
		...input,
	};
	entries.push(entry);
	await saveJournal(entries);
	return entry;
}

/** Look up a single entry by id. */
export async function getEntry(id: string): Promise<JournalEntry | undefined> {
	const entries = await loadJournal();
	return entries.find((e) => e.id === id);
}

/** Remove an entry by id. Returns true when an entry was removed. */
export async function removeEntry(id: string): Promise<boolean> {
	const entries = await loadJournal();
	const next = entries.filter((e) => e.id !== id);
	if (next.length === entries.length) return false;
	await saveJournal(next);
	return true;
}

export function getJournalPath(): string {
	return JOURNAL_PATH;
}
