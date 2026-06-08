import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";

export type TemperatureUnit = "F" | "C";

const STORAGE_KEY = "thermoworks-unit";

function getInitialUnit(): TemperatureUnit {
	if (typeof window === "undefined") return "F";
	const stored = window.localStorage.getItem(STORAGE_KEY);
	if (stored === "F" || stored === "C") return stored;
	return "F";
}

export interface TemperatureUnitContextValue {
	unit: TemperatureUnit;
	toggleUnit: () => void;
	convert: (value: number, fromUnit: string) => number;
	formatTemp: (value: number, fromUnit: string) => string;
}

export const TemperatureUnitContext = createContext<TemperatureUnitContextValue | null>(null);

export function TemperatureUnitProvider({ children }: { children: ReactNode }) {
	const [unit, setUnit] = useState<TemperatureUnit>(getInitialUnit);

	useEffect(() => {
		window.localStorage.setItem(STORAGE_KEY, unit);
	}, [unit]);

	const toggleUnit = useCallback(() => {
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
		<TemperatureUnitContext.Provider value={{ unit, toggleUnit, convert, formatTemp }}>
			{children}
		</TemperatureUnitContext.Provider>
	);
}
