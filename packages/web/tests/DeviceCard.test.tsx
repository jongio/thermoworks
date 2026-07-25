import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { DeviceCard } from "../src/components/DeviceCard.tsx";
import { TemperatureUnitProvider } from "../src/context/TemperatureUnitContext.tsx";
import type { DeviceWithChannels, ThermoworksWebClient } from "../src/lib/api.ts";

// Mock the useArchiveData hook to avoid real API calls
vi.mock("../src/hooks/useArchiveData.ts", () => ({
	useArchiveData: () => ({
		archives: [],
		isLoading: false,
		error: null,
		refresh: vi.fn(),
	}),
}));

// Mock the lazy-loaded TemperatureChart
vi.mock("../src/components/TemperatureChart", () => ({
	default: () => <div data-testid="temperature-chart">Chart</div>,
}));

function makeMockClient(): ThermoworksWebClient {
	return { isAuthenticated: true } as unknown as ThermoworksWebClient;
}

function renderWithProvider(ui: ReactNode) {
	return render(
		<MemoryRouter>
			<TemperatureUnitProvider>{ui}</TemperatureUnitProvider>
		</MemoryRouter>,
	);
}

function makeDevice(overrides: Partial<DeviceWithChannels["device"]> = {}): DeviceWithChannels {
	return {
		device: {
			serial: "TW-001",
			deviceId: "dev-1",
			label: "Kitchen Probe",
			type: "ThermaQ WiFi",
			device: "thermaq",
			status: "online",
			battery: 85,
			batteryState: null,
			wifiStrength: -42,
			firmware: "2.1.0",
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
			...overrides,
		},
		channels: [
			{
				value: 72.5,
				units: "F",
				label: "Probe 1",
				status: "ok",
				type: "temperature",
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
	};
}

describe("DeviceCard", () => {
	it("renders device name, type, status, and battery", () => {
		const item = makeDevice();
		renderWithProvider(<DeviceCard item={item} client={makeMockClient()} />);

		expect(screen.getByText("Kitchen Probe")).toBeInTheDocument();
		expect(screen.getByText("ThermaQ WiFi")).toBeInTheDocument();
		expect(screen.getByText("Online")).toBeInTheDocument();
		expect(screen.getByText("85%")).toBeInTheDocument();
	});

	it("falls back to serial when label is null", () => {
		const item = makeDevice({ label: null });
		renderWithProvider(<DeviceCard item={item} client={makeMockClient()} />);

		// Serial shows as the heading title when label is null
		const heading = screen.getByRole("heading", { level: 3 });
		expect(heading).toHaveTextContent("TW-001");
	});

	it("renders channel readings", () => {
		const item = makeDevice();
		renderWithProvider(<DeviceCard item={item} client={makeMockClient()} />);

		expect(screen.getByText("Probe 1")).toBeInTheDocument();
		expect(screen.getByText("72.5°F")).toBeInTheDocument();
	});

	it("shows alarm-high styling when channel has high alarm", () => {
		const item: DeviceWithChannels = {
			...makeDevice(),
			channels: [
				{
					value: 200,
					units: "F",
					label: "Hot Probe",
					status: "alarm",
					type: "temperature",
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
					alarmHigh: {
						enabled: true,
						alarming: true,
						muted: null,
						value: 180,
						units: "F",
						lastNotified: null,
					},
					alarmLow: null,
					minimum: null,
					maximum: null,
				},
			],
		};
		renderWithProvider(<DeviceCard item={item} client={makeMockClient()} />);

		const reading = screen.getByText("200.0°F");
		expect(reading).toHaveClass("text-alarm-high");
	});

	it("shows alarm-low styling when channel has low alarm", () => {
		const item: DeviceWithChannels = {
			...makeDevice(),
			channels: [
				{
					value: 28,
					units: "F",
					label: "Cold Probe",
					status: "alarm",
					type: "temperature",
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
					alarmLow: {
						enabled: true,
						alarming: true,
						muted: null,
						value: 32,
						units: "F",
						lastNotified: null,
					},
					minimum: null,
					maximum: null,
				},
			],
		};
		renderWithProvider(<DeviceCard item={item} client={makeMockClient()} />);

		const reading = screen.getByText("28.0°F");
		expect(reading).toHaveClass("text-alarm-low");
	});

	it("Show History button toggles chart visibility", () => {
		const item = makeDevice();
		renderWithProvider(<DeviceCard item={item} client={makeMockClient()} />);

		const btn = screen.getByRole("button", { name: /show history/i });
		expect(btn).toBeInTheDocument();

		fireEvent.click(btn);
		expect(screen.getByRole("button", { name: /hide history/i })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /hide history/i }));
		expect(screen.getByRole("button", { name: /show history/i })).toBeInTheDocument();
	});

	it("handles device with no channels gracefully", () => {
		const item: DeviceWithChannels = {
			...makeDevice(),
			channels: [],
		};
		renderWithProvider(<DeviceCard item={item} client={makeMockClient()} />);

		expect(screen.getByText("No active channels")).toBeInTheDocument();
	});

	it("hides disabled channels", () => {
		const item: DeviceWithChannels = {
			...makeDevice(),
			channels: [
				{
					value: 72.5,
					units: "F",
					label: "Active",
					status: "ok",
					type: "temperature",
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
				{
					value: 60,
					units: "F",
					label: "Disabled",
					status: "ok",
					type: "temperature",
					number: "2",
					enabled: false,
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
		};
		renderWithProvider(<DeviceCard item={item} client={makeMockClient()} />);

		expect(screen.getByText("Active")).toBeInTheDocument();
		expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
	});

	it("shows stalling badge when rateOfChange is near zero", () => {
		const item: DeviceWithChannels = {
			...makeDevice(),
			channels: [
				{
					value: 155,
					units: "F",
					label: "Pit",
					status: "ok",
					type: "temperature",
					number: "1",
					enabled: true,
					color: null,
					lastSeen: null,
					lastTelemetrySaved: null,
					lastEventId: null,
					showAvgTemp: null,
					estimatedAlarmStatus: null,
					rateOfChange: 0.2,
					rateOfChangeUnit: "/5min",
					alarmHigh: null,
					alarmLow: null,
					minimum: null,
					maximum: null,
				},
			],
		};
		renderWithProvider(<DeviceCard item={item} client={makeMockClient()} />);
		expect(screen.getByText("Stalling")).toBeInTheDocument();
	});

	it("shows rapid rising badge when rateOfChange exceeds threshold", () => {
		const item: DeviceWithChannels = {
			...makeDevice(),
			channels: [
				{
					value: 180,
					units: "F",
					label: "Pit",
					status: "ok",
					type: "temperature",
					number: "1",
					enabled: true,
					color: null,
					lastSeen: null,
					lastTelemetrySaved: null,
					lastEventId: null,
					showAvgTemp: null,
					estimatedAlarmStatus: null,
					rateOfChange: 8,
					rateOfChangeUnit: "/5min",
					alarmHigh: null,
					alarmLow: null,
					minimum: null,
					maximum: null,
				},
			],
		};
		renderWithProvider(<DeviceCard item={item} client={makeMockClient()} />);
		expect(screen.getByRole("status", { name: /rising fast/i })).toBeInTheDocument();
	});

	it("shows rapid falling badge when rateOfChange is negative and exceeds threshold", () => {
		const item: DeviceWithChannels = {
			...makeDevice(),
			channels: [
				{
					value: 120,
					units: "F",
					label: "Pit",
					status: "ok",
					type: "temperature",
					number: "1",
					enabled: true,
					color: null,
					lastSeen: null,
					lastTelemetrySaved: null,
					lastEventId: null,
					showAvgTemp: null,
					estimatedAlarmStatus: null,
					rateOfChange: -6,
					rateOfChangeUnit: "/5min",
					alarmHigh: null,
					alarmLow: null,
					minimum: null,
					maximum: null,
				},
			],
		};
		renderWithProvider(<DeviceCard item={item} client={makeMockClient()} />);
		expect(screen.getByRole("status", { name: /falling fast/i })).toBeInTheDocument();
	});

	it("does not show stall badge when rateOfChange is null", () => {
		const item = makeDevice(); // default has rateOfChange: null
		renderWithProvider(<DeviceCard item={item} client={makeMockClient()} />);
		expect(screen.queryByText("Stalling")).not.toBeInTheDocument();
		expect(screen.queryByRole("status", { name: /rising fast/i })).not.toBeInTheDocument();
	});

	it("does not show badge when rateOfChange is between stall and rapid thresholds", () => {
		const item: DeviceWithChannels = {
			...makeDevice(),
			channels: [
				{
					value: 160,
					units: "F",
					label: "Pit",
					status: "ok",
					type: "temperature",
					number: "1",
					enabled: true,
					color: null,
					lastSeen: null,
					lastTelemetrySaved: null,
					lastEventId: null,
					showAvgTemp: null,
					estimatedAlarmStatus: null,
					rateOfChange: 2.5,
					rateOfChangeUnit: "/5min",
					alarmHigh: null,
					alarmLow: null,
					minimum: null,
					maximum: null,
				},
			],
		};
		renderWithProvider(<DeviceCard item={item} client={makeMockClient()} />);
		expect(screen.queryByText("Stalling")).not.toBeInTheDocument();
		expect(screen.queryByRole("status", { name: /rising fast/i })).not.toBeInTheDocument();
	});
});
