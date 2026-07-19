import {
	getSmokePairings,
	getWoodProfiles,
	resolveSmokePairing,
	type WoodPairing,
	type WoodProfile,
} from "thermoworks-sdk";

import { type OutputOptions, outputJson } from "../output.js";

/** Format the built-in cuts as a wood-pairing table. */
export function formatSmokeTable(pairings: WoodPairing[]): string {
	const rows = pairings.map((p) => ({
		name: p.meat,
		woods: p.woods.join(", "),
		intensity: p.intensity,
	}));
	const header = { name: "Meat", woods: "Recommended woods", intensity: "Smoke" };
	const w = {
		name: Math.max(header.name.length, ...rows.map((r) => r.name.length)),
		woods: Math.max(header.woods.length, ...rows.map((r) => r.woods.length)),
		intensity: Math.max(header.intensity.length, ...rows.map((r) => r.intensity.length)),
	};
	const line = (r: typeof header) =>
		`  ${r.name.padEnd(w.name)}  ${r.woods.padEnd(w.woods)}  ${r.intensity.padEnd(w.intensity)}`;
	const lines = ["Smoke wood guide (recommended woods per cut):\n", line(header)];
	for (const r of rows) lines.push(line(r));
	lines.push("");
	lines.push('  Run "thermoworks smoke --woods" for what each wood tastes like.');
	return `${lines.join("\n")}\n`;
}

/** Format a single cut's wood pairing as a detailed block. */
export function formatSmokeDetail(p: WoodPairing): string {
	const lines = [
		p.meat,
		`  Woods:     ${p.woods.join(", ")}`,
		`  Smoke:     ${p.intensity}`,
		`  Why:       ${p.note}`,
	];
	return `${lines.join("\n")}\n`;
}

/** Format the wood flavor profiles as a list. */
export function formatWoodList(woods: WoodProfile[]): string {
	const nameWidth = Math.max(...woods.map((wd) => wd.wood.length));
	const strengthWidth = Math.max(...woods.map((wd) => wd.strength.length));
	const lines = ["Wood flavor profiles (lightest to boldest):\n"];
	for (const wd of woods) {
		lines.push(`  ${wd.wood.padEnd(nameWidth)}  ${wd.strength.padEnd(strengthWidth)}  ${wd.note}`);
	}
	return `${lines.join("\n")}\n`;
}

/**
 * Show recommended smoking woods for common cuts. Reads built-in reference
 * data, so it needs no network access or login.
 *
 * - Without an argument: prints a table of every built-in cut.
 * - With a meat name or alias: prints that cut's recommended woods.
 * - `--woods`: prints the flavor profile of each wood.
 */
export async function smoke(
	args: string[],
	options: OutputOptions = { json: false },
): Promise<void> {
	const meat = args.find((a) => !a.startsWith("--"));
	const showWoods = args.includes("--woods");

	if (showWoods) {
		const woods = getWoodProfiles();
		if (options.json) {
			outputJson(woods);
			return;
		}
		process.stdout.write(formatWoodList(woods));
		return;
	}

	if (meat !== undefined) {
		const pairing = resolveSmokePairing(meat);
		if (!pairing) {
			console.error(`Unknown meat: "${meat}". Run "thermoworks smoke" to see built-in cuts.`);
			process.exit(1);
		}
		if (options.json) {
			outputJson(pairing);
			return;
		}
		process.stdout.write(formatSmokeDetail(pairing));
		return;
	}

	const pairings = getSmokePairings();
	if (options.json) {
		outputJson(pairings);
		return;
	}
	process.stdout.write(formatSmokeTable(pairings));
}
