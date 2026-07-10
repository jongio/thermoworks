import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceWithChannels } from "../src/lib/api.ts";
import { PitDisplay } from "../src/pages/PitDisplay.tsx";

// Track mock state across tests
const mockIsAuthenticated = true;
let mockDevicesData: DeviceWithChannels[] = [];
let mockDevicesLoading = false;
let mockDevicesError: string | null = null;

vi.mock("../src/lib/api.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/lib/api.ts")>();
	return {
		...actual,
		ThermoworksWebClient: class {
			get isAuthenticated() {
				return mockIsAuthenticated;
			}
		},
	};
});

vi.mock("../src/hooks/useDevices.ts", () => ({
	useDevices: () => ({
		data: mockDevicesData,
		isLoading: mockDevicesLoading,
		error: mockDevicesError,
		lastUpdated: new Date(),
		isFromCache: false,
		refresh: vi.fn(),
	}),
}));

vi.mock("../src/hooks/useSubscription.ts", () => ({
	useSubscription: () => ({
		mode: "stream" as const,
		intervalMs: 2000,
		isStreaming: true,
		switchMode: vi.fn(),
		toggleMode: vi.fn(),
	}),
}));

function makeDevice(
	serial: string,
	label: string,
	channels: DeviceWithChannels["channels"],
): DeviceWithChannels {
	return {
		device: {
			serial,
			deviceId: `dev-${serial}`,
			label,
			type: "Signals",
			device: "signals",
			status: "online",
			battery: 90,
			batteryState: null,
			wifiStrength: -40,
			firmware: "3.0.0",
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
		channels,
	};
}

function makeChannel(
	label: string,
	value: number | null,
	options: {
		alarmHigh?: boolean;
		alarmLow?: boolean;
		highTarget?: number;
		lowTarget?: number;
		enabled?: boolean;
	} = {},
): DeviceWithChannels["channels"][number] {
	return {
		value,
		units: "F",
		label,
		status: options.alarmHigh || options.alarmLow ? "alarm" : "ok",
		type: "temperature",
		number: "1",
		enabled: options.enabled ?? true,
		color: null,
		lastSeen: null,
		lastTelemetrySaved: null,
		lastEventId: null,
		showAvgTemp: null,
		estimatedAlarmStatus: null,
		rateOfChange: null,
		rateOfChangeUnit: null,
		alarmHigh:
			options.alarmHigh || options.highTarget != null
				? {
						enabled: true,
						alarming: options.alarmHigh ?? false,
						muted: null,
						value: options.highTarget ?? 200,
						units: "F",
						lastNotified: null,
					}
				: null,
		alarmLow:
			options.alarmLow || options.lowTarget != null
				? {
						enabled: true,
						alarming: options.alarmLow ?? false,
						muted: null,
						value: options.lowTarget ?? 32,
						units: "F",
						lastNotified: null,
					}
				: null,
		minimum: null,
		maximum: null,
	};
}

function renderPitDisplay() {
	return render(
		<MemoryRouter initialEntries={["/pit"]}>
			<PitDisplay />
		</MemoryRouter>,
	);
}

describe("PitDisplay", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it("shows loading state when no data yet", () => {
		mockDevicesData = [];
		mockDevicesLoading = true;
		mockDevicesError = null;
		renderPitDisplay();

		expect(screen.getByText("Loading devices...")).toBeInTheDocument();
	});

	it("shows error state when fetch fails with no cached data", () => {
		mockDevicesData = [];
		mockDevicesLoading = false;
		mockDevicesError = "Network timeout";
		renderPitDisplay();

		expect(screen.getByText("Failed to load devices")).toBeInTheDocument();
		expect(screen.getByText("Network timeout")).toBeInTheDocument();
		expect(screen.getByText("Return to Dashboard")).toBeInTheDocument();
	});

	it("shows empty state when no active channels", () => {
		mockDevicesData = [makeDevice("TW-001", "Smoker", [])];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		expect(screen.getByText("No active channels")).toBeInTheDocument();
	});

	it("renders channel temperatures in grid for small number of channels", () => {
		mockDevicesData = [
			makeDevice("TW-001", "Smoker", [makeChannel("Pit", 225), makeChannel("Meat", 165)]),
		];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		// Device name appears once per channel tile
		expect(screen.getAllByText("Smoker")).toHaveLength(2);
		expect(screen.getByText("Pit")).toBeInTheDocument();
		expect(screen.getByText("225.0°F")).toBeInTheDocument();
		expect(screen.getByText("Meat")).toBeInTheDocument();
		expect(screen.getByText("165.0°F")).toBeInTheDocument();
	});

	it("shows device name from label, falls back to serial", () => {
		mockDevicesData = [makeDevice("TW-999", "My Grill", [makeChannel("Probe 1", 350)])];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		expect(screen.getByText("My Grill")).toBeInTheDocument();
	});

	it("applies alarm-high styling for high alarm channels", () => {
		mockDevicesData = [
			makeDevice("TW-001", "Smoker", [makeChannel("Pit", 300, { alarmHigh: true })]),
		];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		const reading = screen.getByText("300.0°F");
		expect(reading).toHaveClass("text-alarm-high");
	});

	it("applies alarm-low styling for low alarm channels", () => {
		mockDevicesData = [
			makeDevice("TW-001", "Fridge", [makeChannel("Internal", 28, { alarmLow: true })]),
		];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		const reading = screen.getByText("28.0°F");
		expect(reading).toHaveClass("text-alarm-low");
	});

	it("shows how far a channel is from a high target", () => {
		mockDevicesData = [
			makeDevice("TW-001", "Smoker", [makeChannel("Brisket", 175, { highTarget: 200 })]),
		];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		expect(screen.getByText("25.0°F to high target")).toBeInTheDocument();
	});

	it("shows how far a channel is past a high target", () => {
		mockDevicesData = [
			makeDevice("TW-001", "Smoker", [
				makeChannel("Brisket", 205, { alarmHigh: true, highTarget: 200 }),
			]),
		];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		expect(screen.getByText("5.0°F past high target")).toBeInTheDocument();
	});

	it("shows how far a channel is above a low target", () => {
		mockDevicesData = [
			makeDevice("TW-001", "Fridge", [makeChannel("Internal", 40, { lowTarget: 32 })]),
		];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		expect(screen.getByText("8.0°F above low target")).toBeInTheDocument();
	});

	it("uses the active temperature unit for target gaps", () => {
		window.localStorage.setItem("thermoworks-unit", "C");
		mockDevicesData = [
			makeDevice("TW-001", "Smoker", [makeChannel("Brisket", 212, { highTarget: 221 })]),
		];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		expect(screen.getByText("100.0°C")).toBeInTheDocument();
		expect(screen.getByText("5.0°C to high target")).toBeInTheDocument();
	});

	it("hides disabled channels", () => {
		mockDevicesData = [
			makeDevice("TW-001", "Smoker", [
				makeChannel("Active", 225),
				makeChannel("Disabled", 100, { enabled: false }),
			]),
		];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		expect(screen.getByText("Active")).toBeInTheDocument();
		expect(screen.queryByText("Disabled")).not.toBeInTheDocument();
	});

	it("shows channel count in header", () => {
		mockDevicesData = [
			makeDevice("TW-001", "Smoker", [makeChannel("Pit", 225), makeChannel("Meat", 165)]),
		];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		expect(screen.getByText("2 channels active")).toBeInTheDocument();
	});

	it("shows singular 'channel' when only one active", () => {
		mockDevicesData = [makeDevice("TW-001", "Smoker", [makeChannel("Pit", 225)])];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		expect(screen.getByText("1 channel active")).toBeInTheDocument();
	});

	it("renders exit link back to dashboard", () => {
		mockDevicesData = [makeDevice("TW-001", "Smoker", [makeChannel("Pit", 225)])];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		const exitLink = screen.getByLabelText("Exit pit display");
		expect(exitLink).toBeInTheDocument();
		expect(exitLink).toHaveAttribute("href", "/");
	});

	it("renders fullscreen toggle button", () => {
		mockDevicesData = [makeDevice("TW-001", "Smoker", [makeChannel("Pit", 225)])];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		expect(screen.getByLabelText("Enter fullscreen")).toBeInTheDocument();
	});

	it("shows dash placeholder for null readings", () => {
		mockDevicesData = [makeDevice("TW-001", "Smoker", [makeChannel("Disconnected", null)])];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		expect(screen.getByText("--")).toBeInTheDocument();
	});

	it("uses carousel for many channels (>12)", () => {
		const channels = Array.from({ length: 13 }, (_, i) => makeChannel(`Ch ${i + 1}`, 150 + i));
		mockDevicesData = [makeDevice("TW-001", "Big Cook", channels)];
		mockDevicesLoading = false;
		mockDevicesError = null;
		renderPitDisplay();

		// Carousel shows dot indicators
		const tabs = screen.getAllByRole("tab");
		expect(tabs.length).toBe(13);
	});
});
