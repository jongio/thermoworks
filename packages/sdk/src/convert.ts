/** Convert a temperature from Celsius to Fahrenheit, rounded to 1 decimal place. */
export function toFahrenheit(celsius: number): number {
	return Math.round(((celsius * 9) / 5 + 32) * 10) / 10;
}

/** Convert a temperature from Fahrenheit to Celsius, rounded to 1 decimal place. */
export function toCelsius(fahrenheit: number): number {
	return Math.round((((fahrenheit - 32) * 5) / 9) * 10) / 10;
}
