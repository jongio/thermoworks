import { toCelsius, toFahrenheit } from "thermoworks-sdk";

import { type OutputOptions, outputJson } from "../output.js";

/** A parsed and computed temperature conversion. */
export interface ConversionResult {
	input: number;
	inputUnit: "C" | "F";
	value: number;
	unit: "C" | "F";
}

/**
 * Parse a temperature argument and optional `--to` target into a conversion.
 *
 * A suffixed value (`225f`, `107c`) sets the source unit and converts to the
 * other unit; `--to` is ignored in that case. A bare number needs `--to c|f`
 * to pick the target unit, and the source is taken as the opposite unit.
 * Returns null when the input cannot be parsed.
 */
export function parseConversion(raw: string | undefined, to?: string): ConversionResult | null {
	if (!raw) return null;

	const match = /^(-?\d+(?:\.\d+)?)([cCfF]?)$/.exec(raw.trim());
	if (!match) return null;

	const input = Number(match[1]);
	if (!Number.isFinite(input)) return null;

	const suffix = (match[2] ?? "").toUpperCase();
	const toUnit = to?.trim().toUpperCase();

	let inputUnit: "C" | "F";
	let unit: "C" | "F";

	if (suffix === "C" || suffix === "F") {
		inputUnit = suffix;
		unit = suffix === "C" ? "F" : "C";
	} else {
		if (toUnit !== "C" && toUnit !== "F") return null;
		unit = toUnit;
		inputUnit = toUnit === "C" ? "F" : "C";
	}

	const value = unit === "F" ? toFahrenheit(input) : toCelsius(input);
	return { input, inputUnit, value, unit };
}

/**
 * Convert a temperature between Celsius and Fahrenheit.
 *
 * `thermoworks convert 225f` prints the Celsius value; `thermoworks convert
 * 107c` prints the Fahrenheit value. A bare number needs `--to c|f`.
 */
export function convert(args: string[], options: OutputOptions): void {
	const value = args.find((a) => !a.startsWith("--"));
	const toIdx = args.indexOf("--to");
	const to = toIdx !== -1 && toIdx + 1 < args.length ? args[toIdx + 1] : undefined;

	const result = parseConversion(value, to);
	if (!result) {
		console.error(
			"Usage: thermoworks convert <VALUE>[c|f] [--to c|f]\n" +
				"Examples: thermoworks convert 225f | thermoworks convert 107c | thermoworks convert 225 --to c",
		);
		process.exit(1);
		return;
	}

	if (options.json) {
		outputJson({ input: result.input, value: result.value, unit: result.unit });
		return;
	}

	console.log(`${result.value}\u00B0${result.unit}`);
}
