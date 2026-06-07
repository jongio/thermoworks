import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "../src/components/ThemeToggle.tsx";

describe("ThemeToggle", () => {
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
		vi.stubGlobal("matchMedia", (query: string) => ({
			matches: query === "(prefers-color-scheme: dark)",
			media: query,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		}));
		// Reset classes on documentElement
		document.documentElement.classList.remove("light", "dark");
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		document.documentElement.classList.remove("light", "dark");
	});

	it("renders the toggle button", () => {
		render(<ThemeToggle />);

		const btn = screen.getByRole("button", { name: /switch to .+ theme/i });
		expect(btn).toBeInTheDocument();
	});

	it("defaults to dark theme when prefers-color-scheme is dark", () => {
		render(<ThemeToggle />);

		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.classList.contains("light")).toBe(false);
	});

	it("toggles to light theme on click", () => {
		render(<ThemeToggle />);

		const btn = screen.getByRole("button", { name: /switch to light theme/i });
		fireEvent.click(btn);

		expect(document.documentElement.classList.contains("light")).toBe(true);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("toggles back to dark theme on second click", () => {
		render(<ThemeToggle />);

		const btn = screen.getByRole("button", { name: /switch to light theme/i });
		fireEvent.click(btn);

		const btnAfter = screen.getByRole("button", { name: /switch to dark theme/i });
		fireEvent.click(btnAfter);

		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.classList.contains("light")).toBe(false);
	});

	it("persists theme choice to localStorage", () => {
		render(<ThemeToggle />);

		const btn = screen.getByRole("button", { name: /switch to light theme/i });
		fireEvent.click(btn);

		expect(localStorageStore["thermoworks-theme"]).toBe("light");
	});

	it("restores saved theme from localStorage", () => {
		localStorageStore["thermoworks-theme"] = "light";
		render(<ThemeToggle />);

		expect(document.documentElement.classList.contains("light")).toBe(true);
		expect(screen.getByRole("button", { name: /switch to dark theme/i })).toBeInTheDocument();
	});
});
