import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshSelector } from "../src/components/RefreshSelector.tsx";
import { useRefreshInterval } from "../src/hooks/useRefreshInterval.ts";

describe("useRefreshInterval", () => {
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

	it("returns default interval of 10000ms", () => {
		const { result } = renderHook(() => useRefreshInterval());

		expect(result.current.interval).toBe(10_000);
	});

	it("exposes all interval options", () => {
		const { result } = renderHook(() => useRefreshInterval());

		expect(result.current.options).toEqual([5_000, 10_000, 30_000, 60_000]);
	});

	it("updates interval and persists to localStorage", () => {
		const { result } = renderHook(() => useRefreshInterval());

		act(() => {
			result.current.updateInterval(30_000);
		});

		expect(result.current.interval).toBe(30_000);
		expect(localStorageStore["thermoworks-refresh-interval"]).toBe("30000");
	});

	it("restores saved interval from localStorage", () => {
		localStorageStore["thermoworks-refresh-interval"] = "5000";

		const { result } = renderHook(() => useRefreshInterval());

		expect(result.current.interval).toBe(5_000);
	});

	it("falls back to default for invalid localStorage value", () => {
		localStorageStore["thermoworks-refresh-interval"] = "9999";

		const { result } = renderHook(() => useRefreshInterval());

		expect(result.current.interval).toBe(10_000);
	});
});

describe("RefreshSelector", () => {
	const options = [5_000, 10_000, 30_000, 60_000] as const;

	it("renders all interval options", () => {
		const onChange = vi.fn();
		render(<RefreshSelector interval={10_000} options={options} onIntervalChange={onChange} />);

		const select = screen.getByLabelText("Refresh interval");
		expect(select).toBeInTheDocument();

		const optionElements = screen.getAllByRole("option");
		expect(optionElements).toHaveLength(4);
		expect(optionElements[0]).toHaveTextContent("5s");
		expect(optionElements[1]).toHaveTextContent("10s");
		expect(optionElements[2]).toHaveTextContent("30s");
		expect(optionElements[3]).toHaveTextContent("1m");
	});

	it("shows current selection", () => {
		const onChange = vi.fn();
		render(<RefreshSelector interval={30_000} options={options} onIntervalChange={onChange} />);

		const select = screen.getByLabelText("Refresh interval") as HTMLSelectElement;
		expect(select.value).toBe("30000");
	});

	it("calls onIntervalChange when selection changes", () => {
		const onChange = vi.fn();
		render(<RefreshSelector interval={10_000} options={options} onIntervalChange={onChange} />);

		const select = screen.getByLabelText("Refresh interval");
		fireEvent.change(select, { target: { value: "60000" } });

		expect(onChange).toHaveBeenCalledWith(60_000);
	});
});
