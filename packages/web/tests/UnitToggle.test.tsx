import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnitToggle } from "../src/components/UnitToggle.tsx";
import { TemperatureUnitProvider } from "../src/context/TemperatureUnitContext.tsx";

function renderWithProvider() {
	return render(
		<TemperatureUnitProvider>
			<UnitToggle />
		</TemperatureUnitProvider>,
	);
}

describe("UnitToggle", () => {
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

	it("renders with default unit F", () => {
		renderWithProvider();

		const btn = screen.getByRole("button", { name: /switch to °C/i });
		expect(btn).toBeInTheDocument();
		expect(btn).toHaveTextContent("°F");
	});

	it("toggles to Celsius on click", () => {
		renderWithProvider();

		const btn = screen.getByRole("button", { name: /switch to °C/i });
		fireEvent.click(btn);

		const updated = screen.getByRole("button", { name: /switch to °F/i });
		expect(updated).toHaveTextContent("°C");
	});

	it("toggles back to Fahrenheit on second click", () => {
		renderWithProvider();

		const btn = screen.getByRole("button", { name: /switch to °C/i });
		fireEvent.click(btn);

		const celsiusBtn = screen.getByRole("button", { name: /switch to °F/i });
		fireEvent.click(celsiusBtn);

		const finalBtn = screen.getByRole("button", { name: /switch to °C/i });
		expect(finalBtn).toHaveTextContent("°F");
	});

	it("persists choice to localStorage", () => {
		renderWithProvider();

		const btn = screen.getByRole("button", { name: /switch to °C/i });
		fireEvent.click(btn);

		expect(localStorageStore["thermoworks-unit"]).toBe("C");
	});

	it("restores saved unit from localStorage", () => {
		localStorageStore["thermoworks-unit"] = "C";
		renderWithProvider();

		const btn = screen.getByRole("button", { name: /switch to °F/i });
		expect(btn).toHaveTextContent("°C");
	});
});
