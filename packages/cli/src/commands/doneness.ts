import { getMeatProfiles, type MeatProfile, resolveMeatProfile } from "thermoworks-sdk";

import { type OutputOptions, outputJson } from "../output.js";

function formatTarget(p: MeatProfile): string {
	return p.targetTempF != null ? `${p.targetTempF}\u00B0F` : "By feel";
}

function formatCookTime(p: MeatProfile): string {
	return p.hoursPerPound != null ? `${p.hoursPerPound} h/lb` : `${p.fixedHours} h`;
}

/** Format the built-in cuts as a doneness table with pull temperatures. */
export function formatDonenessTable(profiles: MeatProfile[]): string {
	const rows = profiles.map((p) => ({
		name: p.name,
		target: formatTarget(p),
		pit: `${p.pitTempF}\u00B0F`,
		rest: `${p.restMinutes}m`,
		note: p.doneness,
	}));
	const header = { name: "Meat", target: "Pull at", pit: "Pit", rest: "Rest", note: "Doneness" };
	const w = {
		name: Math.max(header.name.length, ...rows.map((r) => r.name.length)),
		target: Math.max(header.target.length, ...rows.map((r) => r.target.length)),
		pit: Math.max(header.pit.length, ...rows.map((r) => r.pit.length)),
		rest: Math.max(header.rest.length, ...rows.map((r) => r.rest.length)),
	};
	const line = (r: typeof header) =>
		`  ${r.name.padEnd(w.name)}  ${r.target.padEnd(w.target)}  ${r.pit.padEnd(w.pit)}  ${r.rest.padEnd(w.rest)}  ${r.note}`;
	const lines = ["Doneness guide (internal pull temperatures):\n", line(header)];
	for (const r of rows) lines.push(line(r));
	return `${lines.join("\n")}\n`;
}

/** Format a single cut as a detailed block. */
export function formatDonenessDetail(p: MeatProfile): string {
	const lines = [
		p.name,
		`  Pull at:   ${formatTarget(p)}`,
		`  Pit temp:  ${p.pitTempF}\u00B0F`,
		`  Rest:      ${p.restMinutes}m`,
		`  Cook time: ${formatCookTime(p)}`,
		`  Doneness:  ${p.doneness}`,
	];
	return `${lines.join("\n")}\n`;
}

/**
 * Show recommended internal pull temperatures for common cuts. Reads the
 * built-in meat profiles, so it needs no network access or login.
 *
 * - Without an argument: prints a table of every built-in cut.
 * - With a meat name or alias: prints that cut's details.
 */
export async function doneness(
	meat: string | undefined,
	options: OutputOptions = { json: false },
): Promise<void> {
	if (meat && !meat.startsWith("--")) {
		const profile = resolveMeatProfile(meat);
		if (!profile) {
			console.error(`Unknown meat: "${meat}". Run "thermoworks doneness" to see built-in cuts.`);
			process.exit(1);
		}
		if (options.json) {
			outputJson(profile);
			return;
		}
		process.stdout.write(formatDonenessDetail(profile));
		return;
	}

	const profiles = getMeatProfiles();
	if (options.json) {
		outputJson(profiles);
		return;
	}
	process.stdout.write(formatDonenessTable(profiles));
}
