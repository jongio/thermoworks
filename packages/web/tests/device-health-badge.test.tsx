import { fireEvent, render, screen } from "@testing-library/react";
import type { Device, DeviceChannel } from "thermoworks-sdk";
import { describe, expect, it } from "vitest";
import { DeviceHealthBadge } from "../src/components/DeviceHealthBadge.tsx";

function makeDevice(overrides?: Partial<Device>): Device {
	return {
		serial: "TW-001",
		deviceId: "dev-1",
		label: "Test Device",
		type: "node",
		device: null,
		status: "online",
		battery: 80,
		batteryState: null,
		wifiStrength: null,
		firmware: "2.0.0",
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
		lastSeen: new Date(),
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
	};
}

function makeChannel(overrides?: Partial<DeviceChannel>): DeviceChannel {
	return {
		value: 72.5,
		units: "F",
		label: "Probe 1",
		status: "ok",
		type: "temperature",
		number: "1",
		enabled: true,
		color: null,
		lastSeen: new Date(),
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
		...overrides,
	};
}

describe("DeviceHealthBadge", () => {
	it("renders a green dot when device is healthy", () => {
		const device = makeDevice({ status: "online", battery: 80 });
		const channels = [makeChannel()];

		render(<DeviceHealthBadge device={device} channels={channels} />);

		const badge = screen.getByLabelText("Device health: healthy");
		expect(badge).toBeInTheDocument();
		expect(badge.className).toContain("bg-green-500");
	});

	it("renders a warning badge when device has issues", () => {
		const device = makeDevice({ status: "offline", battery: 80 });
		const channels = [makeChannel()];

		render(<DeviceHealthBadge device={device} channels={channels} />);

		const badge = screen.getByLabelText("Device health: Warning");
		expect(badge).toBeInTheDocument();
		expect(badge).toHaveTextContent("Warning");
	});

	it("renders a critical badge for critical issues", () => {
		const device = makeDevice({ status: "online", battery: 2 });
		const channels = [makeChannel()];

		render(<DeviceHealthBadge device={device} channels={channels} />);

		const badge = screen.getByLabelText("Device health: Critical");
		expect(badge).toBeInTheDocument();
		expect(badge).toHaveTextContent("Critical");
	});

	it("shows tooltip with issues on hover", () => {
		const device = makeDevice({ status: "offline", battery: 15 });
		const channels = [makeChannel()];

		render(<DeviceHealthBadge device={device} channels={channels} />);

		const badge = screen.getByLabelText("Device health: Warning");
		fireEvent.mouseEnter(badge);

		const tooltip = screen.getByRole("tooltip");
		expect(tooltip).toBeInTheDocument();
		expect(tooltip).toHaveTextContent("Device is offline");
		expect(tooltip).toHaveTextContent("Battery low");
	});

	it("hides tooltip on mouse leave", () => {
		const device = makeDevice({ status: "offline", battery: 80 });
		const channels = [makeChannel()];

		render(<DeviceHealthBadge device={device} channels={channels} />);

		const badge = screen.getByLabelText("Device health: Warning");
		fireEvent.mouseEnter(badge);
		expect(screen.getByRole("tooltip")).toBeInTheDocument();

		fireEvent.mouseLeave(badge);
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	it("toggles tooltip on click", () => {
		const device = makeDevice({ status: "offline", battery: 80 });
		const channels = [makeChannel()];

		render(<DeviceHealthBadge device={device} channels={channels} />);

		const badge = screen.getByLabelText("Device health: Warning");
		fireEvent.click(badge);

		expect(screen.getByRole("tooltip")).toBeInTheDocument();

		fireEvent.click(badge);
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	it("shows stale reading issue when channel timestamp is old", () => {
		const now = new Date();
		const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
		const device = makeDevice({ status: "online", battery: 80, lastSeen: tenMinutesAgo });
		const channels = [makeChannel({ lastSeen: tenMinutesAgo })];

		render(<DeviceHealthBadge device={device} channels={channels} />);

		const badge = screen.getByLabelText("Device health: Warning");
		fireEvent.mouseEnter(badge);

		expect(screen.getByRole("tooltip")).toHaveTextContent("stale");
	});

	it("shows weak Wi-Fi signal in the tooltip", () => {
		const device = makeDevice({ status: "online", battery: 80, wifiStrength: -78 });
		const channels = [makeChannel()];

		render(<DeviceHealthBadge device={device} channels={channels} />);

		const badge = screen.getByLabelText("Device health: Warning");
		fireEvent.mouseEnter(badge);

		expect(screen.getByRole("tooltip")).toHaveTextContent("Wi-Fi signal weak");
		expect(screen.getByRole("tooltip")).toHaveTextContent("RSSI -78 dBm");
	});
});
