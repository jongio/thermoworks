import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDevices } from "../src/hooks/useDevices.ts";
import type { DeviceWithChannels, ThermoworksWebClient } from "../src/lib/api.ts";

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

const mockDevices: DeviceWithChannels[] = [
	{
		device: {
			serial: "ABC123",
			deviceId: null,
			label: "My Probe",
			type: "ThermaQ",
			device: null,
			status: "online",
			battery: 85,
			batteryState: null,
			wifiStrength: -42,
			firmware: "1.2.3",
			color: null,
			thumbnail: null,
			deviceDisplayUnits: null,
			iotDeviceId: null,
			iotCoreDeviceBlocked: null,
			recordingIntervalInSeconds: null,
			transmitIntervalInSeconds: null,
			readInterval: null,
			heartbeatInterval: null,
			temperatureDeltaTrigger: null,
			pendingLoad: null,
			batteryAlertSent: null,
			lastSeen: null,
			lastTelemetrySaved: null,
			latestReading: null,
			lastWifiConnection: null,
			lastBluetoothConnection: null,
			sessionStart: null,
			sessionLabel: null,
			lastArchive: null,
			lastPurged: null,
			assignedToAccountOn: null,
			accountId: null,
			notes: null,
			public: null,
			publicLink: null,
			searModeEnabled: null,
			showSensorChannels: null,
			ringColors: null,
			gateway: null,
			fan: null,
			bigQuery: null,
		},
		channels: [
			{
				value: 72.5,
				units: "F",
				label: "Channel 1",
				status: "normal",
				type: null,
				number: "1",
				enabled: true,
				color: null,
				lastSeen: null,
				lastTelemetrySaved: null,
				lastEventId: null,
				showAvgTemp: null,
				estimatedAlarmStatus: null,
				rateOfChange: null,
				rateOfChangeUnit: null,
				alarmHigh: null,
				alarmLow: null,
				minimum: null,
				maximum: null,
			},
		],
	},
];

describe("useDevices", () => {
	it("returns empty data when client is null", () => {
		const { result } = renderHook(() => useDevices(null));

		expect(result.current.data).toEqual([]);
		expect(result.current.isLoading).toBe(false);
		expect(result.current.error).toBeNull();
		expect(result.current.lastUpdated).toBeNull();
	});

	it("fetches devices when client is authenticated", async () => {
		const client = createMockClient({
			getDevicesWithChannels: vi.fn().mockResolvedValue(mockDevices),
		});

		const { result } = renderHook(() => useDevices(client));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.data).toEqual(mockDevices);
		expect(result.current.error).toBeNull();
		expect(result.current.lastUpdated).toBeInstanceOf(Date);
	});

	it("sets error state on fetch failure", async () => {
		const client = createMockClient({
			getDevicesWithChannels: vi.fn().mockRejectedValue(new Error("Network timeout")),
		});

		const { result } = renderHook(() => useDevices(client));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.error).toBe("Network timeout");
		expect(result.current.data).toEqual([]);
	});

	it("polls for updates at 10s intervals", async () => {
		vi.useFakeTimers();
		const getDevicesWithChannels = vi.fn().mockResolvedValue(mockDevices);
		const client = createMockClient({ getDevicesWithChannels });

		renderHook(() => useDevices(client));

		// Flush the initial fetch (microtasks from Promise.resolve)
		await vi.advanceTimersByTimeAsync(0);

		expect(getDevicesWithChannels).toHaveBeenCalledTimes(1);

		// Advance by 10 seconds (poll interval)
		await vi.advanceTimersByTimeAsync(10_000);

		expect(getDevicesWithChannels).toHaveBeenCalledTimes(2);

		vi.useRealTimers();
	});

	it("uses custom poll interval when provided", async () => {
		vi.useFakeTimers();
		const getDevicesWithChannels = vi.fn().mockResolvedValue(mockDevices);
		const client = createMockClient({ getDevicesWithChannels });

		renderHook(() => useDevices(client, { pollingInterval: 5_000 }));

		await vi.advanceTimersByTimeAsync(0);
		expect(getDevicesWithChannels).toHaveBeenCalledTimes(1);

		// Should poll at 5s, not 10s
		await vi.advanceTimersByTimeAsync(5_000);
		expect(getDevicesWithChannels).toHaveBeenCalledTimes(2);

		// And again at 10s total
		await vi.advanceTimersByTimeAsync(5_000);
		expect(getDevicesWithChannels).toHaveBeenCalledTimes(3);

		vi.useRealTimers();
	});

	it("clears data when client becomes null", async () => {
		const client = createMockClient({
			getDevicesWithChannels: vi.fn().mockResolvedValue(mockDevices),
		});

		const { result, rerender } = renderHook(({ c }) => useDevices(c), {
			initialProps: { c: client as ThermoworksWebClient | null },
		});

		await waitFor(() => {
			expect(result.current.data).toEqual(mockDevices);
		});

		rerender({ c: null });

		expect(result.current.data).toEqual([]);
		expect(result.current.error).toBeNull();
		expect(result.current.lastUpdated).toBeNull();
	});
});
