import { act, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceEvent, EventFilter } from "thermoworks-sdk";
import type { DeviceWithChannels, ThermoworksWebClient } from "../src/lib/api.ts";
import { useEvents } from "../src/hooks/useEvents.ts";
import { Events } from "../src/pages/Events.tsx";

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

function makeEvent(overrides: Partial<DeviceEvent> = {}): DeviceEvent {
	return {
		id: "evt-1",
		eventType: "Alarm",
		severity: 3,
		eventTime: new Date("2026-06-08T10:00:00Z"),
		deviceId: "ABC123",
		channelId: "1",
		accountId: "acct-1",
		valueBefore: "150°F",
		valueAfter: "200°F",
		groups: null,
		...overrides,
	};
}

const mockDevices: DeviceWithChannels[] = [
	{
		device: {
			serial: "ABC123",
			deviceId: null,
			label: "Smoker Probe",
			type: "Signals",
			device: null,
			status: "online",
			battery: 90,
			batteryState: null,
			wifiStrength: null,
			firmware: null,
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
		channels: [],
	},
];

function OutletWrapper({ client }: { client: ThermoworksWebClient }) {
	return <Outlet context={{ client }} />;
}

function renderEventsPage(client: ThermoworksWebClient) {
	return render(
		<MemoryRouter initialEntries={["/events"]}>
			<Routes>
				<Route element={<OutletWrapper client={client} />}>
					<Route path="events" element={<Events />} />
				</Route>
			</Routes>
		</MemoryRouter>,
	);
}

// ─── useEvents hook tests ────────────────────────────────────────────────────

describe("useEvents", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns empty data when client is null", () => {
		const { result } = renderHook(() => useEvents(null));

		expect(result.current.data).toEqual([]);
		expect(result.current.isLoading).toBe(false);
		expect(result.current.error).toBeNull();
		expect(result.current.lastUpdated).toBeNull();
	});

	it("fetches events when client is authenticated", async () => {
		const events = [makeEvent()];
		const client = createMockClient({
			getEvents: vi.fn().mockResolvedValue(events),
		});

		const { result } = renderHook(() => useEvents(client));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(result.current.data).toEqual(events);
		expect(result.current.error).toBeNull();
		expect(result.current.lastUpdated).toBeInstanceOf(Date);
	});

	it("passes filter to getEvents", async () => {
		const getEvents = vi.fn().mockResolvedValue([]);
		const client = createMockClient({ getEvents });
		const filter: EventFilter = { deviceId: "ABC", eventType: "Alarm", limit: 25 };

		renderHook(() => useEvents(client, filter));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(getEvents).toHaveBeenCalledWith(filter);
	});

	it("sets error state on failure", async () => {
		const client = createMockClient({
			getEvents: vi.fn().mockRejectedValue(new Error("Network error")),
		});

		const { result } = renderHook(() => useEvents(client));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(result.current.error).toBe("Network error");
		expect(result.current.data).toEqual([]);
	});

	it("polls at 30s intervals", async () => {
		const getEvents = vi.fn().mockResolvedValue([]);
		const client = createMockClient({ getEvents });

		renderHook(() => useEvents(client));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(getEvents).toHaveBeenCalledTimes(1);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(getEvents).toHaveBeenCalledTimes(2);
	});
});

// ─── Events page tests ───────────────────────────────────────────────────────

describe("Events page", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("renders the page header and filters", async () => {
		const client = createMockClient();
		renderEventsPage(client);

		expect(screen.getByRole("heading", { name: "Events" })).toBeInTheDocument();
		expect(screen.getByText("Device:")).toBeInTheDocument();
		expect(screen.getByText("Type:")).toBeInTheDocument();
	});

	it("shows empty state when no events", async () => {
		const client = createMockClient({
			getEvents: vi.fn().mockResolvedValue([]),
			getDevicesWithChannels: vi.fn().mockResolvedValue([]),
		});

		renderEventsPage(client);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(screen.getByText("No events found.")).toBeInTheDocument();
		expect(
			screen.getByText("Alarms, alerts, and status changes will appear here."),
		).toBeInTheDocument();
	});

	it("renders events with device label and type badge", async () => {
		const events = [
			makeEvent({ id: "e1", eventType: "Alarm", deviceId: "ABC123" }),
			makeEvent({
				id: "e2",
				eventType: "Low Battery Alert",
				deviceId: "ABC123",
				valueBefore: "15%",
				valueAfter: null,
			}),
		];
		const client = createMockClient({
			getEvents: vi.fn().mockResolvedValue(events),
			getDevicesWithChannels: vi.fn().mockResolvedValue(mockDevices),
		});

		renderEventsPage(client);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(screen.getByRole("list", { name: "Event history" })).toBeInTheDocument();
		// 2 in event rows + 1 in the device filter dropdown
		expect(screen.getAllByText("Smoker Probe")).toHaveLength(3);
		// "Alarm" appears in the type filter dropdown option AND as a badge
		expect(screen.getAllByText("Alarm").length).toBeGreaterThanOrEqual(2);
		expect(screen.getAllByText("Low Battery Alert").length).toBeGreaterThanOrEqual(1);
	});

	it("shows error state", async () => {
		const client = createMockClient({
			getEvents: vi.fn().mockRejectedValue(new Error("Server error")),
		});

		renderEventsPage(client);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText("Server error")).toBeInTheDocument();
	});

	it("populates device filter dropdown from loaded devices", async () => {
		const client = createMockClient({
			getEvents: vi.fn().mockResolvedValue([]),
			getDevicesWithChannels: vi.fn().mockResolvedValue(mockDevices),
		});

		renderEventsPage(client);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});

		const options = screen.getAllByRole("option");
		const deviceOption = options.find((o) => o.textContent === "Smoker Probe");
		expect(deviceOption).toBeInTheDocument();
	});
});
