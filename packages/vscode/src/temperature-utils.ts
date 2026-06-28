import * as vscode from "vscode";

export type TemperatureUnit = "F" | "C";
export type UnitPreference = "auto" | "F" | "C";

/**
 * Convert a temperature value between Fahrenheit and Celsius.
 * Returns the value unchanged when fromUnit and toUnit are the same.
 */
export function convertTemp(
	value: number,
	fromUnit: TemperatureUnit,
	toUnit: TemperatureUnit,
): number {
	if (fromUnit === toUnit) return value;
	if (fromUnit === "F" && toUnit === "C") {
		return (value - 32) * (5 / 9);
	}
	// C -> F
	return value * (9 / 5) + 32;
}

/**
 * Read the `thermoworks.units` preference from VS Code settings.
 * Returns "auto" (default), "F", or "C".
 */
export function getUnitPreference(): UnitPreference {
	return vscode.workspace.getConfiguration("thermoworks").get<UnitPreference>("units", "auto");
}

/**
 * Apply the user's unit preference to a temperature value.
 * When preference is "auto", the value and unit are returned unchanged.
 * Otherwise the value is converted and the display unit is updated.
 */
export function applyUnitPreference(
	value: number,
	nativeUnit: TemperatureUnit,
	preference: UnitPreference,
): { value: number; unit: TemperatureUnit } {
	if (preference === "auto" || preference === nativeUnit) {
		return { value, unit: nativeUnit };
	}
	return { value: convertTemp(value, nativeUnit, preference), unit: preference };
}
