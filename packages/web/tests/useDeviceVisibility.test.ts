import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeviceVisibility } from "../src/hooks/useDeviceVisibility.ts";

const FAVORITES_KEY = "thermoworks-device-favorites";
const HIDDEN_KEY = "thermoworks-device-hidden";

describe("useDeviceVisibility", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it("starts with empty favorites and hidden sets", () => {
		const { result } = renderHook(() => useDeviceVisibility());
		expect(result.current.favorites.size).toBe(0);
		expect(result.current.hiddenSerials.size).toBe(0);
		expect(result.current.showHidden).toBe(false);
	});

	it("toggleFavorite adds a device to favorites and persists to localStorage", () => {
		const { result } = renderHook(() => useDeviceVisibility());

		act(() => {
			result.current.toggleFavorite("SN001");
		});

		expect(result.current.isFavorite("SN001")).toBe(true);
		expect(result.current.favorites.size).toBe(1);

		const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY)!);
		expect(stored).toContain("SN001");
	});

	it("toggleFavorite removes a favorited device", () => {
		const { result } = renderHook(() => useDeviceVisibility());

		act(() => {
			result.current.toggleFavorite("SN001");
		});
		expect(result.current.isFavorite("SN001")).toBe(true);

		act(() => {
			result.current.toggleFavorite("SN001");
		});
		expect(result.current.isFavorite("SN001")).toBe(false);
		expect(result.current.favorites.size).toBe(0);
	});

	it("toggleHidden adds a device to hidden set and persists to localStorage", () => {
		const { result } = renderHook(() => useDeviceVisibility());

		act(() => {
			result.current.toggleHidden("SN002");
		});

		expect(result.current.isHidden("SN002")).toBe(true);
		expect(result.current.hiddenSerials.size).toBe(1);

		const stored = JSON.parse(localStorage.getItem(HIDDEN_KEY)!);
		expect(stored).toContain("SN002");
	});

	it("toggleHidden removes a hidden device (unhide)", () => {
		const { result } = renderHook(() => useDeviceVisibility());

		act(() => {
			result.current.toggleHidden("SN002");
		});
		expect(result.current.isHidden("SN002")).toBe(true);

		act(() => {
			result.current.toggleHidden("SN002");
		});
		expect(result.current.isHidden("SN002")).toBe(false);
		expect(result.current.hiddenSerials.size).toBe(0);
	});

	it("hiding a favorited device removes it from favorites", () => {
		const { result } = renderHook(() => useDeviceVisibility());

		act(() => {
			result.current.toggleFavorite("SN001");
		});
		expect(result.current.isFavorite("SN001")).toBe(true);

		act(() => {
			result.current.toggleHidden("SN001");
		});

		expect(result.current.isHidden("SN001")).toBe(true);
		expect(result.current.isFavorite("SN001")).toBe(false);

		// Verify localStorage reflects the mutual exclusion
		const favs = JSON.parse(localStorage.getItem(FAVORITES_KEY)!);
		expect(favs).not.toContain("SN001");
	});

	it("favoriting a hidden device removes it from hidden", () => {
		const { result } = renderHook(() => useDeviceVisibility());

		act(() => {
			result.current.toggleHidden("SN001");
		});
		expect(result.current.isHidden("SN001")).toBe(true);

		act(() => {
			result.current.toggleFavorite("SN001");
		});

		expect(result.current.isFavorite("SN001")).toBe(true);
		expect(result.current.isHidden("SN001")).toBe(false);

		// Verify localStorage reflects the mutual exclusion
		const hidden = JSON.parse(localStorage.getItem(HIDDEN_KEY)!);
		expect(hidden).not.toContain("SN001");
	});

	it("restores favorites from localStorage on mount", () => {
		localStorage.setItem(FAVORITES_KEY, JSON.stringify(["SN001", "SN002"]));

		const { result } = renderHook(() => useDeviceVisibility());

		expect(result.current.isFavorite("SN001")).toBe(true);
		expect(result.current.isFavorite("SN002")).toBe(true);
		expect(result.current.isFavorite("SN003")).toBe(false);
		expect(result.current.favorites.size).toBe(2);
	});

	it("restores hidden serials from localStorage on mount", () => {
		localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SN003"]));

		const { result } = renderHook(() => useDeviceVisibility());

		expect(result.current.isHidden("SN003")).toBe(true);
		expect(result.current.isHidden("SN001")).toBe(false);
		expect(result.current.hiddenSerials.size).toBe(1);
	});

	it("handles corrupt localStorage for favorites gracefully", () => {
		localStorage.setItem(FAVORITES_KEY, "not-valid-json{{{");

		const { result } = renderHook(() => useDeviceVisibility());

		expect(result.current.favorites.size).toBe(0);
	});

	it("handles corrupt localStorage for hidden serials gracefully", () => {
		localStorage.setItem(HIDDEN_KEY, "also-broken");

		const { result } = renderHook(() => useDeviceVisibility());

		expect(result.current.hiddenSerials.size).toBe(0);
	});

	it("handles non-array localStorage value gracefully", () => {
		localStorage.setItem(FAVORITES_KEY, JSON.stringify({ invalid: true }));
		localStorage.setItem(HIDDEN_KEY, JSON.stringify(42));

		const { result } = renderHook(() => useDeviceVisibility());

		expect(result.current.favorites.size).toBe(0);
		expect(result.current.hiddenSerials.size).toBe(0);
	});

	it("handles array with non-string elements gracefully", () => {
		localStorage.setItem(FAVORITES_KEY, JSON.stringify([1, 2, 3]));

		const { result } = renderHook(() => useDeviceVisibility());

		expect(result.current.favorites.size).toBe(0);
	});

	it("handles localStorage write failure gracefully", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("QuotaExceededError");
		});

		const { result } = renderHook(() => useDeviceVisibility());

		// Should not throw
		act(() => {
			result.current.toggleFavorite("SN001");
		});

		act(() => {
			result.current.toggleHidden("SN002");
		});
	});

	it("setShowHidden toggles the showHidden state", () => {
		const { result } = renderHook(() => useDeviceVisibility());

		expect(result.current.showHidden).toBe(false);

		act(() => {
			result.current.setShowHidden(true);
		});
		expect(result.current.showHidden).toBe(true);

		act(() => {
			result.current.setShowHidden(false);
		});
		expect(result.current.showHidden).toBe(false);
	});

	it("supports multiple favorites simultaneously", () => {
		const { result } = renderHook(() => useDeviceVisibility());

		act(() => {
			result.current.toggleFavorite("SN001");
		});
		act(() => {
			result.current.toggleFavorite("SN002");
		});
		act(() => {
			result.current.toggleFavorite("SN003");
		});

		expect(result.current.isFavorite("SN001")).toBe(true);
		expect(result.current.isFavorite("SN002")).toBe(true);
		expect(result.current.isFavorite("SN003")).toBe(true);
		expect(result.current.favorites.size).toBe(3);
	});

	it("supports multiple hidden devices simultaneously", () => {
		const { result } = renderHook(() => useDeviceVisibility());

		act(() => {
			result.current.toggleHidden("SN001");
		});
		act(() => {
			result.current.toggleHidden("SN002");
		});

		expect(result.current.isHidden("SN001")).toBe(true);
		expect(result.current.isHidden("SN002")).toBe(true);
		expect(result.current.hiddenSerials.size).toBe(2);
	});

	it("preferences survive re-render (simulating page navigation)", () => {
		localStorage.setItem(FAVORITES_KEY, JSON.stringify(["SN001"]));
		localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SN002"]));

		const { result, rerender } = renderHook(() => useDeviceVisibility());

		expect(result.current.isFavorite("SN001")).toBe(true);
		expect(result.current.isHidden("SN002")).toBe(true);

		rerender();

		expect(result.current.isFavorite("SN001")).toBe(true);
		expect(result.current.isHidden("SN002")).toBe(true);
	});
});
