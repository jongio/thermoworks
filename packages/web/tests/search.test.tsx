import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchBar } from "../src/components/SearchBar.tsx";
import { useSearch } from "../src/hooks/useSearch.ts";

// ─── useSearch hook tests ────────────────────────────────────────────────────

interface Item {
	name: string;
	tag: string;
}

const items: Item[] = [
	{ name: "Kitchen Probe", tag: "thermaq" },
	{ name: "Smoker", tag: "signals" },
	{ name: "Outdoor Grill", tag: "thermaq" },
];

function matchItem(item: Item, query: string): boolean {
	return item.name.toLowerCase().includes(query) || item.tag.toLowerCase().includes(query);
}

describe("useSearch", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns all items when query is empty", () => {
		const { result } = renderHook(() => useSearch(items, matchItem));

		expect(result.current.results).toEqual(items);
		expect(result.current.isFiltering).toBe(false);
	});

	it("filters items after debounce delay", async () => {
		const { result } = renderHook(() => useSearch(items, matchItem));

		act(() => {
			result.current.setQuery("smoker");
		});

		// Before debounce - still shows all items
		expect(result.current.results).toEqual(items);

		// After debounce (300ms)
		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		expect(result.current.results).toEqual([{ name: "Smoker", tag: "signals" }]);
		expect(result.current.isFiltering).toBe(true);
	});

	it("matches case-insensitively", async () => {
		const { result } = renderHook(() => useSearch(items, matchItem));

		act(() => {
			result.current.setQuery("KITCHEN");
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		expect(result.current.results).toHaveLength(1);
		expect(result.current.results[0].name).toBe("Kitchen Probe");
	});

	it("matches by tag field", async () => {
		const { result } = renderHook(() => useSearch(items, matchItem));

		act(() => {
			result.current.setQuery("signals");
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		expect(result.current.results).toEqual([{ name: "Smoker", tag: "signals" }]);
	});

	it("returns all items when query is whitespace-only", async () => {
		const { result } = renderHook(() => useSearch(items, matchItem));

		act(() => {
			result.current.setQuery("   ");
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		expect(result.current.results).toEqual(items);
		expect(result.current.isFiltering).toBe(false);
	});

	it("returns empty array when no items match", async () => {
		const { result } = renderHook(() => useSearch(items, matchItem));

		act(() => {
			result.current.setQuery("nonexistent");
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		expect(result.current.results).toEqual([]);
		expect(result.current.isFiltering).toBe(true);
	});

	it("debounces rapid query changes", async () => {
		const { result } = renderHook(() => useSearch(items, matchItem));

		act(() => {
			result.current.setQuery("s");
		});

		// Advance 100ms (within debounce window)
		await act(async () => {
			await vi.advanceTimersByTimeAsync(100);
		});

		act(() => {
			result.current.setQuery("sm");
		});

		// Advance another 100ms
		await act(async () => {
			await vi.advanceTimersByTimeAsync(100);
		});

		act(() => {
			result.current.setQuery("smo");
		});

		// Still showing all items (debounce not elapsed for any query)
		expect(result.current.results).toEqual(items);

		// Now let the final debounce fire
		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		expect(result.current.results).toEqual([{ name: "Smoker", tag: "signals" }]);
	});

	it("updates results when items change", async () => {
		const { result, rerender } = renderHook(({ list }) => useSearch(list, matchItem), {
			initialProps: { list: items },
		});

		act(() => {
			result.current.setQuery("smoker");
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});

		expect(result.current.results).toHaveLength(1);

		// Remove all items
		rerender({ list: [] });

		expect(result.current.results).toEqual([]);
	});
});

// ─── SearchBar component tests ──────────────────────────────────────────────

describe("SearchBar", () => {
	it("renders input with placeholder", () => {
		render(<SearchBar value="" onChange={vi.fn()} />);

		expect(screen.getByPlaceholderText("Search devices...")).toBeInTheDocument();
	});

	it("renders custom placeholder", () => {
		render(<SearchBar value="" onChange={vi.fn()} placeholder="Find thermometers..." />);

		expect(screen.getByPlaceholderText("Find thermometers...")).toBeInTheDocument();
	});

	it("calls onChange when typing", () => {
		const onChange = vi.fn();
		render(<SearchBar value="" onChange={onChange} />);

		fireEvent.change(screen.getByRole("searchbox"), { target: { value: "probe" } });

		expect(onChange).toHaveBeenCalledWith("probe");
	});

	it("shows clear button when value is present", () => {
		render(<SearchBar value="test" onChange={vi.fn()} />);

		expect(screen.getByLabelText("Clear search")).toBeInTheDocument();
	});

	it("hides clear button when value is empty", () => {
		render(<SearchBar value="" onChange={vi.fn()} />);

		expect(screen.queryByLabelText("Clear search")).not.toBeInTheDocument();
	});

	it("calls onChange with empty string when clear is clicked", () => {
		const onChange = vi.fn();
		render(<SearchBar value="test" onChange={onChange} />);

		fireEvent.click(screen.getByLabelText("Clear search"));

		expect(onChange).toHaveBeenCalledWith("");
	});

	it("focuses input on Ctrl+K", () => {
		render(<SearchBar value="" onChange={vi.fn()} />);

		const input = screen.getByRole("searchbox");
		fireEvent.keyDown(document, { key: "k", ctrlKey: true });

		expect(document.activeElement).toBe(input);
	});

	it("focuses input on Meta+K (Cmd+K)", () => {
		render(<SearchBar value="" onChange={vi.fn()} />);

		const input = screen.getByRole("searchbox");
		fireEvent.keyDown(document, { key: "k", metaKey: true });

		expect(document.activeElement).toBe(input);
	});

	it("does not focus on plain K press", () => {
		render(<SearchBar value="" onChange={vi.fn()} />);

		const input = screen.getByRole("searchbox");
		input.blur();
		fireEvent.keyDown(document, { key: "k" });

		expect(document.activeElement).not.toBe(input);
	});
});
