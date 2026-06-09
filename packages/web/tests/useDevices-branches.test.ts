import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceWithChannels, ThermoworksWebClient } from "../src/lib/api.ts";
import { useDevices } from "../src/hooks/useDevices.ts";

function createMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		getDevicesWithChannels: vi.fn().mockResolvedValue([]),
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

describe("useDevices - branch coverage", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not fetch when client.isAuthenticated is false", async () => {
		const getDevicesWithChannels = vi.fn().mockResolvedValue([]);
		const client = createMockClient({
			isAuthenticated: false,
			getDevicesWithChannels,
		} as unknown as Partial<ThermoworksWebClient>);

		const { result } = renderHook(() => useDevices(client));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(getDevicesWithChannels).not.toHaveBeenCalled();
		expect(result.current.data).toEqual([]);
		expect(result.current.error).toBeNull();
		expect(result.current.lastUpdated).toBeNull();
	});

	it("aborts in-flight request when fetchDevices is called again", async () => {
		let resolveFirst: (value: DeviceWithChannels[]) => void;
		const firstPromise = new Promise<DeviceWithChannels[]>((resolve) => {
			resolveFirst = resolve;
		});

		const secondDevices: DeviceWithChannels[] = [];
		const getDevicesWithChannels = vi.fn()
			.mockReturnValueOnce(firstPromise)
			.mockResolvedValueOnce(secondDevices);

		const client = createMockClient({ getDevicesWithChannels });

		const { result } = renderHook(() => useDevices(client, { pollingInterval: 5000 }));

		// Initial fetch starts (first call)
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(getDevicesWithChannels).toHaveBeenCalledTimes(1);

		// Polling triggers second fetch before first completes
		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});
		expect(getDevicesWithChannels).toHaveBeenCalledTimes(2);

		// Now resolve the first promise (should be ignored since aborted)
		await act(async () => {
			resolveFirst!([]);
		});

		// The second call's result should be what we have
		expect(result.current.isLoading).toBe(false);
	});

	it("does not update state when request is aborted mid-flight (error path)", async () => {
		let rejectFetch: (reason: Error) => void;
		const fetchPromise = new Promise<DeviceWithChannels[]>((_resolve, reject) => {
			rejectFetch = reject;
		});

		const getDevicesWithChannels = vi.fn().mockReturnValueOnce(fetchPromise);
		const client = createMockClient({ getDevicesWithChannels });

		const { result, unmount } = renderHook(() => useDevices(client));

		// Let the effect fire
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		// Unmount triggers cleanup which aborts
		unmount();

		// Now reject — should NOT throw or update state
		await act(async () => {
			rejectFetch!(new Error("aborted"));
		});

		// No error since component unmounted (state updates are no-ops)
		expect(result.current.error).toBeNull();
	});

	it("handles non-Error thrown values in catch", async () => {
		const client = createMockClient({
			getDevicesWithChannels: vi.fn().mockRejectedValue("string error"),
		});

		const { result } = renderHook(() => useDevices(client));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(result.current.error).toBe("Failed to fetch devices");
	});

	it("cleans up interval and abort on unmount", async () => {
		const getDevicesWithChannels = vi.fn().mockResolvedValue([]);
		const client = createMockClient({ getDevicesWithChannels });

		const { unmount } = renderHook(() => useDevices(client));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(getDevicesWithChannels).toHaveBeenCalledTimes(1);

		unmount();

		// After unmount, advancing timers should NOT trigger more fetches
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000);
		});
		expect(getDevicesWithChannels).toHaveBeenCalledTimes(1);
	});

	it("refresh function triggers a new fetch", async () => {
		const getDevicesWithChannels = vi.fn().mockResolvedValue([]);
		const client = createMockClient({ getDevicesWithChannels });

		const { result } = renderHook(() => useDevices(client));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(getDevicesWithChannels).toHaveBeenCalledTimes(1);

		// Call refresh manually
		await act(async () => {
			result.current.refresh();
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(getDevicesWithChannels).toHaveBeenCalledTimes(2);
	});

	it("does not set data when aborted during successful fetch", async () => {
		let resolveFetch: (value: DeviceWithChannels[]) => void;
		const fetchPromise = new Promise<DeviceWithChannels[]>((resolve) => {
			resolveFetch = resolve;
		});

		const getDevicesWithChannels = vi.fn()
			.mockReturnValueOnce(fetchPromise)
			.mockResolvedValue([]);

		const client = createMockClient({ getDevicesWithChannels });

		const { result } = renderHook(() => useDevices(client, { pollingInterval: 1000 }));

		// First fetch is pending
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		// Trigger polling (aborts first)
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1000);
		});

		// Now resolve the aborted first fetch
		await act(async () => {
			resolveFetch!([{
				device: { serial: "STALE" } as never,
				channels: [],
			}]);
		});

		// Stale data should not appear
		expect(result.current.data.find(d => d.device.serial === "STALE")).toBeUndefined();
	});
});
