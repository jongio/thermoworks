import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSubscription } from "../src/hooks/useSubscription.ts";

describe("useSubscription", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
	});

	it("defaults to stream mode when no persisted value", () => {
		const { result } = renderHook(() => useSubscription({ enabled: true }));

		expect(result.current.mode).toBe("stream");
		expect(result.current.isStreaming).toBe(true);
		expect(result.current.intervalMs).toBe(2_000);
	});

	it("reads persisted mode from localStorage", () => {
		localStorage.setItem("thermoworks-streaming-mode", "poll");

		const { result } = renderHook(() => useSubscription({ enabled: true }));

		expect(result.current.mode).toBe("poll");
		expect(result.current.isStreaming).toBe(false);
		expect(result.current.intervalMs).toBe(10_000);
	});

	it("toggles between stream and poll modes", () => {
		const { result } = renderHook(() => useSubscription({ enabled: true }));

		expect(result.current.mode).toBe("stream");

		act(() => {
			result.current.toggleMode();
		});

		expect(result.current.mode).toBe("poll");
		expect(result.current.intervalMs).toBe(10_000);
		expect(localStorage.getItem("thermoworks-streaming-mode")).toBe("poll");

		act(() => {
			result.current.toggleMode();
		});

		expect(result.current.mode).toBe("stream");
		expect(result.current.intervalMs).toBe(2_000);
		expect(localStorage.getItem("thermoworks-streaming-mode")).toBe("stream");
	});

	it("switchMode sets a specific mode", () => {
		const { result } = renderHook(() => useSubscription({ enabled: true }));

		act(() => {
			result.current.switchMode("poll");
		});

		expect(result.current.mode).toBe("poll");
		expect(localStorage.getItem("thermoworks-streaming-mode")).toBe("poll");
	});

	it("reports isStreaming false when disabled", () => {
		const { result } = renderHook(() => useSubscription({ enabled: false }));

		expect(result.current.mode).toBe("stream");
		expect(result.current.isStreaming).toBe(false);
	});

	it("handles invalid localStorage values gracefully", () => {
		localStorage.setItem("thermoworks-streaming-mode", "invalid_value");

		const { result } = renderHook(() => useSubscription({ enabled: true }));

		expect(result.current.mode).toBe("stream");
	});
});
