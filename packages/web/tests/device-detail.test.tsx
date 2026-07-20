import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AppOutletContext } from "../src/components/AppLayout.tsx";
import { TemperatureUnitProvider } from "../src/context/TemperatureUnitContext.tsx";
import type { DeviceWithChannels, ThermoworksWebClient } from "../src/lib/api.ts";
import { DeviceDetail } from "../src/pages/DeviceDetail.tsx";

// Mock the useDevice hook
const mockUseDevice = vi.fn();
vi.mock("../src/hooks/useDevice.ts", () => ({
	useDevice: (...args: unknown[]) => mockUseDevice(...args),
}));

// Mock the useArchiveData hook
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
	return {
		isAuthenticated: true,
		shareDevice: vi.fn().mockResolvedValue({ shareUrl: "http://localhost/#/share/device/TW-001" }),
	} as unknown as ThermoworksWebClient;
}

function makeDeviceData(overrides: Partial<DeviceWithChannels["device"]> = {}): DeviceWithChannels {
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
			{
				value: 185.0,
				units: "F",
				label: "Probe 2",
				status: "ok",
				type: "temperature",
				number: "2",
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

/** Wrapper that provides router context and outlet context matching the app layout. */
function renderDetailPage(serial: string) {
	const client = makeMockClient();
	const context: AppOutletContext = { client };

	function Layout() {
		return <Outlet context={context} />;
	}

	return render(
		<TemperatureUnitProvider>
			<MemoryRouter initialEntries={[`/device/${serial}`]}>
				<Routes>
					<Route element={<Layout />}>
						<Route path="device/:serial" element={<DeviceDetail />} />
					</Route>
				</Routes>
			</MemoryRouter>
		</TemperatureUnitProvider>,
	);
}

describe("DeviceDetail", () => {
	it("renders device info when loaded", () => {
		mockUseDevice.mockReturnValue({
			data: makeDeviceData(),
			isLoading: false,
			error: null,
			refresh: vi.fn(),
		});

		renderDetailPage("TW-001");

		expect(screen.getByText("Kitchen Probe")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /rename kitchen probe/i })).toBeInTheDocument();
		expect(screen.getByText(/ThermaQ WiFi/)).toBeInTheDocument();
		expect(screen.getByText("TW-001")).toBeInTheDocument();
		expect(screen.getByText("Online")).toBeInTheDocument();
		expect(screen.getByText(/85.*%/)).toBeInTheDocument();
		expect(screen.getByText(/-42.*dBm/)).toBeInTheDocument();
		expect(screen.getByText(/v2\.1\.0/)).toBeInTheDocument();
	});

	it("renders all channel readings", () => {
		mockUseDevice.mockReturnValue({
			data: makeDeviceData(),
			isLoading: false,
			error: null,
			refresh: vi.fn(),
		});

		renderDetailPage("TW-001");

		expect(screen.getByText("Probe 1")).toBeInTheDocument();
		expect(screen.getByText("72.5°F")).toBeInTheDocument();
		expect(screen.getByText("Probe 2")).toBeInTheDocument();
		expect(screen.getByText("185.0°F")).toBeInTheDocument();
	});

	it("renders back navigation link", () => {
		mockUseDevice.mockReturnValue({
			data: makeDeviceData(),
			isLoading: false,
			error: null,
			refresh: vi.fn(),
		});

		renderDetailPage("TW-001");

		const backLink = screen.getByRole("link", { name: /back to devices/i });
		expect(backLink).toBeInTheDocument();
		expect(backLink).toHaveAttribute("href", "/");
	});

	it("renders loading state", () => {
		mockUseDevice.mockReturnValue({
			data: null,
			isLoading: true,
			error: null,
			refresh: vi.fn(),
		});

		renderDetailPage("TW-001");

		// Loading skeleton should be present (back link still shows)
		const backLink = screen.getByRole("link", { name: /back to devices/i });
		expect(backLink).toBeInTheDocument();
		// Check for skeleton placeholder (animated pulse elements)
		const container = backLink.closest("div");
		expect(container?.parentElement?.querySelector(".animate-pulse")).toBeInTheDocument();
	});

	it("renders error state when device not found", () => {
		mockUseDevice.mockReturnValue({
			data: null,
			isLoading: false,
			error: "Device not found",
			refresh: vi.fn(),
		});

		renderDetailPage("INVALID-SERIAL");

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText("Device not found")).toBeInTheDocument();
		expect(screen.getByText("INVALID-SERIAL")).toBeInTheDocument();
	});

	it("enables share while leaving reset disabled", () => {
		mockUseDevice.mockReturnValue({
			data: makeDeviceData(),
			isLoading: false,
			error: null,
			refresh: vi.fn(),
		});

		renderDetailPage("TW-001");

		// Rename is now functional via InlineEdit (not a disabled button)
		expect(screen.getByRole("button", { name: /rename kitchen probe/i })).toBeEnabled();

		const shareBtn = screen.getByRole("button", { name: /share kitchen probe/i });
		const resetBtn = screen.getByRole("button", { name: /^reset$/i });

		expect(shareBtn).toBeEnabled();
		expect(resetBtn).toBeDisabled();
		expect(screen.getAllByRole("button", { name: /reset min\/max/i })).toHaveLength(2);
	});

	it("opens the device share dialog from the quick action", async () => {
		mockUseDevice.mockReturnValue({
			data: makeDeviceData(),
			isLoading: false,
			error: null,
			refresh: vi.fn(),
		});

		renderDetailPage("TW-001");

		const shareBtn = screen.getByRole("button", { name: /share/i });
		fireEvent.click(shareBtn);

		await waitFor(() => {
			expect(screen.getByRole("dialog", { name: /share device/i })).toBeInTheDocument();
		});
		expect(screen.getByDisplayValue("http://localhost/#/share/device/TW-001")).toBeInTheDocument();
	});

	it("passes correct serial to useDevice hook", () => {
		mockUseDevice.mockReturnValue({
			data: null,
			isLoading: true,
			error: null,
			refresh: vi.fn(),
		});

		renderDetailPage("MY-SERIAL-123");

		expect(mockUseDevice).toHaveBeenCalledWith(
			expect.objectContaining({ isAuthenticated: true }),
			"MY-SERIAL-123",
		);
	});
});
