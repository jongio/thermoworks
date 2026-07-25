import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { DeviceChannel } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TemperatureUnitProvider } from "../src/context/TemperatureUnitContext.tsx";
import type { DeviceWithChannels, ThermoworksWebClient } from "../src/lib/api.ts";
import { Compare } from "../src/pages/Compare.tsx";

const { mockUseDevices, mockClient } = vi.hoisted(() => ({
	mockUseDevices: vi.fn(),
	mockClient: { isAuthenticated: true } as ThermoworksWebClient,
}));

vi.mock("react-router", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router")>();
	return {
		...actual,
		useOutletContext: () => ({ client: mockClient }),
	};
});

vi.mock("../src/hooks/useDevices.ts", () => ({
	useDevices: (...args: unknown[]) => mockUseDevices(...args),
}));

class MockResizeObserver {
	callback: ResizeObserverCallback;
	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
	}
	observe(target: Element) {
		this.callback(
			[{ target, contentRect: { width: 800, height: 300 } } as unknown as ResizeObserverEntry],
			this as unknown as ResizeObserver,
		);
	}
	unobserve() {}
	disconnect() {}
}

function renderWithProviders(ui: ReactNode) {
	return render(<TemperatureUnitProvider>{ui}</TemperatureUnitProvider>);
}

function makeChannel(
	number: string,
	label: string,
	value: number,
	overrides: Partial<DeviceChannel> = {},
): DeviceChannel {
	return {
		number,
		label,
		value,
		units: "F",
		status: "ok",
		type: "temperature",
		enabled: true,
		color: null,
		lastSeen: new Date("2026-07-17T20:00:00.000Z"),
		lastTelemetrySaved: new Date("2026-07-17T20:00:00.000Z"),
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

function makeDevices(): DeviceWithChannels[] {
	return [
		{
			device: {
				serial: "signals-1",
				deviceId: "dev-signals-1",
				label: "Signals",
				status: "online",
				type: "Signals",
				device: "signals",
				battery: 90,
				wifiStrength: -40,
				firmware: "1.0.0",
				sessionStart: null,
				sessionLabel: null,
			},
			channels: [makeChannel("1", "Pit", 225, { color: "#ef4444" }), makeChannel("2", "Food", 145)],
		},
		{
			device: {
				serial: "smoke-1",
				deviceId: "dev-smoke-1",
				label: "Smoke",
				status: "online",
				type: "Smoke",
				device: "smoke",
				battery: 75,
				wifiStrength: -55,
				firmware: "1.0.0",
				sessionStart: null,
				sessionLabel: null,
			},
			channels: [makeChannel("1", "Brisket", 165, { color: "#3b82f6" })],
		},
	] as DeviceWithChannels[];
}

function arrangeDevices(devices: DeviceWithChannels[] = makeDevices()) {
	mockUseDevices.mockReturnValue({
		data: devices,
		isLoading: false,
		error: null,
		lastUpdated: new Date("2026-07-17T20:00:00.000Z"),
		refresh: vi.fn(),
		isFromCache: false,
	});
}

describe("Compare page", () => {
	beforeEach(() => {
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
		localStorage.clear();
		mockUseDevices.mockReset();
		arrangeDevices();
	});

	afterEach(() => {
		localStorage.clear();
		cleanup();
		vi.unstubAllGlobals();
	});

	it("selects and deselects channels from at least two devices", async () => {
		renderWithProviders(<Compare />);

		const pit = screen.getByRole("checkbox", { name: "Select Signals · Pit" });
		const brisket = screen.getByRole("checkbox", { name: "Select Smoke · Brisket" });

		fireEvent.click(pit);
		fireEvent.click(brisket);

		expect(pit).toBeChecked();
		expect(brisket).toBeChecked();
		await waitFor(() => expect(screen.getByText("Signals · Pit · °F")).toBeInTheDocument());
		expect(screen.getByText("Smoke · Brisket · °F")).toBeInTheDocument();

		fireEvent.click(pit);
		expect(pit).not.toBeChecked();
		await waitFor(() => expect(screen.queryByText("Signals · Pit · °F")).not.toBeInTheDocument());
		expect(screen.getByText("Smoke · Brisket · °F")).toBeInTheDocument();
	});

	it("renders selected channels on one chart with clear labels, colors, and units", async () => {
		renderWithProviders(<Compare />);

		fireEvent.click(screen.getByRole("checkbox", { name: "Select Signals · Pit" }));
		fireEvent.click(screen.getByRole("checkbox", { name: "Select Smoke · Brisket" }));

		await waitFor(() => expect(screen.getByText("Signals · Pit · °F")).toBeInTheDocument());
		expect(screen.getByText("Smoke · Brisket · °F")).toBeInTheDocument();
		expect(document.querySelector(".recharts-wrapper")).not.toBeNull();
		expect(document.querySelectorAll(".recharts-line")).toHaveLength(2);
	});

	it("saves selected channels locally and restores them on reload", async () => {
		localStorage.setItem(
			"thermoworks-web:compare-selected-channels:v1",
			JSON.stringify(["signals-1::1", "smoke-1::1"]),
		);

		renderWithProviders(<Compare />);

		expect(screen.getByRole("checkbox", { name: "Select Signals · Pit" })).toBeChecked();
		expect(screen.getByRole("checkbox", { name: "Select Smoke · Brisket" })).toBeChecked();
		await waitFor(() => expect(screen.getByText("Signals · Pit · °F")).toBeInTheDocument());
		expect(localStorage.getItem("thermoworks-web:compare-selected-channels:v1")).toBe(
			JSON.stringify(["signals-1::1", "smoke-1::1"]),
		);
	});

	it("renders untrusted labels as text instead of markup", () => {
		const baseDevice = makeDevices()[0];
		if (!baseDevice) throw new Error("Expected fixture device");
		arrangeDevices([
			{
				...baseDevice,
				device: { ...baseDevice.device, label: "<img src=x onerror=alert(1)>" },
				channels: [makeChannel("1", "<script>alert(1)</script>", 200)],
			},
		]);

		renderWithProviders(<Compare />);

		expect(
			screen.getByRole("checkbox", {
				name: "Select <img src=x onerror=alert(1)> · <script>alert(1)</script>",
			}),
		).toBeInTheDocument();
		expect(document.querySelector("img")).toBeNull();
		expect(document.querySelector("script")).toBeNull();
	});
});
