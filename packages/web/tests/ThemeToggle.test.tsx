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

		const btn = screen.getByRole("button", { name: /theme:.+click to switch/i });
		expect(btn).toBeInTheDocument();
	});

	it("defaults to dark theme when prefers-color-scheme is dark", () => {
		render(<ThemeToggle />);

		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.classList.contains("light")).toBe(false);
	});

	it("cycles from system to light on first click", () => {
		render(<ThemeToggle />);

		const btn = screen.getByRole("button", { name: /theme:.+click to switch/i });
		fireEvent.click(btn);

		expect(document.documentElement.classList.contains("light")).toBe(true);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
		expect(localStorageStore["thermoworks-theme"]).toBe("light");
	});

	it("cycles from light to dark on second click", () => {
		localStorageStore["thermoworks-theme"] = "light";
		render(<ThemeToggle />);

		const btn = screen.getByRole("button", { name: /theme:.+click to switch/i });
		fireEvent.click(btn);

		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.classList.contains("light")).toBe(false);
		expect(localStorageStore["thermoworks-theme"]).toBe("dark");
	});

	it("cycles from dark to system on third click", () => {
		localStorageStore["thermoworks-theme"] = "dark";
		render(<ThemeToggle />);

		const btn = screen.getByRole("button", { name: /theme:.+click to switch/i });
		fireEvent.click(btn);

		expect(localStorageStore["thermoworks-theme"]).toBe("system");
	});

	it("restores saved theme from localStorage", () => {
		localStorageStore["thermoworks-theme"] = "light";
		render(<ThemeToggle />);

		expect(document.documentElement.classList.contains("light")).toBe(true);
		expect(screen.getByRole("button", { name: /theme: light/i })).toBeInTheDocument();
	});
});
