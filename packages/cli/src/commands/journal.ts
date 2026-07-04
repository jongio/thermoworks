import {
	addEntry,
	getEntry,
	type JournalEntry,
	loadJournal,
	type NewJournalEntry,
	removeEntry,
} from "../journal.js";
import { type OutputOptions, outputJson } from "../output.js";

/** Parse an `add` spec into a new entry. Returns an error message on failure. */
export function parseAddArgs(args: string[]): NewJournalEntry | { error: string } {
	const input: NewJournalEntry = { title: "" };

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		const readValue = (flag: string): string | { error: string } => {
			const value = args[++i];
			if (value === undefined) return { error: `${flag} requires a value` };
			return value;
		};

		switch (arg) {
			case "--title": {
				const v = readValue(arg);
				if (typeof v !== "string") return v;
				input.title = v;
				break;
			}
			case "--meat": {
				const v = readValue(arg);
				if (typeof v !== "string") return v;
				input.meat = v;
				break;
			}
			case "--notes": {
				const v = readValue(arg);
				if (typeof v !== "string") return v;
				input.notes = v;
				break;
			}
			case "--device": {
				const v = readValue(arg);
				if (typeof v !== "string") return v;
				input.device = v;
				break;
			}
			case "--archive": {
				const v = readValue(arg);
				if (typeof v !== "string") return v;
				input.archive = v;
				break;
			}
			case "--weight": {
				const v = readValue(arg);
				if (typeof v !== "string") return v;
				const weight = Number.parseFloat(v);
				if (!Number.isFinite(weight) || weight <= 0) {
					return { error: `--weight must be a positive number, got "${v}"` };
				}
				input.weightLb = weight;
				break;
			}
			case "--rating": {
				const v = readValue(arg);
				if (typeof v !== "string") return v;
				const rating = Number.parseInt(v, 10);
				if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
					return { error: `--rating must be an integer from 1 to 5, got "${v}"` };
				}
				input.rating = rating;
				break;
			}
			default:
				if (arg.startsWith("--")) return { error: `Unknown option: ${arg}` };
		}
	}

	if (!input.title.trim()) {
		return { error: "--title is required" };
	}
	return input;
}

function formatDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString([], {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function formatStars(rating: number): string {
	return "*".repeat(rating) + ".".repeat(Math.max(0, 5 - rating));
}

/** Format the list view (newest first). */
export function formatList(entries: JournalEntry[]): string {
	if (entries.length === 0) {
		return 'No journal entries yet. Add one with: thermoworks journal add --title "..."\n';
	}
	const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	const lines = sorted.map((e) => {
		const parts = [e.id, formatDate(e.createdAt), e.title];
		if (e.meat) parts.push(e.meat);
		if (e.rating != null) parts.push(formatStars(e.rating));
		return `  ${parts.join("  ")}`;
	});
	return `${lines.join("\n")}\n`;
}

/** Format a single entry in full. */
export function formatEntry(entry: JournalEntry): string {
	const lines = [`${entry.title}  (${entry.id})`, `  Logged:  ${formatDate(entry.createdAt)}`];
	if (entry.meat) lines.push(`  Meat:    ${entry.meat}`);
	if (entry.weightLb != null) lines.push(`  Weight:  ${entry.weightLb} lb`);
	if (entry.rating != null)
		lines.push(`  Rating:  ${formatStars(entry.rating)} (${entry.rating}/5)`);
	if (entry.device) lines.push(`  Device:  ${entry.device}`);
	if (entry.archive) lines.push(`  Archive: ${entry.archive}`);
	if (entry.notes) lines.push(`  Notes:   ${entry.notes}`);
	return `${lines.join("\n")}\n`;
}

const USAGE = `Usage: thermoworks journal <add|list|show|rm> [options]

  journal add --title "Sunday brisket" [--meat brisket] [--weight 12]
              [--rating 4] [--notes "..."] [--device SN] [--archive ID]
  journal list [--json]
  journal show <id> [--json]
  journal rm <id>`;

/** Route `thermoworks journal <subcommand>` to the right handler. */
export async function journal(args: string[], options: OutputOptions): Promise<void> {
	const subcommand = args[0];

	switch (subcommand) {
		case "add": {
			const parsed = parseAddArgs(args.slice(1));
			if ("error" in parsed) {
				console.error(parsed.error);
				process.exit(1);
			}
			const entry = await addEntry(parsed);
			if (options.json) {
				outputJson(entry);
				return;
			}
			console.log(`Added journal entry ${entry.id}: ${entry.title}`);
			break;
		}
		case "list": {
			const entries = await loadJournal();
			if (options.json) {
				outputJson([...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
				return;
			}
			process.stdout.write(formatList(entries));
			break;
		}
		case "show": {
			const id = args[1];
			if (!id) {
				console.error("Usage: thermoworks journal show <id>");
				process.exit(1);
			}
			const entry = await getEntry(id);
			if (!entry) {
				console.error(`No journal entry with id "${id}".`);
				process.exit(1);
			}
			if (options.json) {
				outputJson(entry);
				return;
			}
			process.stdout.write(formatEntry(entry));
			break;
		}
		case "rm": {
			const id = args[1];
			if (!id) {
				console.error("Usage: thermoworks journal rm <id>");
				process.exit(1);
			}
			const removed = await removeEntry(id);
			if (!removed) {
				console.error(`No journal entry with id "${id}".`);
				process.exit(1);
			}
			console.log(`Removed journal entry ${id}.`);
			break;
		}
		default:
			if (subcommand) console.error(`Unknown journal command: ${subcommand}\n`);
			console.log(USAGE);
			if (subcommand) process.exit(1);
	}
}
