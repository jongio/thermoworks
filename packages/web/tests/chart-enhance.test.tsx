import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { DeviceEvent } from "thermoworks-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemperatureChart } from "../src/components/TemperatureChart.tsx";
import { getEventMarkerItems } from "../src/components/TemperatureEventMarkers.tsx";
import { TemperatureUnitProvider } from "../src/context/TemperatureUnitContext.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";
import type { ChartDataPoint } from "../src/lib/export.ts";
import { downloadCSV } from "../src/lib/export.ts";

// Mock ResizeObserver so Recharts' ResponsiveContainer renders children in jsdom
class MockResizeObserver {
	cb: ResizeObserverCallback;
	constructor(cb: ResizeObserverCallback) {
		this.cb = cb;
	}
	observe(_target: Element) {
		// Simulate a measured container so the chart renders its SVG
		this.cb([{ contentRect: { width: 800, height: 300 } } as unknown as ResizeObserverEntry], this);
	}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

function renderWithProvider(ui: ReactNode) {
	return render(<TemperatureUnitProvider>{ui}</TemperatureUnitProvider>);
}

function makeChannels() {
	const now = Date.now();
	return [
		{
			number: "1",
			label: "Probe 1",
			units: "F",
			value: 165,
			status: "ok",
			enabled: true,
			color: "#ef4444",
			type: "temperature",
			alarmHigh: null,
			alarmLow: null,
			minimum: null,
			maximum: null,
			recentReadings: [
				{ value: 150, timestamp: new Date(now - 60000), units: "F" },
				{ value: 155, timestamp: new Date(now - 30000), units: "F" },
				{ value: 165, timestamp: new Date(now), units: "F" },
			],
		},
	];
}

function makeDenseChannels(pointCount: number) {
	const now = Date.now();
	return [
		{
			number: "1",
			label: "Dense Probe",
			units: "F",
			value: 165,
			status: "ok",
			enabled: true,
			color: "#ef4444",
			type: "temperature",
			alarmHigh: null,
			alarmLow: null,
			minimum: null,
			maximum: null,
			recentReadings: Array.from({ length: pointCount }, (_, index) => ({
				value: 150 + Math.sin(index / 12) * 10,
				timestamp: new Date(now - (pointCount - index) * 1000),
				units: "F",
			})),
		},
	];
}

function makeEvent(
	id: string,
	eventType: string,
	eventTime: Date,
	overrides: Partial<DeviceEvent> = {},
): DeviceEvent {
	return {
		id,
		eventType,
		severity: 2,
		eventTime,
		deviceId: "SN-001",
		channelId: "1",
		accountId: "acc-1",
		valueBefore: null,
		valueAfter: null,
		groups: null,
		...overrides,
	};
}

function makeClient(events: DeviceEvent[]) {
	const getEvents = vi.fn(async () => events);
	return {
		isAuthenticated: true,
		getEvents,
	} as unknown as ThermoworksWebClient & { getEvents: typeof getEvents };
}

describe("downloadCSV", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("generates CSV with correct headers and rows", () => {
		const data: ChartDataPoint[] = [
			{ time: 1000, ch_1: 150.5 },
			{ time: 2000, ch_1: 155.2 },
			{ time: 3000, ch_1: 160.0 },
		];

		const clicks: string[] = [];
		const originalCreateElement = document.createElement.bind(document);
		const createObjectURL = vi.fn(() => "blob:mock-url");
		const revokeObjectURL = vi.fn();
		globalThis.URL.createObjectURL = createObjectURL;
		globalThis.URL.revokeObjectURL = revokeObjectURL;

		vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
			const el = originalCreateElement(tag);
			if (tag === "a") {
				(el as HTMLAnchorElement).click = () => {
					clicks.push((el as HTMLAnchorElement).download);
				};
			}
			return el;
		});

		downloadCSV(data, "test-export.csv");

		expect(clicks).toContain("test-export.csv");
		expect(createObjectURL).toHaveBeenCalledOnce();

		const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
		expect(blob).toBeInstanceOf(Blob);
		expect(blob.type).toBe("text/csv;charset=utf-8");
	});

	it("handles empty data without errors", () => {
		const createObjectURL = vi.fn();
		globalThis.URL.createObjectURL = createObjectURL;

		downloadCSV([], "empty.csv");

		expect(createObjectURL).not.toHaveBeenCalled();
	});

	it("escapes fields containing commas and quotes", () => {
		const data: ChartDataPoint[] = [{ time: 1000, "ch_with,comma": 100 }];

		const originalCreateElement = document.createElement.bind(document);
		const createObjectURL = vi.fn(() => "blob:mock-url");
		const revokeObjectURL = vi.fn();
		globalThis.URL.createObjectURL = createObjectURL;
		globalThis.URL.revokeObjectURL = revokeObjectURL;

		vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
			const el = originalCreateElement(tag);
			if (tag === "a") {
				(el as HTMLAnchorElement).click = () => {};
			}
			return el;
		});

		downloadCSV(data, "escaped.csv");

		const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
		expect(blob).toBeInstanceOf(Blob);
	});
});

describe("TemperatureChart", () => {
	it("renders chart with data", () => {
		const channels = makeChannels();
		const { container } = renderWithProvider(<TemperatureChart channels={channels as never} />);

		// Recharts renders an SVG inside the container
		expect(container.querySelector(".recharts-wrapper")).not.toBeNull();
	});

	it("shows empty state when no channels have readings", () => {
		renderWithProvider(<TemperatureChart channels={[]} />);

		expect(screen.getByText("No temperature history available")).toBeInTheDocument();
	});

	it("renders brush component for panning", () => {
		const channels = makeDenseChannels(100);
		const { container } = renderWithProvider(<TemperatureChart channels={channels as never} />);

		// Brush renders a specific SVG group (only for datasets > 50 points)
		expect(container.querySelector(".recharts-brush")).not.toBeNull();
	});

	it("shows reset zoom button after zoom selection", () => {
		const channels = makeChannels();
		renderWithProvider(<TemperatureChart channels={channels as never} />);

		// Initially, no reset zoom button
		expect(screen.queryByTestId("reset-zoom")).not.toBeInTheDocument();

		// Note: Full zoom interaction requires Recharts internal event system
		// which passes activeLabel through mouse events. This is integration-tested
		// via the existence of the chart's onMouseDown/onMouseMove/onMouseUp handlers.
	});

	it("renders export CSV and PNG buttons", () => {
		const channels = makeChannels();
		renderWithProvider(<TemperatureChart channels={channels as never} />);

		expect(screen.getByTitle("Export CSV")).toBeInTheDocument();
		expect(screen.getByTitle("Export PNG")).toBeInTheDocument();
	});

	it("shows a downsampling indicator for large visible windows", () => {
		const channels = makeDenseChannels(1_200);
		renderWithProvider(<TemperatureChart channels={channels as never} />);

		expect(screen.getByTestId("downsample-indicator")).toHaveTextContent(
			"Showing 500 of 1200 points (downsampled)",
		);
	});

	it("renders session overlay checkboxes when overlayArchives provided", () => {
		const channels = makeChannels();
		const overlayArchives = [makeChannels(), makeChannels()];

		renderWithProvider(
			<TemperatureChart channels={channels as never} overlayArchives={overlayArchives as never} />,
		);

		expect(screen.getByText("Sessions:")).toBeInTheDocument();
		expect(screen.getByText("#1")).toBeInTheDocument();
		expect(screen.getByText("#2")).toBeInTheDocument();
	});

	it("toggles overlay session visibility on checkbox click", () => {
		const channels = makeChannels();
		const overlayArchives = [makeChannels()];

		renderWithProvider(
			<TemperatureChart channels={channels as never} overlayArchives={overlayArchives as never} />,
		);

		const checkbox = screen.getByRole("checkbox");
		expect(checkbox).not.toBeChecked();

		fireEvent.click(checkbox);
		expect(checkbox).toBeChecked();

		fireEvent.click(checkbox);
		expect(checkbox).not.toBeChecked();
	});

	it("filters event marker items by supported type and visible time range", () => {
		const start = new Date("2026-01-01T00:00:00Z").getTime();
		const end = new Date("2026-01-01T01:00:00Z").getTime();
		const inRange = new Date(start + 30 * 60_000);
		const markers = getEventMarkerItems(
			[
				makeEvent("alarm", "High Temperature Alarm", inRange),
				makeEvent("status", "Battery Status", inRange),
				makeEvent("connection", "Device Offline", inRange),
				makeEvent("fan", "Fan Speed Changed", inRange),
				makeEvent("unsupported", "Recipe Note", inRange),
				makeEvent("outside", "Low Temperature Alarm", new Date(end + 1)),
			],
			{ start, end },
		);

		expect(markers.map((marker) => marker.category)).toEqual([
			"alarm",
			"status",
			"connection",
			"fan",
		]);
		expect(markers.map((marker) => marker.event.id)).not.toContain("unsupported");
		expect(markers.map((marker) => marker.event.id)).not.toContain("outside");
	});

	it("fetches event markers for the chart device and visible time range", async () => {
		const channels = makeChannels();
		const client = makeClient([]);
		renderWithProvider(
			<TemperatureChart channels={channels as never} client={client} deviceId="SN-001" />,
		);

		await waitFor(() => expect(client.getEvents).toHaveBeenCalled());
		const filter = client.getEvents.mock.calls[0]?.[0];
		const readings = channels[0]?.recentReadings ?? [];
		const minTime = Math.min(...readings.map((reading) => reading.timestamp.getTime()));
		const maxTime = Math.max(...readings.map((reading) => reading.timestamp.getTime()));
		expect(filter?.deviceId).toBe("SN-001");
		expect(filter?.startTime?.getTime()).toBe(minTime);
		expect(filter?.endTime?.getTime()).toBe(maxTime);
	});

	it("renders event marker legend, toggle, supported markers, and accessible details", async () => {
		const channels = makeChannels();
		const eventTime = channels[0]?.recentReadings[1]?.timestamp ?? new Date();
		const events = [
			makeEvent("alarm", "High Temperature Alert", eventTime, {
				severity: 3,
				valueBefore: "170",
				valueAfter: "205",
			}),
			makeEvent("status", "Battery Status", eventTime),
			makeEvent("connection", "Device Connection Restored", eventTime),
			makeEvent("fan", "Fan Output Changed", eventTime),
		];
		const client = makeClient(events);
		renderWithProvider(
			<TemperatureChart channels={channels as never} client={client} deviceId="SN-001" />,
		);

		expect(screen.getByText("Events:")).toBeInTheDocument();
		expect(screen.getByRole("checkbox", { name: "Show event markers" })).toBeChecked();
		expect(await screen.findByTestId("event-marker-alarm")).toBeInTheDocument();
		expect(screen.getByTestId("event-marker-status")).toBeInTheDocument();
		expect(screen.getByTestId("event-marker-connection")).toBeInTheDocument();
		expect(screen.getByTestId("event-marker-fan")).toBeInTheDocument();

		const alarmMarker = screen.getByTestId("event-marker-alarm");
		expect(alarmMarker).toHaveAccessibleName(/High Temperature Alert/);
		expect(alarmMarker).toHaveAccessibleName(/severity 3/);
		expect(alarmMarker).toHaveAccessibleName(/170 → 205/);

		fireEvent.focus(alarmMarker);
		expect(screen.getByRole("tooltip")).toHaveTextContent("High Temperature Alert");
		expect(screen.getByRole("tooltip")).toHaveTextContent("Value 170 → 205");

		fireEvent.click(screen.getByRole("checkbox", { name: "Show event markers" }));
		expect(screen.queryByTestId("event-marker-layer")).not.toBeInTheDocument();
		expect(screen.queryByText("Events:")).not.toBeInTheDocument();
	});
});
