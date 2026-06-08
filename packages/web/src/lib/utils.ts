import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

/** Format a temperature value to one decimal place. */
export function formatTemp(value: number | null | undefined): string {
	if (value == null) return "--";
	return value.toFixed(1);
}
