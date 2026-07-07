import { describe, expect, it, vi } from "vitest";
import { resetClient } from "../src/server.js";

vi.mock("thermoworks-sdk", () => {
	const mockClose = vi.fn();
	const mockGetDevices = vi.fn();
	const mockGetDevice = vi.fn();
	const mockGetAllDeviceChannels = vi.fn();
	const mockGetAverageTemperature = vi.fn();
	const mockGetEvents = vi.fn();
	const mockGetArchives = vi.fn();
	const mockGetArchive = vi.fn();
	const mockGetCalibration = vi.fn();
	const mockGetDataUsage = vi.fn();
	const mockGetDataUsageByDevice = vi.fn();
	const mockGetTemperatureGuide = vi.fn();
	const mockSetAlarm = vi.fn();
	const mockGetDeviceChannel = vi.fn();
	const mockStartSession = vi.fn();
	const mockEndSession = vi.fn();
	const mockGetFirmwareInfo = vi.fn();
	const mockGetHistory = vi.fn();
	const mockGetFanState = vi.fn();
	const mockSetFanTarget = vi.fn();
	const mockSetFanEnabled = vi.fn();

	class MockThermoworksCloud {
		close = mockClose;
		getDevices = mockGetDevices;
		getDevice = mockGetDevice;
		getAllDeviceChannels = mockGetAllDeviceChannels;
		getAverageTemperature = mockGetAverageTemperature;
		getEvents = mockGetEvents;
		getArchives = mockGetArchives;
		getArchive = mockGetArchive;
		getCalibration = mockGetCalibration;
		getDataUsage = mockGetDataUsage;
		getDataUsageByDevice = mockGetDataUsageByDevice;
		getTemperatureGuide = mockGetTemperatureGuide;
		setAlarm = mockSetAlarm;
		getDeviceChannel = mockGetDeviceChannel;
		startSession = mockStartSession;
		endSession = mockEndSession;
		getFirmwareInfo = mockGetFirmwareInfo;
		getHistory = mockGetHistory;
		getFanState = mockGetFanState;
		setFanTarget = mockSetFanTarget;
		setFanEnabled = mockSetFanEnabled;
	}

	return {
		ThermoworksCloud: MockThermoworksCloud,
		mockClose,
		mockGetDevices,
		mockGetDevice,
		mockGetAllDeviceChannels,
		mockGetAverageTemperature,
		mockGetEvents,
		mockGetArchives,
		mockGetArchive,
		mockGetCalibration,
		mockGetDataUsage,
		mockGetDataUsageByDevice,
		mockGetTemperatureGuide,
		mockSetAlarm,
		mockGetDeviceChannel,
		mockStartSession,
		mockEndSession,
		mockGetFirmwareInfo,
		mockGetHistory,
		mockGetFanState,
		mockSetFanTarget,
		mockSetFanEnabled,
		getChannelAlarmState: (channel: any) => {
			if (channel.alarmHigh?.alarming) return "high";
			if (channel.alarmLow?.alarming) return "low";
			return "none";
		},
	};
});

import {
	mockEndSession,
	mockGetAllDeviceChannels,
	mockGetArchive,
	mockGetArchives,
	mockGetAverageTemperature,
	mockGetCalibration,
	mockGetDataUsage,
	mockGetDataUsageByDevice,
	mockGetDevice,
	mockGetDeviceChannel,
	mockGetDevices,
	mockGetEvents,
	mockGetFanState,
	mockGetFirmwareInfo,
	mockGetHistory,
	mockGetTemperatureGuide,
	mockSetAlarm,
	mockSetFanEnabled,
	mockSetFanTarget,
	mockStartSession,
} from "thermoworks-sdk";

import { createServer } from "../src/server.js";

function getToolHandler(server: ReturnType<typeof createServer>, toolName: string) {
	// Access the server internals to call tool handlers directly
	const tools = (server as any)._registeredTools as Record<
		string,
		{ handler: (args: any, extra: any) => Promise<any> }
	>;
	const tool = tools[toolName];
	if (!tool) {
		throw new Error(`Tool "${toolName}" not found`);
	}
	return tool.handler;
}

describe("MCP Server", () => {
	const originalEnv = process.env;

	function setupEnv() {
		process.env = {
			...originalEnv,
			THERMOWORKS_EMAIL: "test@example.com",
			THERMOWORKS_PASSWORD: "testpass",
		};
	}

	function teardownEnv() {
		process.env = originalEnv;
	}

	describe("createServer", () => {
		it("creates a server instance", () => {
			const server = createServer();
			expect(server).toBeDefined();
		});
	});

	describe("get_devices tool", () => {
		it("returns device list", async () => {
			setupEnv();
			try {
				const devices = [
					{ serial: "ABC123", label: "Smoker", status: "online", battery: 85 },
					{ serial: "DEF456", label: "Grill", status: "offline", battery: 42 },
				];
				(mockGetDevices as any).mockResolvedValueOnce(devices);

				const server = createServer();
				const handler = getToolHandler(server, "get_devices");
				const result = await handler({}, {});

				expect(result.content[0].type).toBe("text");
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed).toHaveLength(2);
				expect(parsed[0].serial).toBe("ABC123");
			} finally {
				teardownEnv();
			}
		});
	});

	describe("get_device tool", () => {
		it("returns device details for serial", async () => {
			setupEnv();
			try {
				const device = { serial: "ABC123", label: "Smoker", status: "online", battery: 85 };
				(mockGetDevice as any).mockResolvedValueOnce(device);

				const server = createServer();
				const handler = getToolHandler(server, "get_device");
				const result = await handler({ serial: "ABC123" }, {});

				expect(result.content[0].type).toBe("text");
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.serial).toBe("ABC123");
				expect(parsed.label).toBe("Smoker");
			} finally {
				teardownEnv();
			}
		});
	});

	describe("get_device_channels tool", () => {
		it("returns channel readings", async () => {
			setupEnv();
			try {
				const channels = [
					{ value: 225.5, units: "F", label: "Probe 1", number: "1" },
					{ value: 185.0, units: "F", label: "Probe 2", number: "2" },
				];
				(mockGetAllDeviceChannels as any).mockResolvedValueOnce(channels);

				const server = createServer();
				const handler = getToolHandler(server, "get_device_channels");
				const result = await handler({ serial: "ABC123" }, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed).toHaveLength(2);
				expect(parsed[0].value).toBe(225.5);
			} finally {
				teardownEnv();
			}
		});
	});

	describe("get_average_temperature tool", () => {
		it("returns average temperature", async () => {
			setupEnv();
			try {
				(mockGetAverageTemperature as any).mockResolvedValueOnce({ value: 205.3, units: "F" });

				const server = createServer();
				const handler = getToolHandler(server, "get_average_temperature");
				const result = await handler({ serial: "ABC123" }, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.value).toBe(205.3);
				expect(parsed.units).toBe("F");
			} finally {
				teardownEnv();
			}
		});

		it("returns message when no readings available", async () => {
			setupEnv();
			try {
				(mockGetAverageTemperature as any).mockResolvedValueOnce(null);

				const server = createServer();
				const handler = getToolHandler(server, "get_average_temperature");
				const result = await handler({ serial: "ABC123" }, {});

				expect(result.content[0].text).toBe("No temperature readings available for this device");
			} finally {
				teardownEnv();
			}
		});
	});

	describe("get_live_cook_snapshot tool", () => {
		it("returns a snapshot for all devices", async () => {
			setupEnv();
			try {
				(mockGetDevices as any).mockResolvedValueOnce([
					{
						serial: "ABC123",
						label: "Smoker",
						type: "signals",
						status: "online",
						battery: 85,
						batteryState: "good",
						wifiStrength: -55,
						lastSeen: new Date("2026-06-01T12:00:00Z"),
						firmware: "1.2.3",
						sessionStart: new Date("2026-06-01T10:00:00Z"),
						sessionLabel: "Brisket",
					},
				]);
				(mockGetAllDeviceChannels as any).mockResolvedValueOnce([
					{
						value: 225,
						units: "F",
						label: "Pit",
						number: "1",
						type: "temperature",
						status: "normal",
						enabled: true,
						alarmHigh: null,
						alarmLow: null,
						minimum: { value: 220, units: "F", date: new Date("2026-06-01T10:30:00Z") },
						maximum: { value: 235, units: "F", date: new Date("2026-06-01T11:30:00Z") },
						rateOfChange: 1.2,
						rateOfChangeUnit: "F/min",
						lastSeen: new Date("2026-06-01T12:00:00Z"),
					},
					{
						value: 203,
						units: "F",
						label: "Meat",
						number: "2",
						type: "temperature",
						status: "high",
						enabled: true,
						alarmHigh: {
							enabled: true,
							alarming: true,
							muted: null,
							value: 200,
							units: "F",
							lastNotified: null,
						},
						alarmLow: null,
						minimum: null,
						maximum: null,
						rateOfChange: null,
						rateOfChangeUnit: null,
						lastSeen: null,
					},
					{ value: null, units: "F", label: "Disabled", number: "3", enabled: false },
				]);

				const server = createServer();
				const handler = getToolHandler(server, "get_live_cook_snapshot");
				const result = await handler({}, {});

				expect(mockGetDevices).toHaveBeenCalled();
				expect(mockGetAllDeviceChannels).toHaveBeenCalledWith("ABC123");
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.deviceCount).toBe(1);
				expect(parsed.channelCount).toBe(2);
				expect(parsed.alarmingChannelCount).toBe(1);
				expect(parsed.devices[0].serial).toBe("ABC123");
				expect(parsed.devices[0].session.active).toBe(true);
				expect(parsed.devices[0].alarmState).toBe("high");
				expect(parsed.devices[0].channels[0].minimum.value).toBe(220);
				expect(parsed.devices[0].channels[1].alarmState).toBe("high");
			} finally {
				teardownEnv();
			}
		});

		it("returns a snapshot for one device when serial is provided", async () => {
			setupEnv();
			try {
				(mockGetDevices as any).mockClear();
				(mockGetDevice as any).mockResolvedValueOnce({
					serial: "DEF456",
					label: null,
					type: "rfx",
					status: "online",
					battery: null,
					batteryState: null,
					wifiStrength: null,
					lastSeen: null,
					firmware: null,
					sessionStart: null,
					sessionLabel: null,
				});
				(mockGetAllDeviceChannels as any).mockResolvedValueOnce([]);

				const server = createServer();
				const handler = getToolHandler(server, "get_live_cook_snapshot");
				const result = await handler({ serial: "DEF456" }, {});

				expect(mockGetDevice).toHaveBeenCalledWith("DEF456");
				expect(mockGetDevices).not.toHaveBeenCalled();
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.devices[0].label).toBe("DEF456");
				expect(parsed.devices[0].session.active).toBe(false);
			} finally {
				teardownEnv();
			}
		});
	});

	describe("get_events tool", () => {
		it("returns events with optional filters", async () => {
			setupEnv();
			try {
				const events = [
					{
						id: "evt1",
						eventType: "Low Battery Alert",
						deviceId: "ABC123",
						severity: 2,
						eventTime: new Date("2024-01-01"),
					},
				];
				(mockGetEvents as any).mockResolvedValueOnce(events);

				const server = createServer();
				const handler = getToolHandler(server, "get_events");
				const result = await handler(
					{ device_id: "ABC123", event_type: "Low Battery Alert", limit: 10 },
					{},
				);

				expect(mockGetEvents).toHaveBeenCalledWith({
					deviceId: "ABC123",
					eventType: "Low Battery Alert",
					limit: 10,
				});
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed).toHaveLength(1);
				expect(parsed[0].eventType).toBe("Low Battery Alert");
			} finally {
				teardownEnv();
			}
		});
	});

	describe("get_archives tool", () => {
		it("returns archives for device", async () => {
			setupEnv();
			try {
				const archives = [{ id: "arch1", label: "Cook Session 1", start: new Date("2024-01-01") }];
				(mockGetArchives as any).mockResolvedValueOnce(archives);

				const server = createServer();
				const handler = getToolHandler(server, "get_archives");
				const result = await handler({ serial: "ABC123", limit: 5 }, {});

				expect(mockGetArchives).toHaveBeenCalledWith("ABC123", { limit: 5 });
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed).toHaveLength(1);
				expect(parsed[0].label).toBe("Cook Session 1");
			} finally {
				teardownEnv();
			}
		});
	});

	describe("search_archives tool", () => {
		it("returns archives across all devices sorted by most recent", async () => {
			setupEnv();
			try {
				(mockGetDevices as any).mockResolvedValueOnce([
					{ serial: "ABC123", label: "Smoker" },
					{ serial: "DEF456", label: "Grill" },
				]);
				(mockGetArchives as any).mockImplementation((serial: string) => {
					if (serial === "ABC123") {
						return Promise.resolve([
							{
								id: "arch-1",
								label: "Brisket",
								deviceLabel: "Smoker",
								start: new Date("2024-06-10T10:00:00Z"),
								channels: [{ number: "1" }, { number: "2" }],
								count: 500,
							},
						]);
					}
					return Promise.resolve([
						{
							id: "arch-2",
							label: "Ribs",
							deviceLabel: "Grill",
							start: new Date("2024-06-15T12:00:00Z"),
							channels: [{ number: "1" }],
							count: 300,
						},
					]);
				});

				const server = createServer();
				const handler = getToolHandler(server, "search_archives");
				const result = await handler({}, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.totalMatches).toBe(2);
				expect(parsed.returned).toBe(2);
				// Most recent first
				expect(parsed.archives[0].archiveId).toBe("arch-2");
				expect(parsed.archives[0].deviceSerial).toBe("DEF456");
				expect(parsed.archives[1].archiveId).toBe("arch-1");
				expect(parsed.archives[1].deviceSerial).toBe("ABC123");
				expect(parsed.archives[1].channelCount).toBe(2);
				expect(parsed.archives[1].readingCount).toBe(500);
			} finally {
				(mockGetArchives as any).mockReset();
				teardownEnv();
			}
		});

		it("filters by query text (case-insensitive)", async () => {
			setupEnv();
			try {
				(mockGetDevices as any).mockResolvedValueOnce([
					{ serial: "ABC123", label: "Smoker" },
					{ serial: "DEF456", label: "Grill" },
				]);
				(mockGetArchives as any).mockImplementation((serial: string) => {
					if (serial === "ABC123") {
						return Promise.resolve([
							{
								id: "arch-1",
								label: "Brisket Low and Slow",
								deviceLabel: "Smoker",
								start: new Date("2024-06-10T10:00:00Z"),
								channels: [],
								count: 100,
							},
						]);
					}
					return Promise.resolve([
						{
							id: "arch-2",
							label: "Chicken Wings",
							deviceLabel: "Grill",
							start: new Date("2024-06-12T10:00:00Z"),
							channels: [],
							count: 50,
						},
					]);
				});

				const server = createServer();
				const handler = getToolHandler(server, "search_archives");
				const result = await handler({ query: "brisket" }, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.totalMatches).toBe(1);
				expect(parsed.archives[0].archiveId).toBe("arch-1");
				expect(parsed.archives[0].label).toBe("Brisket Low and Slow");
			} finally {
				(mockGetArchives as any).mockReset();
				teardownEnv();
			}
		});

		it("matches query against device serial", async () => {
			setupEnv();
			try {
				(mockGetDevices as any).mockResolvedValueOnce([{ serial: "ABC123", label: "Smoker" }]);
				(mockGetArchives as any).mockImplementation(() =>
					Promise.resolve([
						{
							id: "arch-1",
							label: "Session",
							deviceLabel: "Smoker",
							start: new Date("2024-06-10T10:00:00Z"),
							channels: [],
							count: 10,
						},
					]),
				);

				const server = createServer();
				const handler = getToolHandler(server, "search_archives");
				const result = await handler({ query: "abc123" }, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.totalMatches).toBe(1);
				expect(parsed.archives[0].deviceSerial).toBe("ABC123");
			} finally {
				(mockGetArchives as any).mockReset();
				teardownEnv();
			}
		});

		it("filters by date range", async () => {
			setupEnv();
			try {
				(mockGetDevices as any).mockResolvedValueOnce([{ serial: "ABC123", label: "Smoker" }]);
				(mockGetArchives as any).mockImplementation(() =>
					Promise.resolve([
						{
							id: "arch-old",
							label: "Old Cook",
							deviceLabel: "Smoker",
							start: new Date("2024-01-01T10:00:00Z"),
							channels: [],
							count: 100,
						},
						{
							id: "arch-mid",
							label: "Mid Cook",
							deviceLabel: "Smoker",
							start: new Date("2024-06-15T10:00:00Z"),
							channels: [],
							count: 200,
						},
						{
							id: "arch-new",
							label: "New Cook",
							deviceLabel: "Smoker",
							start: new Date("2024-12-01T10:00:00Z"),
							channels: [],
							count: 300,
						},
					]),
				);

				const server = createServer();
				const handler = getToolHandler(server, "search_archives");
				const result = await handler(
					{ date_from: "2024-06-01T00:00:00Z", date_to: "2024-07-01T00:00:00Z" },
					{},
				);

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.totalMatches).toBe(1);
				expect(parsed.archives[0].archiveId).toBe("arch-mid");
			} finally {
				(mockGetArchives as any).mockReset();
				teardownEnv();
			}
		});

		it("respects limit parameter", async () => {
			setupEnv();
			try {
				(mockGetDevices as any).mockResolvedValueOnce([{ serial: "ABC123", label: "Smoker" }]);
				(mockGetArchives as any).mockImplementation(() =>
					Promise.resolve([
						{
							id: "arch-1",
							label: "Cook 1",
							deviceLabel: "Smoker",
							start: new Date("2024-06-01T10:00:00Z"),
							channels: [],
							count: 10,
						},
						{
							id: "arch-2",
							label: "Cook 2",
							deviceLabel: "Smoker",
							start: new Date("2024-06-02T10:00:00Z"),
							channels: [],
							count: 20,
						},
						{
							id: "arch-3",
							label: "Cook 3",
							deviceLabel: "Smoker",
							start: new Date("2024-06-03T10:00:00Z"),
							channels: [],
							count: 30,
						},
					]),
				);

				const server = createServer();
				const handler = getToolHandler(server, "search_archives");
				const result = await handler({ limit: 2 }, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.totalMatches).toBe(3);
				expect(parsed.returned).toBe(2);
				expect(parsed.archives).toHaveLength(2);
				// Most recent first
				expect(parsed.archives[0].archiveId).toBe("arch-3");
			} finally {
				(mockGetArchives as any).mockReset();
				teardownEnv();
			}
		});

		it("skips archives without start date when date filters are active", async () => {
			setupEnv();
			try {
				(mockGetDevices as any).mockResolvedValueOnce([{ serial: "ABC123", label: "Smoker" }]);
				(mockGetArchives as any).mockImplementation(() =>
					Promise.resolve([
						{
							id: "arch-nodate",
							label: "No Date",
							deviceLabel: "Smoker",
							start: null,
							channels: [],
							count: 5,
						},
						{
							id: "arch-dated",
							label: "Dated",
							deviceLabel: "Smoker",
							start: new Date("2024-06-15T10:00:00Z"),
							channels: [],
							count: 50,
						},
					]),
				);

				const server = createServer();
				const handler = getToolHandler(server, "search_archives");
				const result = await handler({ date_from: "2024-06-01T00:00:00Z" }, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.totalMatches).toBe(1);
				expect(parsed.archives[0].archiveId).toBe("arch-dated");
			} finally {
				(mockGetArchives as any).mockReset();
				teardownEnv();
			}
		});

		it("returns empty results when no archives match", async () => {
			setupEnv();
			try {
				(mockGetDevices as any).mockResolvedValueOnce([{ serial: "ABC123", label: "Smoker" }]);
				(mockGetArchives as any).mockImplementation(() => Promise.resolve([]));

				const server = createServer();
				const handler = getToolHandler(server, "search_archives");
				const result = await handler({ query: "nonexistent" }, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.totalMatches).toBe(0);
				expect(parsed.returned).toBe(0);
				expect(parsed.archives).toEqual([]);
			} finally {
				(mockGetArchives as any).mockReset();
				teardownEnv();
			}
		});
	});

	describe("get_calibration tool", () => {
		it("returns calibration records for a device", async () => {
			setupEnv();
			try {
				const records = [
					{
						calibrationId: "CAL-001",
						deviceId: "ABC123",
						result: "Pass",
						lowPointAdjustments: [
							{ channel: 1, value: 32.1, referenceValue: 32.0, deviation: 0.1, result: "Pass" },
						],
						highPointReference: [
							{ channel: 1, value: 212.0, referenceValue: 212.0, deviation: 0, result: "Pass" },
						],
					},
				];
				(mockGetCalibration as any).mockResolvedValueOnce(records);

				const server = createServer();
				const handler = getToolHandler(server, "get_calibration");
				const result = await handler({ serial: "ABC123" }, {});

				expect(mockGetCalibration).toHaveBeenCalledWith("ABC123");
				expect(result.content[0].type).toBe("text");
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed).toHaveLength(1);
				expect(parsed[0].calibrationId).toBe("CAL-001");
				expect(parsed[0].result).toBe("Pass");
				expect(parsed[0].lowPointAdjustments).toHaveLength(1);
			} finally {
				teardownEnv();
			}
		});

		it("returns an empty array when there are no calibration records", async () => {
			setupEnv();
			try {
				(mockGetCalibration as any).mockResolvedValueOnce([]);

				const server = createServer();
				const handler = getToolHandler(server, "get_calibration");
				const result = await handler({ serial: "XYZ999" }, {});

				expect(mockGetCalibration).toHaveBeenCalledWith("XYZ999");
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed).toEqual([]);
			} finally {
				teardownEnv();
			}
		});
	});

	describe("get_data_usage tool", () => {
		it("returns the account total by default", async () => {
			setupEnv();
			try {
				(mockGetDataUsage as any).mockClear();
				(mockGetDataUsageByDevice as any).mockClear();
				const usage = { totalBytes: 13000000, formattedSize: "12.4 MB" };
				(mockGetDataUsage as any).mockResolvedValueOnce(usage);

				const server = createServer();
				const handler = getToolHandler(server, "get_data_usage");
				const result = await handler({}, {});

				expect(mockGetDataUsage).toHaveBeenCalledTimes(1);
				expect(mockGetDataUsageByDevice).not.toHaveBeenCalled();
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.formattedSize).toBe("12.4 MB");
			} finally {
				teardownEnv();
			}
		});

		it("returns a per-device breakdown when by_device is true", async () => {
			setupEnv();
			try {
				(mockGetDataUsage as any).mockClear();
				(mockGetDataUsageByDevice as any).mockClear();
				const perDevice = [
					{ deviceId: "DEV-A", bytes: 1024, formattedSize: "1.0 KB" },
					{ deviceId: "DEV-B", bytes: 10000, formattedSize: "9.8 KB" },
				];
				(mockGetDataUsageByDevice as any).mockResolvedValueOnce(perDevice);

				const server = createServer();
				const handler = getToolHandler(server, "get_data_usage");
				const result = await handler({ by_device: true }, {});

				expect(mockGetDataUsageByDevice).toHaveBeenCalledTimes(1);
				expect(mockGetDataUsage).not.toHaveBeenCalled();
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed).toHaveLength(2);
				expect(parsed[0].deviceId).toBe("DEV-A");
			} finally {
				teardownEnv();
			}
		});
	});

	describe("get_archive_detail tool", () => {
		it("returns full archive detail with computed duration", async () => {
			setupEnv();
			try {
				const archive = {
					id: "arch-1",
					start: new Date("2024-06-15T10:00:00Z"),
					end: new Date("2024-06-15T18:30:00Z"),
					count: 1024,
					type: "session",
					label: "Brisket Low and Slow",
					deviceLabel: "Smoker",
					notes: "Wrapped at 165F",
					createdOn: new Date("2024-06-15T10:00:00Z"),
					public: false,
					publicLink: null,
					filename: null,
					channels: [
						{
							number: "1",
							label: "Pit",
							units: "F",
							value: 225.5,
							status: "normal",
							enabled: true,
							color: "#FF0000",
							type: "temperature",
							alarmHigh: null,
							alarmLow: null,
							minimum: { value: 218.0, units: "F", date: new Date("2024-06-15T12:00:00Z") },
							maximum: { value: 235.0, units: "F", date: new Date("2024-06-15T14:00:00Z") },
							recentReadings: [],
						},
					],
				};
				(mockGetArchive as any).mockResolvedValueOnce(archive);

				const server = createServer();
				const handler = getToolHandler(server, "get_archive_detail");
				const result = await handler({ serial: "ABC123", archive_id: "arch-1" }, {});

				expect(mockGetArchive).toHaveBeenCalledWith("ABC123", "arch-1");
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.label).toBe("Brisket Low and Slow");
				expect(parsed.start).toBe("2024-06-15T10:00:00.000Z");
				expect(parsed.end).toBe("2024-06-15T18:30:00.000Z");
				expect(parsed.durationSeconds).toBe(30600);
				expect(parsed.channels[0].minimum.value).toBe(218.0);
				expect(parsed.channels[0].maximum.value).toBe(235.0);
				expect(parsed.channels[0].value).toBe(225.5);
				expect(parsed.notes).toBe("Wrapped at 165F");
			} finally {
				teardownEnv();
			}
		});

		it("returns null durationSeconds when end is missing", async () => {
			setupEnv();
			try {
				const archive = {
					id: "arch-2",
					start: new Date("2024-06-15T10:00:00Z"),
					end: null,
					count: null,
					type: null,
					label: "Incomplete Session",
					deviceLabel: null,
					notes: null,
					createdOn: null,
					public: null,
					publicLink: null,
					filename: null,
					channels: null,
				};
				(mockGetArchive as any).mockResolvedValueOnce(archive);

				const server = createServer();
				const handler = getToolHandler(server, "get_archive_detail");
				const result = await handler({ serial: "ABC123", archive_id: "arch-2" }, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.durationSeconds).toBeNull();
				expect(parsed.label).toBe("Incomplete Session");
			} finally {
				teardownEnv();
			}
		});
	});

	describe("get_temperature_guide tool", () => {
		it("returns temperature guide", async () => {
			setupEnv();
			try {
				const guide = {
					categories: [
						{ label: "Beef", icon: "beef", pullWarning: null, warning: null },
						{ label: "Pork", icon: "pork", pullWarning: "Pull 5F early", warning: null },
					],
				};
				(mockGetTemperatureGuide as any).mockResolvedValueOnce(guide);

				const server = createServer();
				const handler = getToolHandler(server, "get_temperature_guide");
				const result = await handler({}, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.categories).toHaveLength(2);
				expect(parsed.categories[0].label).toBe("Beef");
			} finally {
				teardownEnv();
			}
		});
	});

	describe("set_alarm tool", () => {
		it("sets high and low thresholds", async () => {
			setupEnv();
			try {
				(mockSetAlarm as any).mockResolvedValueOnce(undefined);
				(mockGetDeviceChannel as any).mockResolvedValueOnce({
					alarmHigh: {
						enabled: true,
						alarming: false,
						muted: null,
						value: 225,
						units: "F",
						lastNotified: null,
					},
					alarmLow: {
						enabled: true,
						alarming: false,
						muted: null,
						value: 150,
						units: "F",
						lastNotified: null,
					},
				});

				const server = createServer();
				const handler = getToolHandler(server, "set_alarm");
				const result = await handler(
					{ serial: "ABC123", channel: 1, high_temp: 225, low_temp: 150 },
					{},
				);

				expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 1, {
					high: { value: 225, enabled: true },
					low: { value: 150, enabled: true },
				});
				expect(mockGetDeviceChannel).toHaveBeenCalledWith("ABC123", 1);

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.serial).toBe("ABC123");
				expect(parsed.channel).toBe(1);
				expect(parsed.alarmHigh.value).toBe(225);
				expect(parsed.alarmHigh.enabled).toBe(true);
				expect(parsed.alarmLow.value).toBe(150);
				expect(parsed.alarmLow.enabled).toBe(true);
			} finally {
				teardownEnv();
			}
		});

		it("sets high threshold only (partial set)", async () => {
			setupEnv();
			try {
				(mockSetAlarm as any).mockResolvedValueOnce(undefined);
				(mockGetDeviceChannel as any).mockResolvedValueOnce({
					alarmHigh: {
						enabled: true,
						alarming: false,
						muted: null,
						value: 300,
						units: "F",
						lastNotified: null,
					},
					alarmLow: null,
				});

				const server = createServer();
				const handler = getToolHandler(server, "set_alarm");
				const result = await handler({ serial: "DEF456", channel: 3, high_temp: 300 }, {});

				expect(mockSetAlarm).toHaveBeenCalledWith("DEF456", 3, {
					high: { value: 300, enabled: true },
				});
				expect(mockGetDeviceChannel).toHaveBeenCalledWith("DEF456", 3);

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.serial).toBe("DEF456");
				expect(parsed.channel).toBe(3);
				expect(parsed.alarmHigh.value).toBe(300);
				expect(parsed.alarmLow).toBeNull();
			} finally {
				teardownEnv();
			}
		});

		it("clears both alarms when clear is true", async () => {
			setupEnv();
			try {
				(mockSetAlarm as any).mockResolvedValueOnce(undefined);
				(mockGetDeviceChannel as any).mockResolvedValueOnce({
					alarmHigh: {
						enabled: false,
						alarming: false,
						muted: null,
						value: 0,
						units: "F",
						lastNotified: null,
					},
					alarmLow: {
						enabled: false,
						alarming: false,
						muted: null,
						value: 0,
						units: "F",
						lastNotified: null,
					},
				});

				const server = createServer();
				const handler = getToolHandler(server, "set_alarm");
				const result = await handler({ serial: "ABC123", channel: 2, clear: true }, {});

				expect(mockSetAlarm).toHaveBeenCalledWith("ABC123", 2, {
					high: { value: 0, enabled: false },
					low: { value: 0, enabled: false },
				});
				expect(mockGetDeviceChannel).toHaveBeenCalledWith("ABC123", 2);

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.alarmHigh.enabled).toBe(false);
				expect(parsed.alarmLow.enabled).toBe(false);
			} finally {
				teardownEnv();
			}
		});

		it("returns error when none of high_temp, low_temp, or clear is provided", async () => {
			setupEnv();
			try {
				(mockSetAlarm as any).mockClear();

				const server = createServer();
				const handler = getToolHandler(server, "set_alarm");
				await expect(handler({ serial: "ABC123", channel: 1 }, {})).rejects.toThrow(
					"set_alarm requires at least one of high_temp, low_temp, or clear",
				);
				expect(mockSetAlarm).not.toHaveBeenCalled();
			} finally {
				teardownEnv();
			}
		});
	});

	describe("start_session tool", () => {
		it("starts a session without a label", async () => {
			setupEnv();
			try {
				const actionResult = { success: true, data: { sessionId: "sess-001" }, error: null };
				(mockStartSession as any).mockResolvedValueOnce(actionResult);

				const server = createServer();
				const handler = getToolHandler(server, "start_session");
				const result = await handler({ serial: "ABC123" }, {});

				expect(mockStartSession).toHaveBeenCalledWith("ABC123", undefined);
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.success).toBe(true);
				expect(parsed.data.sessionId).toBe("sess-001");
				expect(parsed.error).toBeNull();
			} finally {
				teardownEnv();
			}
		});

		it("starts a session with a label", async () => {
			setupEnv();
			try {
				const actionResult = { success: true, data: { sessionId: "sess-002" }, error: null };
				(mockStartSession as any).mockResolvedValueOnce(actionResult);

				const server = createServer();
				const handler = getToolHandler(server, "start_session");
				const result = await handler({ serial: "ABC123", label: "Brisket Low and Slow" }, {});

				expect(mockStartSession).toHaveBeenCalledWith("ABC123", "Brisket Low and Slow");
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.success).toBe(true);
			} finally {
				teardownEnv();
			}
		});

		it("returns error result on failure", async () => {
			setupEnv();
			try {
				const actionResult = { success: false, data: null, error: "Device not found" };
				(mockStartSession as any).mockResolvedValueOnce(actionResult);

				const server = createServer();
				const handler = getToolHandler(server, "start_session");
				const result = await handler({ serial: "INVALID", label: "Test" }, {});

				expect(mockStartSession).toHaveBeenCalledWith("INVALID", "Test");
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.success).toBe(false);
				expect(parsed.error).toBe("Device not found");
				expect(parsed.data).toBeNull();
			} finally {
				teardownEnv();
			}
		});
	});

	describe("end_session tool", () => {
		it("ends the active session", async () => {
			setupEnv();
			try {
				const actionResult = { success: true, data: null, error: null };
				(mockEndSession as any).mockResolvedValueOnce(actionResult);

				const server = createServer();
				const handler = getToolHandler(server, "end_session");
				const result = await handler({ serial: "ABC123" }, {});

				expect(mockEndSession).toHaveBeenCalledWith("ABC123");
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.success).toBe(true);
				expect(parsed.error).toBeNull();
			} finally {
				teardownEnv();
			}
		});

		it("returns error result on failure", async () => {
			setupEnv();
			try {
				const actionResult = { success: false, data: null, error: "No active session" };
				(mockEndSession as any).mockResolvedValueOnce(actionResult);

				const server = createServer();
				const handler = getToolHandler(server, "end_session");
				const result = await handler({ serial: "ABC123" }, {});

				expect(mockEndSession).toHaveBeenCalledWith("ABC123");
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.success).toBe(false);
				expect(parsed.error).toBe("No active session");
			} finally {
				teardownEnv();
			}
		});
	});

	describe("get_fan_state tool", () => {
		it("returns the fan state when a controller is present", async () => {
			setupEnv();
			try {
				const fanState = {
					connected: true,
					connection: true,
					setTemp: 225,
					fanChannel: "1",
					state: 40,
				};
				(mockGetFanState as any).mockResolvedValueOnce(fanState);

				const server = createServer();
				const handler = getToolHandler(server, "get_fan_state");
				const result = await handler({ serial: "ABC123" }, {});

				expect(mockGetFanState).toHaveBeenCalledWith("ABC123");
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.connected).toBe(true);
				expect(parsed.setTemp).toBe(225);
				expect(parsed.fanChannel).toBe("1");
			} finally {
				teardownEnv();
			}
		});

		it("returns a message when no fan controller is present", async () => {
			setupEnv();
			try {
				(mockGetFanState as any).mockResolvedValueOnce(null);

				const server = createServer();
				const handler = getToolHandler(server, "get_fan_state");
				const result = await handler({ serial: "ABC123" }, {});

				expect(mockGetFanState).toHaveBeenCalledWith("ABC123");
				expect(result.content[0].text).toBe("No fan controller found for device ABC123");
			} finally {
				teardownEnv();
			}
		});
	});

	describe("set_fan_target tool", () => {
		it("sets the target temperature", async () => {
			setupEnv();
			try {
				const actionResult = { success: true, data: null, error: null };
				(mockSetFanTarget as any).mockResolvedValueOnce(actionResult);

				const server = createServer();
				const handler = getToolHandler(server, "set_fan_target");
				const result = await handler({ serial: "ABC123", target_temp: 250 }, {});

				expect(mockSetFanTarget).toHaveBeenCalledWith("ABC123", 250);
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.success).toBe(true);
				expect(parsed.error).toBeNull();
			} finally {
				teardownEnv();
			}
		});

		it("returns error result on failure", async () => {
			setupEnv();
			try {
				const actionResult = { success: false, data: null, error: "No fan controller" };
				(mockSetFanTarget as any).mockResolvedValueOnce(actionResult);

				const server = createServer();
				const handler = getToolHandler(server, "set_fan_target");
				const result = await handler({ serial: "ABC123", target_temp: 250 }, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.success).toBe(false);
				expect(parsed.error).toBe("No fan controller");
			} finally {
				teardownEnv();
			}
		});
	});

	describe("set_fan_enabled tool", () => {
		it("enables the fan controller", async () => {
			setupEnv();
			try {
				const actionResult = { success: true, data: null, error: null };
				(mockSetFanEnabled as any).mockResolvedValueOnce(actionResult);

				const server = createServer();
				const handler = getToolHandler(server, "set_fan_enabled");
				const result = await handler({ serial: "ABC123", enabled: true }, {});

				expect(mockSetFanEnabled).toHaveBeenCalledWith("ABC123", true);
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.success).toBe(true);
			} finally {
				teardownEnv();
			}
		});

		it("disables the fan controller", async () => {
			setupEnv();
			try {
				const actionResult = { success: true, data: null, error: null };
				(mockSetFanEnabled as any).mockResolvedValueOnce(actionResult);

				const server = createServer();
				const handler = getToolHandler(server, "set_fan_enabled");
				const result = await handler({ serial: "ABC123", enabled: false }, {});

				expect(mockSetFanEnabled).toHaveBeenCalledWith("ABC123", false);
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.success).toBe(true);
			} finally {
				teardownEnv();
			}
		});
	});

	describe("get_firmware_status tool", () => {
		it("returns mixed update/no-update firmware status", async () => {
			setupEnv();
			try {
				(mockGetDevices as any).mockResolvedValueOnce([
					{ serial: "SMOKE1", label: "Smoker", type: "Smoke", firmware: "1.0.0" },
					{ serial: "SIG1", label: "Signals Unit", type: "Signals", firmware: "2.5.0" },
				]);
				(mockGetFirmwareInfo as any)
					.mockResolvedValueOnce({
						name: "Smoke",
						version: "1.1.0",
						location: "https://fw.example.com/smoke",
						md5: "abc123",
					})
					.mockResolvedValueOnce({
						name: "Signals",
						version: "2.5.0",
						location: "https://fw.example.com/signals",
						md5: "def456",
					});

				const server = createServer();
				const handler = getToolHandler(server, "get_firmware_status");
				const result = await handler({}, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed).toHaveLength(2);

				const smoke = parsed.find((d: any) => d.serial === "SMOKE1");
				expect(smoke.label).toBe("Smoker");
				expect(smoke.type).toBe("Smoke");
				expect(smoke.current).toBe("1.0.0");
				expect(smoke.latest).toBe("1.1.0");
				expect(smoke.updateAvailable).toBe(true);

				const signals = parsed.find((d: any) => d.serial === "SIG1");
				expect(signals.label).toBe("Signals Unit");
				expect(signals.type).toBe("Signals");
				expect(signals.current).toBe("2.5.0");
				expect(signals.latest).toBe("2.5.0");
				expect(signals.updateAvailable).toBe(false);
			} finally {
				teardownEnv();
			}
		});

		it("excludes devices without type or firmware", async () => {
			setupEnv();
			try {
				(mockGetDevices as any).mockResolvedValueOnce([
					{ serial: "SMOKE1", label: "Smoker", type: "Smoke", firmware: "1.0.0" },
					{ serial: "NO_TYPE", label: "Mystery", type: null, firmware: "1.0.0" },
					{ serial: "NO_FW", label: "Fresh", type: "Node", firmware: null },
				]);
				(mockGetFirmwareInfo as any).mockResolvedValueOnce({
					name: "Smoke",
					version: "1.0.0",
					location: "https://fw.example.com/smoke",
					md5: "abc123",
				});

				const server = createServer();
				const handler = getToolHandler(server, "get_firmware_status");
				const result = await handler({}, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed).toHaveLength(1);
				expect(parsed[0].serial).toBe("SMOKE1");
				expect(parsed.find((d: any) => d.serial === "NO_TYPE")).toBeUndefined();
				expect(parsed.find((d: any) => d.serial === "NO_FW")).toBeUndefined();
			} finally {
				teardownEnv();
			}
		});

		it("omits devices when getFirmwareInfo rejects for their type", async () => {
			setupEnv();
			try {
				(mockGetDevices as any).mockResolvedValueOnce([
					{ serial: "SMOKE1", label: null, type: "Smoke", firmware: "1.0.0" },
					{ serial: "RFX1", label: "RFX Unit", type: "RFX", firmware: "3.0.0" },
				]);
				(mockGetFirmwareInfo as any)
					.mockResolvedValueOnce({
						name: "Smoke",
						version: "1.0.0",
						location: "https://fw.example.com/smoke",
						md5: "abc123",
					})
					.mockRejectedValueOnce(new Error("Firmware info unavailable"));

				const server = createServer();
				const handler = getToolHandler(server, "get_firmware_status");
				const result = await handler({}, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed).toHaveLength(1);
				expect(parsed[0].serial).toBe("SMOKE1");
				expect(parsed[0].label).toBe("SMOKE1");
				expect(parsed[0].updateAvailable).toBe(false);
				expect(parsed.find((d: any) => d.serial === "RFX1")).toBeUndefined();
			} finally {
				teardownEnv();
			}
		});
	});

	describe("get_temperature_history tool", () => {
		it("returns the full reading series", async () => {
			setupEnv();
			try {
				(mockGetHistory as any).mockResolvedValueOnce({
					deviceId: "ABC123",
					readings: [
						{ value: 150, timestamp: "2026-07-01T10:00:00Z", units: "F" },
						{ value: 155, timestamp: "2026-07-01T10:05:00Z", units: "F" },
						{ value: 160, timestamp: "2026-07-01T10:10:00Z", units: "F" },
					],
				});

				const server = createServer();
				const handler = getToolHandler(server, "get_temperature_history");
				const result = await handler({ serial: "ABC123" }, {});

				expect(mockGetHistory).toHaveBeenCalledWith("ABC123");
				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.deviceId).toBe("ABC123");
				expect(parsed.readingCount).toBe(3);
				expect(parsed.readings).toHaveLength(3);
				expect(parsed.readings[0].value).toBe(150);
			} finally {
				teardownEnv();
			}
		});

		it("returns only the most recent N readings when limit is set", async () => {
			setupEnv();
			try {
				(mockGetHistory as any).mockResolvedValueOnce({
					deviceId: "ABC123",
					readings: [
						{ value: 150, timestamp: "2026-07-01T10:00:00Z", units: "F" },
						{ value: 155, timestamp: "2026-07-01T10:05:00Z", units: "F" },
						{ value: 160, timestamp: "2026-07-01T10:10:00Z", units: "F" },
					],
				});

				const server = createServer();
				const handler = getToolHandler(server, "get_temperature_history");
				const result = await handler({ serial: "ABC123", limit: 2 }, {});

				const parsed = JSON.parse(result.content[0].text);
				expect(parsed.readingCount).toBe(2);
				expect(parsed.readings).toHaveLength(2);
				// Most recent two, in chronological order
				expect(parsed.readings[0].value).toBe(155);
				expect(parsed.readings[1].value).toBe(160);
			} finally {
				teardownEnv();
			}
		});
	});

	describe("credential validation", () => {
		it("throws when THERMOWORKS_EMAIL is missing", async () => {
			resetClient();
			process.env = { ...originalEnv };
			delete process.env.THERMOWORKS_EMAIL;
			delete process.env.THERMOWORKS_PASSWORD;
			try {
				const server = createServer();
				const handler = getToolHandler(server, "get_devices");
				await expect(handler({}, {})).rejects.toThrow(
					"Missing credentials: set THERMOWORKS_EMAIL and THERMOWORKS_PASSWORD environment variables",
				);
			} finally {
				process.env = originalEnv;
				resetClient();
			}
		});
	});
});
