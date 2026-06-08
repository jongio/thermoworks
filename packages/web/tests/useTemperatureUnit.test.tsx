import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TemperatureUnitProvider } from "../src/context/TemperatureUnitContext.tsx";
import { useTemperatureUnit } from "../src/hooks/useTemperatureUnit.ts";

function createWrapper() {
	return function Wrapper({ children }: { children: ReactNode }) {
		return <TemperatureUnitProvider>{children}</TemperatureUnitProvider>;
	};
}

describe("useTemperatureUnit", () => {
	let localStorageStore: Record<string, string>;

	beforeEach(() => {
		localStorageStore = {};
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => localStorageStore[key] ?? null,
			setItem: (key: string, value: string) => {
				localStorageStore[key] = value;
			},
			removeItem: (key: string) => {
				delete localStorageStore[key];
			},
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("throws when used outside provider", () => {
		expect(() => {
			renderHook(() => useTemperatureUnit());
		}).toThrow("useTemperatureUnit must be used within a TemperatureUnitProvider");
	});

	it("defaults to Fahrenheit", () => {
		const { result } = renderHook(() => useTemperatureUnit(), {
			wrapper: createWrapper(),
		});

		expect(result.current.unit).toBe("F");
	});

	it("toggles to Celsius", () => {
		const { result } = renderHook(() => useTemperatureUnit(), {
			wrapper: createWrapper(),
		});

		act(() => {
			result.current.toggleUnit();
		});

		expect(result.current.unit).toBe("C");
	});

	it("toggles back to Fahrenheit", () => {
		const { result } = renderHook(() => useTemperatureUnit(), {
			wrapper: createWrapper(),
		});

		act(() => {
			result.current.toggleUnit();
		});
		act(() => {
			result.current.toggleUnit();
		});

		expect(result.current.unit).toBe("F");
	});

	it("persists unit to localStorage", () => {
		const { result } = renderHook(() => useTemperatureUnit(), {
			wrapper: createWrapper(),
		});

		act(() => {
			result.current.toggleUnit();
		});

		expect(localStorageStore["thermoworks-unit"]).toBe("C");
	});

	it("restores saved unit from localStorage", () => {
		localStorageStore["thermoworks-unit"] = "C";

		const { result } = renderHook(() => useTemperatureUnit(), {
			wrapper: createWrapper(),
		});

		expect(result.current.unit).toBe("C");
	});

	describe("convert", () => {
		it("returns value unchanged when source matches display unit", () => {
			const { result } = renderHook(() => useTemperatureUnit(), {
				wrapper: createWrapper(),
			});

			// Default is F, source is F — no conversion
			expect(result.current.convert(72, "F")).toBeCloseTo(72, 5);
		});

		it("converts F to C when display unit is C", () => {
			localStorageStore["thermoworks-unit"] = "C";
			const { result } = renderHook(() => useTemperatureUnit(), {
				wrapper: createWrapper(),
			});

			expect(result.current.convert(212, "F")).toBeCloseTo(100, 5);
		});

		it("converts C to F when display unit is F", () => {
			const { result } = renderHook(() => useTemperatureUnit(), {
				wrapper: createWrapper(),
			});

			expect(result.current.convert(100, "C")).toBeCloseTo(212, 5);
		});

		it("handles case-insensitive source unit", () => {
			localStorageStore["thermoworks-unit"] = "C";
			const { result } = renderHook(() => useTemperatureUnit(), {
				wrapper: createWrapper(),
			});

			expect(result.current.convert(32, "f")).toBeCloseTo(0, 5);
		});
	});

	describe("formatTemp", () => {
		it("formats with unit suffix when no conversion needed", () => {
			const { result } = renderHook(() => useTemperatureUnit(), {
				wrapper: createWrapper(),
			});

			expect(result.current.formatTemp(72.5, "F")).toBe("72.5°F");
		});

		it("formats with conversion and unit suffix", () => {
			localStorageStore["thermoworks-unit"] = "C";
			const { result } = renderHook(() => useTemperatureUnit(), {
				wrapper: createWrapper(),
			});

			expect(result.current.formatTemp(32, "F")).toBe("0.0°C");
		});

		it("formats to one decimal place", () => {
			localStorageStore["thermoworks-unit"] = "C";
			const { result } = renderHook(() => useTemperatureUnit(), {
				wrapper: createWrapper(),
			});

			expect(result.current.formatTemp(72, "F")).toBe("22.2°C");
		});
	});
});
