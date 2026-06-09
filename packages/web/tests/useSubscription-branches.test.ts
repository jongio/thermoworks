import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSubscription } from "../src/hooks/useSubscription.ts";

describe("useSubscription - branch coverage", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	it("reports isStreaming=false when enabled=false even in stream mode", () => {
		const { result } = renderHook(() => useSubscription({ enabled: false }));

		expect(result.current.mode).toBe("stream");
		expect(result.current.isStreaming).toBe(false);
		expect(result.current.intervalMs).toBe(2_000);
	});

	it("reports isStreaming=true only when enabled=true AND mode=stream", () => {
		const { result } = renderHook(() => useSubscription({ enabled: true }));

		expect(result.current.isStreaming).toBe(true);

		act(() => {
			result.current.switchMode("poll");
		});

		expect(result.current.isStreaming).toBe(false);
	});

	it("handles localStorage getItem throwing (e.g., SSR/private browsing)", () => {
		const originalGetItem = localStorage.getItem.bind(localStorage);
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("SecurityError: access denied");
		});

		const { result } = renderHook(() => useSubscription({ enabled: true }));

		// Should fallback to "stream" default
		expect(result.current.mode).toBe("stream");

		vi.mocked(Storage.prototype.getItem).mockImplementation(originalGetItem);
	});

	it("handles localStorage setItem throwing (write failure)", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("QuotaExceededError");
		});

		const { result } = renderHook(() => useSubscription({ enabled: true }));

		// Should still update in-memory mode even if persist fails
		act(() => {
			result.current.switchMode("poll");
		});

		expect(result.current.mode).toBe("poll");

		vi.mocked(Storage.prototype.setItem).mockRestore();
	});

	it("responds to cross-tab storage events", () => {
		const { result } = renderHook(() => useSubscription({ enabled: true }));
		expect(result.current.mode).toBe("stream");

		// Simulate a storage event from another tab
		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: "thermoworks-streaming-mode",
					newValue: "poll",
				}),
			);
		});

		expect(result.current.mode).toBe("poll");
	});

	it("ignores storage events with invalid values", () => {
		const { result } = renderHook(() => useSubscription({ enabled: true }));
		expect(result.current.mode).toBe("stream");

		// Simulate storage event with invalid value
		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: "thermoworks-streaming-mode",
					newValue: "invalid",
				}),
			);
		});

		// Mode should not change
		expect(result.current.mode).toBe("stream");
	});

	it("ignores storage events for other keys", () => {
		const { result } = renderHook(() => useSubscription({ enabled: true }));
		expect(result.current.mode).toBe("stream");

		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: "other-key",
					newValue: "poll",
				}),
			);
		});

		expect(result.current.mode).toBe("stream");
	});

	it("cleans up storage event listener on unmount", () => {
		const removeEventListener = vi.spyOn(window, "removeEventListener");

		const { unmount } = renderHook(() => useSubscription({ enabled: true }));

		unmount();

		expect(removeEventListener).toHaveBeenCalledWith("storage", expect.any(Function));
		removeEventListener.mockRestore();
	});

	it("handles null newValue in storage event gracefully", () => {
		const { result } = renderHook(() => useSubscription({ enabled: true }));

		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: "thermoworks-streaming-mode",
					newValue: null,
				}),
			);
		});

		// Should not change mode
		expect(result.current.mode).toBe("stream");
	});

	it("syncs storage event back to stream", () => {
		localStorage.setItem("thermoworks-streaming-mode", "poll");

		const { result } = renderHook(() => useSubscription({ enabled: true }));
		expect(result.current.mode).toBe("poll");

		act(() => {
			window.dispatchEvent(
				new StorageEvent("storage", {
					key: "thermoworks-streaming-mode",
					newValue: "stream",
				}),
			);
		});

		expect(result.current.mode).toBe("stream");
	});
});
