import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LowDataToggle } from "../src/components/LowDataToggle.tsx";
import {
	LOW_DATA_INTERVAL_MS,
	LOW_DATA_STORAGE_KEY,
	useLowDataMode,
} from "../src/hooks/useLowDataMode.ts";

describe("useLowDataMode", () => {
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

	it("defaults to disabled", () => {
		const { result } = renderHook(() => useLowDataMode());

		expect(result.current.isLowData).toBe(false);
	});

	it("restores enabled state from localStorage", () => {
		localStorageStore[LOW_DATA_STORAGE_KEY] = "true";

		const { result } = renderHook(() => useLowDataMode());

		expect(result.current.isLowData).toBe(true);
	});

	it("restores disabled state from localStorage", () => {
		localStorageStore[LOW_DATA_STORAGE_KEY] = "false";

		const { result } = renderHook(() => useLowDataMode());

		expect(result.current.isLowData).toBe(false);
	});

	it("toggles and persists to localStorage", () => {
		const { result } = renderHook(() => useLowDataMode());

		expect(result.current.isLowData).toBe(false);

		act(() => {
			result.current.toggleLowData();
		});

		expect(result.current.isLowData).toBe(true);
		expect(localStorageStore[LOW_DATA_STORAGE_KEY]).toBe("true");

		act(() => {
			result.current.toggleLowData();
		});

		expect(result.current.isLowData).toBe(false);
		expect(localStorageStore[LOW_DATA_STORAGE_KEY]).toBe("false");
	});

	it("setLowData explicitly enables and persists", () => {
		const { result } = renderHook(() => useLowDataMode());

		act(() => {
			result.current.setLowData(true);
		});

		expect(result.current.isLowData).toBe(true);
		expect(localStorageStore[LOW_DATA_STORAGE_KEY]).toBe("true");
	});

	it("setLowData explicitly disables and persists", () => {
		localStorageStore[LOW_DATA_STORAGE_KEY] = "true";
		const { result } = renderHook(() => useLowDataMode());

		expect(result.current.isLowData).toBe(true);

		act(() => {
			result.current.setLowData(false);
		});

		expect(result.current.isLowData).toBe(false);
		expect(localStorageStore[LOW_DATA_STORAGE_KEY]).toBe("false");
	});

	it("exports LOW_DATA_INTERVAL_MS as 60000", () => {
		expect(LOW_DATA_INTERVAL_MS).toBe(60_000);
	});
});

describe("LowDataToggle", () => {
	it("renders with aria-pressed false when inactive", () => {
		const onToggle = vi.fn();
		render(<LowDataToggle isLowData={false} onToggle={onToggle} />);

		const button = screen.getByRole("button", { name: "Toggle low-data mode" });
		expect(button).toBeInTheDocument();
		expect(button).toHaveAttribute("aria-pressed", "false");
	});

	it("renders with aria-pressed true when active", () => {
		const onToggle = vi.fn();
		render(<LowDataToggle isLowData={true} onToggle={onToggle} />);

		const button = screen.getByRole("button", { name: "Toggle low-data mode" });
		expect(button).toHaveAttribute("aria-pressed", "true");
	});

	it("calls onToggle when clicked", () => {
		const onToggle = vi.fn();
		render(<LowDataToggle isLowData={false} onToggle={onToggle} />);

		const button = screen.getByRole("button", { name: "Toggle low-data mode" });
		fireEvent.click(button);

		expect(onToggle).toHaveBeenCalledOnce();
	});

	it("shows descriptive title when inactive", () => {
		const onToggle = vi.fn();
		render(<LowDataToggle isLowData={false} onToggle={onToggle} />);

		const button = screen.getByRole("button", { name: "Toggle low-data mode" });
		expect(button).toHaveAttribute("title", "Enable low-data mode");
	});

	it("shows descriptive title when active", () => {
		const onToggle = vi.fn();
		render(<LowDataToggle isLowData={true} onToggle={onToggle} />);

		const button = screen.getByRole("button", { name: "Toggle low-data mode" });
		expect(button).toHaveAttribute("title", "Low-data mode is on (slower refresh)");
	});
});
