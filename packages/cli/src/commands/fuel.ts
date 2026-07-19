import { estimateFuel, type FuelEstimate, type FuelType, listFuelTypes } from "thermoworks-sdk";

import { type OutputOptions, outputJson } from "../output.js";

/** Parsed options for the fuel command. */
export interface FuelCommandOptions {
	pitTempF?: number;
	hours?: number;
	fuelType: FuelType;
	hopperLb?: number;
	list?: boolean;
}

function isFuelType(value: string): value is FuelType {
	return (listFuelTypes() as string[]).includes(value);
}

/** Parse args after `fuel`. Returns an error message on failure. */
export function parseFuelArgs(args: string[]): FuelCommandOptions | { error: string } {
	const result: FuelCommandOptions = { fuelType: "pellet" };

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		if (arg === "--temp") {
			const value = args[++i];
			if (value === undefined) return { error: "--temp requires a value in degrees F" };
			const n = Number(value);
			if (!Number.isFinite(n) || n <= 0) {
				return { error: `--temp must be a positive number, got "${value}"` };
			}
			result.pitTempF = n;
		} else if (arg === "--hours") {
			const value = args[++i];
			if (value === undefined) return { error: "--hours requires a value" };
			const n = Number(value);
			if (!Number.isFinite(n) || n <= 0) {
				return { error: `--hours must be a positive number, got "${value}"` };
			}
			result.hours = n;
		} else if (arg === "--fuel") {
			const value = args[++i];
			if (value === undefined) return { error: "--fuel requires a type" };
			if (!isFuelType(value)) {
				return {
					error: `Unknown fuel type: "${value}". Available: ${listFuelTypes().join(", ")}.`,
				};
			}
			result.fuelType = value;
		} else if (arg === "--hopper") {
			const value = args[++i];
			if (value === undefined) return { error: "--hopper requires a value in pounds" };
			const n = Number(value);
			if (!Number.isFinite(n) || n <= 0) {
				return { error: `--hopper must be a positive number, got "${value}"` };
			}
			result.hopperLb = n;
		} else if (arg === "--list") {
			result.list = true;
		} else if (arg.startsWith("--")) {
			return { error: `Unknown option: ${arg}` };
		} else {
			return { error: `Unexpected argument: ${arg}` };
		}
	}

	return result;
}

/** Format the supported fuel types as a list. */
export function formatFuelTypeList(): string {
	const lines = ["Fuel types:\n"];
	for (const type of listFuelTypes()) {
		lines.push(`  ${type}`);
	}
	lines.push("");
	lines.push("  Burn rates rise with pit temperature. Pass --temp and --hours for an estimate.");
	return `${lines.join("\n")}\n`;
}

/** Format a fuel estimate for the terminal. */
export function formatFuel(estimate: FuelEstimate): string {
	const lines = [
		`Fuel for ${estimate.hours} h at ${estimate.pitTempF}F on ${estimate.fuelType}:\n`,
		`  Burn rate:    ${estimate.burnRateLbPerHour} lb/hr`,
		`  Estimated:    ${estimate.totalLb} lb`,
		`  Pack:         ${estimate.recommendedLb} lb (includes a buffer)`,
	];
	if (estimate.hopperLb !== undefined && estimate.runtimePerLoadHours !== undefined) {
		lines.push(`  Per load:     ${estimate.runtimePerLoadHours} h on ${estimate.hopperLb} lb`);
		const refills = estimate.refills ?? 0;
		const refillText = refills === 1 ? "1 refill" : `${refills} refills`;
		lines.push(`  Refills:      ${refillText} during the cook`);
	}
	lines.push("");
	return `${lines.join("\n")}\n`;
}

/**
 * Estimate how much fuel a cook will burn from the pit temperature, duration,
 * and fuel type. Reads only built-in burn-rate tiers, so it needs no network
 * access or login.
 *
 * - `--temp` and `--hours` are required for an estimate.
 * - `--fuel`: pellet (default), charcoal, or wood.
 * - `--hopper`: usable pounds per load, to plan refills.
 * - `--list`: show the supported fuel types.
 */
export async function fuel(args: string[], options: OutputOptions): Promise<void> {
	const usage =
		"Usage: thermoworks fuel --temp <F> --hours <h> [--fuel pellet|charcoal|wood] [--hopper <lb>] [--list] [--json]";
	const parsed = parseFuelArgs(args);
	if ("error" in parsed) {
		console.error(parsed.error);
		console.error(usage);
		process.exit(1);
	}

	if (parsed.list) {
		if (options.json) {
			outputJson(listFuelTypes());
			return;
		}
		process.stdout.write(formatFuelTypeList());
		return;
	}

	if (parsed.pitTempF === undefined) {
		console.error("--temp is required (in degrees F).");
		console.error(usage);
		process.exit(1);
	}
	if (parsed.hours === undefined) {
		console.error("--hours is required.");
		console.error(usage);
		process.exit(1);
	}

	const estimate = estimateFuel(parsed.pitTempF, parsed.hours, {
		fuelType: parsed.fuelType,
		hopperLb: parsed.hopperLb,
	});

	if (options.json) {
		outputJson(estimate);
		return;
	}

	process.stdout.write(formatFuel(estimate));
}
