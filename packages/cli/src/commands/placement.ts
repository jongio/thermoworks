import { getProbePlacements, type ProbePlacement, resolveProbePlacement } from "thermoworks-sdk";

import { type OutputOptions, outputJson } from "../output.js";

/** Format the built-in probe placements as a compact table. */
export function formatPlacementTable(placements: ProbePlacement[]): string {
	const header = { meat: "Meat", probe: "Meat probe" };
	const rows = placements.map((placement) => ({
		meat: placement.meat,
		probe: placement.meatProbe,
	}));
	const width = Math.max(header.meat.length, ...rows.map((row) => row.meat.length));
	const lines = ["Probe placement guide:\n", `  ${header.meat.padEnd(width)}  ${header.probe}`];
	for (const row of rows) lines.push(`  ${row.meat.padEnd(width)}  ${row.probe}`);
	return `${lines.join("\n")}\n`;
}

/** Format one cut's probe placement details. */
export function formatPlacementDetail(placement: ProbePlacement): string {
	const lines = [
		placement.meat,
		`  Meat probe: ${placement.meatProbe}`,
		`  Pit probe:  ${placement.pitProbe}`,
		`  Avoid:      ${placement.avoid.join(", ")}`,
	];
	for (const note of placement.notes) lines.push(`  Note:       ${note}`);
	return `${lines.join("\n")}\n`;
}

/**
 * Show probe placement guidance for common cuts. Uses offline SDK reference data,
 * so it needs no ThermoWorks Cloud login or network access.
 */
export async function placement(
	args: string[],
	options: OutputOptions = { json: false },
): Promise<void> {
	const meat = args.join(" ").trim();

	if (meat.length > 0) {
		if (meat.startsWith("--")) {
			console.error(`Unknown option: ${meat}`);
			process.exit(1);
		}
		const result = resolveProbePlacement(meat);
		if (!result) {
			console.error(`Unknown meat: "${meat}". Run "thermoworks placement" to see built-in cuts.`);
			process.exit(1);
		}
		if (options.json) {
			outputJson(result);
			return;
		}
		process.stdout.write(formatPlacementDetail(result));
		return;
	}

	const placements = getProbePlacements();
	if (options.json) {
		outputJson(placements);
		return;
	}
	process.stdout.write(formatPlacementTable(placements));
}
