import { useTemperatureUnit } from "../hooks/useTemperatureUnit.ts";
import { cn } from "../lib/utils.ts";

export function UnitToggle() {
	const { unit, toggleUnit } = useTemperatureUnit();
	const nextUnit = unit === "F" ? "C" : "F";

	return (
		<button
			type="button"
			onClick={toggleUnit}
			title={`Switch to °${nextUnit}`}
			aria-label={`Switch to °${nextUnit}`}
			className={cn(
				"inline-flex h-9 w-9 items-center justify-center rounded-md",
				"border border-border hover:bg-muted",
				"text-sm font-medium",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
			)}
		>
			°{unit}
		</button>
	);
}
