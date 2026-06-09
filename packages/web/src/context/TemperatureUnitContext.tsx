import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";

export type TemperatureUnit = "F" | "C";

export const TEMPERATURE_UNIT_STORAGE_KEY = "thermoworks-unit";
const LEGACY_STORAGE_KEY = "thermoworks-temp-unit";

function parseStoredUnit(value: string | null): TemperatureUnit | null {
	if (value === "F" || value === "C") return value;
	return null;
}

export function getStoredTemperatureUnit(): TemperatureUnit | null {
	if (typeof window === "undefined") return null;

	return (
		parseStoredUnit(window.localStorage.getItem(TEMPERATURE_UNIT_STORAGE_KEY)) ??
		parseStoredUnit(window.localStorage.getItem(LEGACY_STORAGE_KEY))
	);
}

export function hasStoredTemperatureUnitPreference(): boolean {
	return getStoredTemperatureUnit() !== null;
}

function getInitialUnit(): TemperatureUnit {
	return getStoredTemperatureUnit() ?? "F";
}

export interface TemperatureUnitContextValue {
	unit: TemperatureUnit;
	setUnit: (unit: TemperatureUnit) => void;
	toggleUnit: () => void;
	convert: (value: number, fromUnit: string) => number;
	formatTemp: (value: number, fromUnit: string) => string;
}

export const TemperatureUnitContext = createContext<TemperatureUnitContextValue | null>(null);

export function TemperatureUnitProvider({ children }: { children: ReactNode }) {
	const [unit, setUnit] = useState<TemperatureUnit>(getInitialUnit);
	const [hasExplicitPreference, setHasExplicitPreference] = useState(hasStoredTemperatureUnitPreference);

	const updateUnit = useCallback((nextUnit: TemperatureUnit) => {
		setHasExplicitPreference(true);
		setUnit(nextUnit);
	}, []);

	useEffect(() => {
		if (!hasExplicitPreference) return;
		window.localStorage.setItem(TEMPERATURE_UNIT_STORAGE_KEY, unit);
		window.localStorage.removeItem(LEGACY_STORAGE_KEY);
	}, [hasExplicitPreference, unit]);

	const toggleUnit = useCallback(() => {
		setHasExplicitPreference(true);
		setUnit((prev) => (prev === "F" ? "C" : "F"));
	}, []);

	const convert = useCallback(
		(value: number, fromUnit: string): number => {
			const normalizedFrom = fromUnit.toUpperCase();
			if (normalizedFrom === unit) return value;
			if (unit === "C") return (value - 32) * 5 / 9;
			return value * 9 / 5 + 32;
		},
		[unit],
	);

	const formatTemp = useCallback(
		(value: number, fromUnit: string): string => {
			const converted = convert(value, fromUnit);
			return `${converted.toFixed(1)}°${unit}`;
		},
		[convert, unit],
	);

	return (
		<TemperatureUnitContext.Provider value={{ unit, setUnit: updateUnit, toggleUnit, convert, formatTemp }}>
			{children}
		</TemperatureUnitContext.Provider>
	);
}
