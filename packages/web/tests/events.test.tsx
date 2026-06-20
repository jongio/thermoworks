import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import type { Archive, DeviceEvent, EventFilter } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEvents } from "../src/hooks/useEvents.ts";
import type { DeviceWithChannels, ThermoworksWebClient } from "../src/lib/api.ts";
import { Events } from "../src/pages/Events.tsx";

const observerInstances: MockIntersectionObserver[] = [];

class MockIntersectionObserver {
	readonly callback: IntersectionObserverCallback;
	readonly observe = vi.fn();
	readonly unobserve = vi.fn();
	readonly disconnect = vi.fn();

	constructor(callback: IntersectionObserverCallback) {
		this.callback = callback;
		observerInstances.push(this);
	}
}

globalThis.IntersectionObserver =
	MockIntersectionObserver as unknown as typeof IntersectionObserver;

function triggerIntersection(isIntersecting = true) {
	const observer = observerInstances.at(-1);
	const target = observer?.observe.mock.calls.at(-1)?.[0];
	if (!observer || !target) {
		throw new Error("No observed activity feed sentinel found.");
	}

	observer.callback(
		[{ isIntersecting, target } as IntersectionObserverEntry],
		observer as unknown as IntersectionObserver,
	);
}

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
		getArchives: vi.fn().mockResolvedValue([]),
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

function makeArchive(overrides: Partial<Archive> = {}): Archive {
	return {
		id: "archive-1",
		start: new Date("2026-06-08T11:00:00Z"),
		end: new Date("2026-06-08T12:30:00Z"),
		count: 2,
		type: "session",
		label: "Brisket Cook",
		deviceLabel: "Smoker Probe",
		notes: null,
		createdOn: new Date("2026-06-08T10:55:00Z"),
		public: false,
		publicLink: null,
		filename: null,
		channels: [],
		...overrides,
	};
}

function makeEvents(count: number, deviceId = "ABC123"): DeviceEvent[] {
	return Array.from({ length: count }, (_, index) =>
		makeEvent({
			id: `evt-${count}-${index}`,
			eventType: index % 2 === 0 ? "Alarm" : "Low Battery Alert",
			deviceId,
			eventTime: new Date(Date.UTC(2026, 5, 8, 12, 0 - index)),
		}),
	);
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
	{
		device: {
			serial: "XYZ999",
			deviceId: null,
			label: "Backyard Grill",
			type: "Smoke",
			device: null,
			status: "online",
			battery: 75,
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
					<Route path="device/:serial" element={<div>Device detail page</div>} />
				</Route>
			</Routes>
		</MemoryRouter>,
	);
}

describe("useEvents", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		observerInstances.length = 0;
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("returns empty data when client is null", () => {
		const { result } = renderHook(() => useEvents(null));

		expect(result.current.data).toEqual([]);
		expect(result.current.isLoading).toBe(false);
		expect(result.current.error).toBeNull();
		expect(result.current.lastUpdated).toBeNull();
		expect(result.current.hasMore).toBe(false);
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

	it("polls at 30s intervals and prepends new events", async () => {
		const firstBatch = [
			makeEvent({ id: "evt-2", eventTime: new Date("2026-06-08T10:01:00Z") }),
			makeEvent({ id: "evt-1", eventTime: new Date("2026-06-08T10:00:00Z") }),
		];
		const refreshedBatch = [
			makeEvent({ id: "evt-3", eventTime: new Date("2026-06-08T10:02:00Z") }),
			...firstBatch,
		];
		const getEvents = vi
			.fn()
			.mockResolvedValueOnce(firstBatch)
			.mockResolvedValueOnce(refreshedBatch);
		const client = createMockClient({ getEvents });

		const { result } = renderHook(() => useEvents(client));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(result.current.data.map((event) => event.id)).toEqual(["evt-2", "evt-1"]);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(getEvents).toHaveBeenCalledTimes(2);
		expect(result.current.data.map((event) => event.id)).toEqual(["evt-3", "evt-2", "evt-1"]);
	});

	it("loads more events by increasing the page size", async () => {
		vi.useRealTimers();

		const getEvents = vi
			.fn()
			.mockImplementation(async (filter?: EventFilter) => makeEvents(filter?.limit ?? 200));
		const client = createMockClient({ getEvents });

		const { result } = renderHook(() => useEvents(client, { limit: 200 }));

		await waitFor(() => {
			expect(getEvents).toHaveBeenLastCalledWith({ limit: 200 });
		});
		expect(result.current.hasMore).toBe(true);

		act(() => {
			void result.current.loadMore();
		});

		await waitFor(() => {
			expect(getEvents).toHaveBeenLastCalledWith({ limit: 400 });
			expect(result.current.data).toHaveLength(400);
		});
	});
});

describe("Events page", () => {
	beforeEach(() => {
		observerInstances.length = 0;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders the page header and filters", async () => {
		const client = createMockClient();
		renderEventsPage(client);

		await waitFor(() => {
			expect(client.getEvents).toHaveBeenCalled();
		});

		expect(screen.getByRole("heading", { name: "Activity" })).toBeInTheDocument();
		expect(screen.getByText("Device:")).toBeInTheDocument();
		expect(screen.getByText("Type:")).toBeInTheDocument();
	});

	it("shows empty state when no activity", async () => {
		const client = createMockClient({
			getEvents: vi.fn().mockResolvedValue([]),
			getDevicesWithChannels: vi.fn().mockResolvedValue([]),
			getArchives: vi.fn().mockResolvedValue([]),
		});

		renderEventsPage(client);

		expect(await screen.findByText("No activity found.")).toBeInTheDocument();
		expect(
			screen.getByText("Events, alarms, and session activity will appear here."),
		).toBeInTheDocument();
	});

	it("renders a unified timeline with event and session activity", async () => {
		const getArchives = vi.fn().mockResolvedValue([makeArchive()]);
		const client = createMockClient({
			getEvents: vi
				.fn()
				.mockResolvedValue([makeEvent({ id: "evt-1", eventType: "Alarm", deviceId: "ABC123" })]),
			getDevicesWithChannels: vi.fn().mockResolvedValue(mockDevices.slice(0, 1)),
			getArchives,
		});

		renderEventsPage(client);

		expect(await screen.findByText("Started Brisket Cook")).toBeInTheDocument();
		expect(getArchives).toHaveBeenCalledWith("ABC123", 10);

		expect(screen.getByRole("list", { name: "Activity feed" })).toBeInTheDocument();
		expect(screen.getAllByText("Smoker Probe").length).toBeGreaterThanOrEqual(2);
		expect(screen.getByRole("option", { name: "Session Started" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "Session Ended" })).toBeInTheDocument();
		expect(screen.getByText("Started Brisket Cook")).toBeInTheDocument();
		expect(screen.getAllByText("Alarm").length).toBeGreaterThanOrEqual(1);
	});

	it("keeps filtering working with combined activity types", async () => {
		const client = createMockClient({
			getEvents: vi
				.fn()
				.mockResolvedValue([makeEvent({ id: "evt-1", eventType: "Alarm", deviceId: "ABC123" })]),
			getDevicesWithChannels: vi.fn().mockResolvedValue(mockDevices.slice(0, 1)),
			getArchives: vi.fn().mockResolvedValue([makeArchive()]),
		});

		renderEventsPage(client);

		expect(await screen.findByText("Started Brisket Cook")).toBeInTheDocument();

		fireEvent.change(screen.getByLabelText("Type:"), {
			target: { value: "Session Started" },
		});

		expect(screen.getByText("Started Brisket Cook")).toBeInTheDocument();
		expect(screen.queryByText("150°F → 200°F")).not.toBeInTheDocument();
	});

	it("navigates to the device detail page when an activity row is clicked", async () => {
		const client = createMockClient({
			getEvents: vi
				.fn()
				.mockResolvedValue([makeEvent({ id: "evt-1", eventType: "Alarm", deviceId: "ABC123" })]),
			getDevicesWithChannels: vi.fn().mockResolvedValue(mockDevices.slice(0, 1)),
			getArchives: vi.fn().mockResolvedValue([]),
		});

		renderEventsPage(client);

		expect(await screen.findByRole("button", { name: /alarm/i })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /alarm/i }));

		expect(screen.getByText("Device detail page")).toBeInTheDocument();
	});

	it("loads more activity when the infinite scroll sentinel intersects", async () => {
		const getEvents = vi
			.fn()
			.mockImplementation(async (filter?: EventFilter) => makeEvents(filter?.limit ?? 200));
		const client = createMockClient({
			getEvents,
			getDevicesWithChannels: vi.fn().mockResolvedValue(mockDevices.slice(0, 1)),
			getArchives: vi.fn().mockResolvedValue([]),
		});

		renderEventsPage(client);

		await waitFor(() => {
			expect(getEvents).toHaveBeenCalledWith({ limit: 200 });
		});

		// Wait for IntersectionObserver to be registered before triggering
		await waitFor(() => {
			expect(observerInstances.length).toBeGreaterThan(0);
		});

		await act(async () => {
			triggerIntersection();
		});

		await waitFor(() => {
			expect(getEvents).toHaveBeenLastCalledWith({ limit: 400 });
		});
	});

	it("shows error state", async () => {
		const client = createMockClient({
			getEvents: vi.fn().mockRejectedValue(new Error("Server error")),
		});

		renderEventsPage(client);

		expect(await screen.findByRole("alert")).toBeInTheDocument();
		expect(screen.getByText("Server error")).toBeInTheDocument();
	});

	it("populates the device filter dropdown from loaded devices", async () => {
		const client = createMockClient({
			getEvents: vi.fn().mockResolvedValue([]),
			getDevicesWithChannels: vi.fn().mockResolvedValue(mockDevices),
		});

		renderEventsPage(client);

		expect(await screen.findByRole("option", { name: "Smoker Probe" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "Backyard Grill" })).toBeInTheDocument();
	});
});
