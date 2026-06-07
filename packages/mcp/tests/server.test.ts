import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the SDK client
const mockGetDevices = vi.fn();
const mockGetDevice = vi.fn();
const mockGetAllDeviceChannels = vi.fn();
const mockGetAverageTemperature = vi.fn();
const mockGetEvents = vi.fn();
const mockGetArchives = vi.fn();
const mockGetTemperatureGuide = vi.fn();
const mockClose = vi.fn();

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	return {
		...actual,
		ThermoworksCloud: class MockThermoworksCloud {
			getDevices = mockGetDevices;
			getDevice = mockGetDevice;
			getAllDeviceChannels = mockGetAllDeviceChannels;
			getAverageTemperature = mockGetAverageTemperature;
			getEvents = mockGetEvents;
			getArchives = mockGetArchives;
			getTemperatureGuide = mockGetTemperatureGuide;
			close = mockClose;
		},
	};
});

const { createServer } = await import("../src/server.js");

let client: Client;
let cleanup: () => Promise<void>;

async function setup() {
	const server = createServer({ email: "test@example.com", password: "secret" });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	const c = new Client({ name: "test-client", version: "1.0.0" });
	await server.connect(serverTransport);
	await c.connect(clientTransport);
	return {
		client: c,
		cleanup: async () => {
			await c.close();
			await server.close();
		},
	};
}

beforeEach(async () => {
	vi.clearAllMocks();
	const s = await setup();
	client = s.client;
	cleanup = s.cleanup;
});

afterEach(async () => {
	await cleanup();
	expect(mockClose).toHaveBeenCalledTimes(1);
});

describe("tool registration", () => {
	it("registers all 7 expected tools", async () => {
		const { tools } = await client.listTools();
		const names = tools.map((t) => t.name).sort();
		expect(names).toEqual([
			"get_archives",
			"get_average_temperature",
			"get_device",
			"get_device_channels",
			"get_devices",
			"get_events",
			"get_temperature_guide",
		]);
	});
});

describe("get_devices", () => {
	it("returns formatted device list", async () => {
		mockGetDevices.mockResolvedValue([
			{
				serial: "ABC123",
				label: "Smoker",
				type: "signals",
				status: "online",
				battery: 85,
				lastSeen: new Date("2026-01-01T00:00:00Z"),
			},
		]);

		const result = await client.callTool({ name: "get_devices", arguments: {} });
		const content = result.content as Array<{ type: string; text: string }>;
		const data = JSON.parse(content[0].text);
		expect(data).toHaveLength(1);
		expect(data[0].serial).toBe("ABC123");
		expect(data[0].label).toBe("Smoker");
		expect(data[0].status).toBe("online");
		expect(data[0].battery).toBe(85);
		expect(mockClose).not.toHaveBeenCalled();
	});

	it("returns sanitized MCP error when the SDK throws", async () => {
		mockGetDevices.mockRejectedValue(new Error("upstream unavailable"));

		const result = await client.callTool({ name: "get_devices", arguments: {} });
		const content = result.content as Array<{ type: string; text: string }>;

		expect(result.isError).toBe(true);
		expect(content[0].text).toContain("An unexpected error occurred");
	});
});

describe("get_device", () => {
	it("returns device details", async () => {
		mockGetDevice.mockResolvedValue({
			serial: "ABC123",
			label: "Smoker",
			type: "signals",
			status: "online",
			battery: 85,
			firmware: "1.2.3",
			lastSeen: new Date("2026-01-01T00:00:00Z"),
			sessionLabel: "Session 1",
			notes: "My smoker",
		});

		const result = await client.callTool({
			name: "get_device",
			arguments: { serial: "ABC123" },
		});
		const content = result.content as Array<{ type: string; text: string }>;
		const data = JSON.parse(content[0].text);
		expect(data.serial).toBe("ABC123");
		expect(data.firmware).toBe("1.2.3");
		expect(data.notes).toBe("My smoker");
	});
});

describe("get_device_channels", () => {
	it("returns channel readings with alarms", async () => {
		mockGetAllDeviceChannels.mockResolvedValue([
			{
				value: 225,
				units: "F",
				label: "Pit",
				status: "ok",
				alarmHigh: null,
				alarmLow: null,
				minimum: null,
				maximum: null,
			},
			{
				value: 165,
				units: "F",
				label: "Meat",
				status: "ok",
				alarmHigh: { enabled: true, alarming: false, value: 205 },
				alarmLow: null,
				minimum: null,
				maximum: null,
			},
		]);

		const result = await client.callTool({
			name: "get_device_channels",
			arguments: { serial: "ABC123" },
		});
		const content = result.content as Array<{ type: string; text: string }>;
		const data = JSON.parse(content[0].text);
		expect(data).toHaveLength(2);
		expect(data[0].label).toBe("Pit");
		expect(data[0].value).toBe(225);
		expect(data[1].alarmHigh.enabled).toBe(true);
	});
});

describe("get_average_temperature", () => {
	it("returns average when available", async () => {
		mockGetAverageTemperature.mockResolvedValue({ value: 195, units: "F" });

		const result = await client.callTool({
			name: "get_average_temperature",
			arguments: { serial: "ABC123" },
		});
		const content = result.content as Array<{ type: string; text: string }>;
		const data = JSON.parse(content[0].text);
		expect(data.value).toBe(195);
		expect(data.units).toBe("F");
	});

	it("returns message when no readings", async () => {
		mockGetAverageTemperature.mockResolvedValue(null);

		const result = await client.callTool({
			name: "get_average_temperature",
			arguments: { serial: "ABC123" },
		});
		const content = result.content as Array<{ type: string; text: string }>;
		expect(content[0].text).toBe("No temperature readings available");
	});
});

describe("get_events", () => {
	it("returns events", async () => {
		mockGetEvents.mockResolvedValue([
			{
				id: "evt1",
				eventType: "High Temperature",
				severity: 3,
				eventTime: new Date("2026-01-01T12:00:00Z"),
				deviceId: "ABC123",
				channelId: "ch1",
				valueBefore: "200",
				valueAfter: "250",
			},
		]);

		const result = await client.callTool({ name: "get_events", arguments: {} });
		const content = result.content as Array<{ type: string; text: string }>;
		const data = JSON.parse(content[0].text);
		expect(data).toHaveLength(1);
		expect(data[0].eventType).toBe("High Temperature");
	});
});

describe("get_archives", () => {
	it("returns archives for a device", async () => {
		mockGetArchives.mockResolvedValue([
			{
				id: "arch1",
				label: "Session 1",
				start: new Date("2026-01-01T10:00:00Z"),
				end: new Date("2026-01-01T14:00:00Z"),
				count: 100,
				type: "session",
				notes: "BBQ day",
			},
		]);

		const result = await client.callTool({
			name: "get_archives",
			arguments: { serial: "ABC123" },
		});
		const content = result.content as Array<{ type: string; text: string }>;
		const data = JSON.parse(content[0].text);
		expect(data).toHaveLength(1);
		expect(data[0].label).toBe("Session 1");
		expect(data[0].notes).toBe("BBQ day");
	});
});

describe("get_temperature_guide", () => {
	it("returns guide data", async () => {
		mockGetTemperatureGuide.mockResolvedValue({
			categories: [{ label: "Beef", icon: "🥩", pullWarning: null, warning: null }],
		});

		const result = await client.callTool({ name: "get_temperature_guide", arguments: {} });
		const content = result.content as Array<{ type: string; text: string }>;
		const data = JSON.parse(content[0].text);
		expect(data.categories[0].label).toBe("Beef");
	});
});
