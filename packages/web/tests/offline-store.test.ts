import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceWithChannels } from "../src/lib/api.ts";
import { cacheDevices, clearStaleCache, getCachedDevices } from "../src/lib/offline-store.ts";

const mockDevices: DeviceWithChannels[] = [
	{
		device: {
			serial: "ABC123",
			deviceId: null,
			label: "Test Probe",
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

beforeEach(() => {
	// biome-ignore lint/suspicious/noGlobalAssign: reset IndexedDB between tests for isolation
	indexedDB = new IDBFactory();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("offline-store", () => {
	describe("cacheDevices", () => {
		it("stores device data in IndexedDB", async () => {
			await cacheDevices(mockDevices);

			const cached = await getCachedDevices();
			expect(cached).not.toBeNull();
			expect(cached!.devices).toEqual(mockDevices);
			expect(cached!.cachedAt).toBeCloseTo(Date.now(), -2);
		});

		it("overwrites previous cache entries", async () => {
			await cacheDevices(mockDevices);
			const updatedDevices = [{ ...mockDevices[0], channels: [] }];
			await cacheDevices(updatedDevices);

			const cached = await getCachedDevices();
			expect(cached!.devices).toEqual(updatedDevices);
		});
	});

	describe("getCachedDevices", () => {
		it("returns null when no cache exists", async () => {
			const cached = await getCachedDevices();
			expect(cached).toBeNull();
		});

		it("returns cached data when fresh", async () => {
			await cacheDevices(mockDevices);

			const cached = await getCachedDevices();
			expect(cached).not.toBeNull();
			expect(cached!.devices).toEqual(mockDevices);
		});

		it("returns null when cache is older than 24h", async () => {
			await cacheDevices(mockDevices);

			// Advance time past 24h TTL
			const twentyFiveHours = 25 * 60 * 60 * 1000;
			vi.spyOn(Date, "now").mockReturnValue(Date.now() + twentyFiveHours);

			const cached = await getCachedDevices();
			expect(cached).toBeNull();
		});
	});

	describe("clearStaleCache", () => {
		it("removes entries older than 24h", async () => {
			await cacheDevices(mockDevices);

			const twentyFiveHours = 25 * 60 * 60 * 1000;
			vi.spyOn(Date, "now").mockReturnValue(Date.now() + twentyFiveHours);

			await clearStaleCache();

			// Reset Date.now for getCachedDevices TTL check
			vi.restoreAllMocks();
			// Re-mock with a time just past the original + 25h to keep consistent
			// Actually, we just need to verify the entry is gone
			// After clearing stale, even without the TTL mock,
			// the entry was deleted so it should be null
			const cached = await getCachedDevices();
			expect(cached).toBeNull();
		});

		it("preserves fresh entries", async () => {
			await cacheDevices(mockDevices);

			await clearStaleCache();

			const cached = await getCachedDevices();
			expect(cached).not.toBeNull();
			expect(cached!.devices).toEqual(mockDevices);
		});
	});
});
