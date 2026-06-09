import { act, renderHook } from "@testing-library/react";
import type { EventFilter } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEvents } from "../src/hooks/useEvents.ts";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

function createMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		getDevicesWithChannels: vi.fn().mockResolvedValue([]),
		getEvents: vi.fn().mockResolvedValue([]),
		login: vi.fn(),
		logout: vi.fn(),
		getUser: vi.fn(),
		getDevices: vi.fn(),
		getDeviceChannel: vi.fn(),
		getAllDeviceChannels: vi.fn(),
		getArchives: vi.fn(),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

describe("useEvents - branch coverage", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not fetch when client.isAuthenticated is false", async () => {
		const getEvents = vi.fn().mockResolvedValue([]);
		const client = createMockClient({
			isAuthenticated: false,
			getEvents,
		} as unknown as Partial<ThermoworksWebClient>);

		const { result } = renderHook(() => useEvents(client));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(getEvents).not.toHaveBeenCalled();
		expect(result.current.data).toEqual([]);
		expect(result.current.error).toBeNull();
		expect(result.current.lastUpdated).toBeNull();
	});

	it("clears state when client becomes unauthenticated", async () => {
		const getEvents = vi.fn().mockResolvedValue([{ id: "e1" }]);
		const client = createMockClient({ getEvents });

		const { result, rerender } = renderHook(({ c, f }) => useEvents(c, f), {
			initialProps: {
				c: client as ThermoworksWebClient | null,
				f: undefined as EventFilter | undefined,
			},
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(result.current.data).toHaveLength(1);

		// Client becomes null
		rerender({ c: null, f: undefined });

		expect(result.current.data).toEqual([]);
		expect(result.current.error).toBeNull();
		expect(result.current.lastUpdated).toBeNull();
	});

	it("aborts in-flight request on unmount", async () => {
		let resolveFetch: (value: never[]) => void;
		const fetchPromise = new Promise<never[]>((resolve) => {
			resolveFetch = resolve;
		});
		const getEvents = vi.fn().mockReturnValue(fetchPromise);
		const client = createMockClient({ getEvents });

		const { result, unmount } = renderHook(() => useEvents(client));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		unmount();

		// Resolving after unmount should not throw
		await act(async () => {
			resolveFetch!([]);
		});

		// State should remain empty (no update after abort)
		expect(result.current.data).toEqual([]);
	});

	it("handles non-Error thrown values in catch", async () => {
		const client = createMockClient({
			getEvents: vi.fn().mockRejectedValue(42),
		});

		const { result } = renderHook(() => useEvents(client));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(result.current.error).toBe("Failed to fetch events");
	});

	it("aborts previous request when polling triggers new fetch", async () => {
		let callCount = 0;
		const getEvents = vi.fn().mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				// First call hangs
				return new Promise(() => {});
			}
			return Promise.resolve([{ id: "e-second" }]);
		});

		const client = createMockClient({ getEvents });

		const { result } = renderHook(() => useEvents(client));

		// Initial fetch starts (hangs)
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(getEvents).toHaveBeenCalledTimes(1);

		// Polling triggers second fetch (aborts first)
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});

		expect(getEvents).toHaveBeenCalledTimes(2);
		expect(result.current.data).toEqual([{ id: "e-second" }]);
	});

	it("cleans up interval on unmount", async () => {
		const getEvents = vi.fn().mockResolvedValue([]);
		const client = createMockClient({ getEvents });

		const { unmount } = renderHook(() => useEvents(client));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(getEvents).toHaveBeenCalledTimes(1);

		unmount();

		// No more polling after unmount
		await act(async () => {
			await vi.advanceTimersByTimeAsync(60_000);
		});
		expect(getEvents).toHaveBeenCalledTimes(1);
	});

	it("passes different filter values to getEvents", async () => {
		const getEvents = vi.fn().mockResolvedValue([]);
		const client = createMockClient({ getEvents });

		const filter1: EventFilter = { deviceId: "DEV-1", eventType: "Alarm" };
		const filter2: EventFilter = { deviceId: "DEV-2", limit: 10 };

		const { rerender } = renderHook(({ f }) => useEvents(client, f), {
			initialProps: { f: filter1 as EventFilter | undefined },
		});

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(getEvents).toHaveBeenCalledWith({ ...filter1, limit: 200 });

		// Change filter triggers new effect
		rerender({ f: filter2 });

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(getEvents).toHaveBeenCalledWith(filter2);
	});

	it("refresh function triggers manual fetch", async () => {
		const getEvents = vi.fn().mockResolvedValue([]);
		const client = createMockClient({ getEvents });

		const { result } = renderHook(() => useEvents(client));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(getEvents).toHaveBeenCalledTimes(1);

		await act(async () => {
			result.current.refresh();
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(getEvents).toHaveBeenCalledTimes(2);
	});
});
