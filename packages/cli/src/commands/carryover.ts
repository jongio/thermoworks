import {
	assessCarryover,
	type CarryoverResult,
	type CarryoverSize,
	carryoverRiseForSize,
	ThermoworksCloud,
	toFahrenheit,
} from "thermoworks-sdk";

import { getCredentials } from "../credentials.js";
import { type OutputOptions, outputJson } from "../output.js";

const SIZES: CarryoverSize[] = ["small", "medium", "large"];

/** Parsed options for the carryover command. */
export interface CarryoverCommandOptions {
	serial?: string;
	channel?: number;
	targetF?: number;
	riseF?: number;
	size?: CarryoverSize;
}

/** Parse args after `carryover`. Returns an error message on failure. */
export function parseCarryoverArgs(args: string[]): CarryoverCommandOptions | { error: string } {
	const result: CarryoverCommandOptions = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === undefined) continue;

		if (arg === "--channel") {
			const value = args[++i];
			if (value === undefined) return { error: "--channel requires a value" };
			const n = Number(value);
			if (!Number.isInteger(n) || n < 1 || n > 9) {
				return { error: `--channel must be an integer from 1 to 9, got "${value}"` };
			}
			result.channel = n;
		} else if (arg === "--target") {
			const value = args[++i];
			if (value === undefined) return { error: "--target requires a value" };
			const n = Number(value);
			if (!Number.isFinite(n)) {
				return { error: `--target must be a number, got "${value}"` };
			}
			result.targetF = n;
		} else if (arg === "--rise") {
			const value = args[++i];
			if (value === undefined) return { error: "--rise requires a value" };
			const n = Number(value);
			if (!Number.isFinite(n) || n < 0) {
				return { error: `--rise must be a non-negative number, got "${value}"` };
			}
			result.riseF = n;
		} else if (arg === "--size") {
			const value = args[++i];
			if (value === undefined) return { error: "--size requires a value" };
			if (!SIZES.includes(value as CarryoverSize)) {
				return { error: `--size must be one of: ${SIZES.join(", ")}` };
			}
			result.size = value as CarryoverSize;
		} else if (arg.startsWith("--")) {
			return { error: `Unknown option: ${arg}` };
		} else if (result.serial === undefined) {
			result.serial = arg;
		} else {
			return { error: `Unexpected argument: ${arg}` };
		}
	}

	if (result.riseF !== undefined && result.size !== undefined) {
		return { error: "--rise and --size cannot be used together" };
	}

	return result;
}

/** Resolve the carryover rise from an explicit value or a size preset (default medium). */
export function resolveRise(options: CarryoverCommandOptions): {
	riseF: number;
	source: string;
} {
	if (options.riseF !== undefined) {
		return { riseF: options.riseF, source: "custom" };
	}
	const size = options.size ?? "medium";
	return { riseF: carryoverRiseForSize(size), source: size };
}

function roundTemp(value: number): number {
	return Math.round(value * 10) / 10;
}

/** Format a carryover result as human-readable lines. */
export function formatCarryover(
	result: CarryoverResult,
	channelLabel: string,
	riseSource: string,
): string {
	const current = `${roundTemp(result.currentTempF)}\u00B0F`;
	const target = `${roundTemp(result.targetTempF)}\u00B0F`;
	const pull = `${roundTemp(result.pullTempF)}\u00B0F`;
	const riseNote =
		riseSource === "custom"
			? `${roundTemp(result.riseF)}\u00B0F carryover`
			: `${roundTemp(result.riseF)}\u00B0F carryover for a ${riseSource} cut`;

	const lines = [`Carryover on ${channelLabel}: current ${current}, target ${target}`];

	if (result.overshoot) {
		lines.push(
			`  Past the pull point. Projected final ${roundTemp(
				result.projectedFinalF,
			)}\u00B0F is over the ${target} target (${riseNote}).`,
		);
	} else if (result.pullNow) {
		lines.push(`  Pull now. Lands near ${target} after resting (${riseNote}).`);
	} else {
		lines.push(`  Pull at ${pull} to land on ${target} after resting (${riseNote}).`);
		lines.push(`  ${roundTemp(result.remainingF)}\u00B0F to go before you pull.`);
	}

	return `${lines.join("\n")}\n`;
}

/**
 * Predict when to pull food off the heat so carryover cooking lands it on the
 * target temperature after resting. Reads the current probe temperature and
 * reports the pull temperature and how far the current reading is from it.
 *
 * Pass `--rise <deg>` for a known carryover, or `--size small|medium|large` to
 * use a preset. Use `--json` for a machine-readable result.
 */
export async function carryover(args: string[], options: OutputOptions): Promise<void> {
	const usage =
		"Usage: thermoworks carryover <SERIAL> --target <F> [--channel <1-9>] [--rise <deg> | --size small|medium|large] [--json]";
	const parsed = parseCarryoverArgs(args);
	if ("error" in parsed) {
		console.error(parsed.error);
		console.error(usage);
		process.exit(1);
	}

	if (!parsed.serial) {
		console.error(usage);
		process.exit(1);
	}

	if (parsed.targetF === undefined) {
		console.error("--target is required");
		console.error(usage);
		process.exit(1);
	}

	const creds = await getCredentials();
	if (!creds) {
		console.error("Not logged in. Run: thermoworks auth login");
		process.exit(1);
	}

	const { riseF, source } = resolveRise(parsed);
	const client = new ThermoworksCloud({ email: creds.email, password: creds.password });

	try {
		let value: number | null;
		let units: string | null;

		if (parsed.channel !== undefined) {
			const ch = await client.getDeviceChannel(parsed.serial, parsed.channel);
			value = ch.value;
			units = ch.units;
		} else {
			const avg = await client.getAverageTemperature(parsed.serial);
			value = avg?.value ?? null;
			units = avg?.units ?? null;
		}

		if (value == null) {
			console.error(
				parsed.channel !== undefined
					? `No reading for channel ${parsed.channel} on ${parsed.serial}.`
					: `No temperature readings for ${parsed.serial}.`,
			);
			process.exit(1);
		}

		const currentTempF = units === "C" ? toFahrenheit(value) : value;
		const result = assessCarryover({
			currentTempF,
			targetTempF: parsed.targetF,
			riseF,
		});

		if (options.json) {
			outputJson({
				serial: parsed.serial,
				channel: parsed.channel ?? null,
				riseSource: source,
				...result,
			});
			return;
		}

		const channelLabel =
			parsed.channel !== undefined ? `channel ${parsed.channel}` : "device average";
		process.stdout.write(formatCarryover(result, channelLabel, source));
	} finally {
		client.close();
	}
}
