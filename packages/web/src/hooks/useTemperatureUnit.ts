import { useContext } from "react";
import {
	TemperatureUnitContext,
	type TemperatureUnitContextValue,
} from "../context/TemperatureUnitContext.tsx";

/**
 * Access the global temperature unit preference.
 * Must be used within a TemperatureUnitProvider.
 */
export function useTemperatureUnit(): TemperatureUnitContextValue {
	const context = useContext(TemperatureUnitContext);
	if (context === null) {
		throw new Error("useTemperatureUnit must be used within a TemperatureUnitProvider");
	}
	return context;
}
