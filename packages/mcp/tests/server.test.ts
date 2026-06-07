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
	const mockGetTemperatureGuide = vi.fn();

	class MockThermoworksCloud {
		close = mockClose;
		getDevices = mockGetDevices;
		getDevice = mockGetDevice;
		getAllDeviceChannels = mockGetAllDeviceChannels;
		getAverageTemperature = mockGetAverageTemperature;
		getEvents = mockGetEvents;
		getArchives = mockGetArchives;
		getTemperatureGuide = mockGetTemperatureGuide;
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
		mockGetTemperatureGuide,
	};
});

import {
	mockClose,
	mockGetAllDeviceChannels,
	mockGetArchives,
	mockGetAverageTemperature,
	mockGetDevice,
	mockGetDevices,
	mockGetEvents,
	mockGetTemperatureGuide,
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
