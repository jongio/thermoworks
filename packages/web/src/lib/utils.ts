import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

/** Convert a Fahrenheit value to Celsius. */
export function toCelsius(f: number): number {
	return ((f - 32) * 5) / 9;
}

/** Convert a Celsius value to Fahrenheit. */
export function toFahrenheit(c: number): number {
	return (c * 9) / 5 + 32;
}

/** Format a temperature value to one decimal place. */
export function formatTemp(value: number | null | undefined): string {
	if (value == null) return "--";
	return value.toFixed(1);
}
