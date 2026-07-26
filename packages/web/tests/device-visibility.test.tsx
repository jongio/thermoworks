import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceList } from "../src/components/DeviceList.tsx";
import { TemperatureUnitProvider } from "../src/context/TemperatureUnitContext.tsx";
import type { DeviceWithChannels, ThermoworksWebClient } from "../src/lib/api.ts";

const FAVORITES_KEY = "thermoworks-device-favorites";
const HIDDEN_KEY = "thermoworks-device-hidden";

// Mock the useArchiveData hook to avoid real API calls
vi.mock("../src/hooks/useArchiveData.ts", () => ({
	useArchiveData: () => ({ archives: [], isLoading: false, error: null }),
}));

// Mock lazy-loaded TemperatureChart
vi.mock("../src/components/TemperatureChart", () => ({
	default: () => <div data-testid="mock-chart" />,
}));

function renderWithProviders(ui: ReactNode) {
	return render(
		<MemoryRouter>
			<TemperatureUnitProvider>{ui}</TemperatureUnitProvider>
		</MemoryRouter>,
	);
}

function createMockDevice(serial: string, label: string, channelCount = 1): DeviceWithChannels {
	return {
		device: {
			serial,
			deviceId: `dev-${serial}`,
			label,
			status: "online",
			type: "Signals",
			device: "signals",
			battery: 85,
			wifiStrength: -45,
			firmware: "1.2.0",
			sessionStart: null,
			sessionLabel: null,
		},
		channels: Array.from({ length: channelCount }, (_, i) => ({
			number: i + 1,
			enabled: true,
			label: `Channel ${i + 1}`,
			temperature: 72.5 + i,
			unit: "F" as const,
			alarm: null,
			min: null,
			max: null,
		})),
	} as DeviceWithChannels;
}

const mockClient = { isAuthenticated: true } as unknown as ThermoworksWebClient;

function renderDeviceList(data: DeviceWithChannels[]) {
	return renderWithProviders(
		<DeviceList
			data={data}
			isLoading={false}
			error={null}
			lastUpdated={new Date()}
			onRefresh={() => {}}
			client={mockClient}
		/>,
	);
}

describe("DeviceList visibility", () => {
	beforeEach(() => {
		localStorage.clear();
	});

	afterEach(() => {
		cleanup();
		localStorage.clear();
		vi.restoreAllMocks();
	});

	it("renders favorite and hide action buttons on device cards", () => {
		const data = [createMockDevice("SN001", "Kitchen Probe")];

		renderDeviceList(data);

		expect(
			screen.getByRole("button", {
				name: "Add Kitchen Probe to favorites",
			}),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Hide Kitchen Probe" })).toBeInTheDocument();
	});

	it("favorites sort before non-favorites", () => {
		localStorage.setItem(FAVORITES_KEY, JSON.stringify(["SN003"]));

		const data = [
			createMockDevice("SN001", "Alpha"),
			createMockDevice("SN002", "Beta"),
			createMockDevice("SN003", "Charlie"),
		];

		renderDeviceList(data);

		const cards = screen.getAllByRole("article");
		// Charlie (SN003) is favorited and should appear first
		expect(within(cards[0]).getByRole("heading")).toHaveTextContent("Charlie");
		// Alpha and Beta follow in alphabetical order
		expect(within(cards[1]).getByRole("heading")).toHaveTextContent("Alpha");
		expect(within(cards[2]).getByRole("heading")).toHaveTextContent("Beta");
	});

	it("hidden devices are omitted by default", () => {
		localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SN002"]));

		const data = [
			createMockDevice("SN001", "Alpha"),
			createMockDevice("SN002", "Beta"),
			createMockDevice("SN003", "Charlie"),
		];

		renderDeviceList(data);

		const cards = screen.getAllByRole("article");
		expect(cards).toHaveLength(2);

		// Beta (SN002) should not be visible
		expect(screen.queryByText("Beta")).not.toBeInTheDocument();

		// Status bar should show "2 devices" with "(1 hidden)" annotation
		expect(screen.getByText("2 devices")).toBeInTheDocument();
		expect(screen.getByText("(1 hidden)")).toBeInTheDocument();
	});

	it("shows 'Show hidden' toggle when devices are hidden", () => {
		localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SN002"]));

		const data = [createMockDevice("SN001", "Alpha"), createMockDevice("SN002", "Beta")];

		renderDeviceList(data);

		const toggle = screen.getByRole("button", {
			name: "Show hidden devices",
		});
		expect(toggle).toBeInTheDocument();
		expect(toggle).toHaveTextContent("Show hidden (1)");
	});

	it("reveals hidden devices when 'Show hidden' is toggled", () => {
		localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SN002"]));

		const data = [createMockDevice("SN001", "Alpha"), createMockDevice("SN002", "Beta")];

		renderDeviceList(data);

		// Initially Beta is hidden
		expect(screen.queryByText("Beta")).not.toBeInTheDocument();

		// Click "Show hidden"
		fireEvent.click(screen.getByRole("button", { name: "Show hidden devices" }));

		// Now Beta should be visible
		expect(screen.getByText("Beta")).toBeInTheDocument();
		const cards = screen.getAllByRole("article");
		expect(cards).toHaveLength(2);

		// Toggle should now say "Hide hidden"
		expect(screen.getByRole("button", { name: "Hide hidden devices" })).toBeInTheDocument();
	});

	it("clicking favorite button toggles favorite aria-label", () => {
		const data = [createMockDevice("SN001", "Kitchen Probe")];

		renderDeviceList(data);

		const addBtn = screen.getByRole("button", {
			name: "Add Kitchen Probe to favorites",
		});
		fireEvent.click(addBtn);

		// After favoriting, label should change to "Remove from favorites"
		expect(
			screen.getByRole("button", {
				name: "Remove Kitchen Probe from favorites",
			}),
		).toBeInTheDocument();
	});

	it("clicking hide button removes device from the list", () => {
		const data = [createMockDevice("SN001", "Alpha"), createMockDevice("SN002", "Beta")];

		renderDeviceList(data);

		expect(screen.getAllByRole("article")).toHaveLength(2);

		// Hide Beta
		fireEvent.click(screen.getByRole("button", { name: "Hide Beta" }));

		// Beta should now be hidden
		expect(screen.getAllByRole("article")).toHaveLength(1);
		expect(screen.queryByText("Beta")).not.toBeInTheDocument();
	});

	it("shows all-hidden empty state when every device is hidden", () => {
		localStorage.setItem(HIDDEN_KEY, JSON.stringify(["SN001", "SN002"]));

		const data = [createMockDevice("SN001", "Alpha"), createMockDevice("SN002", "Beta")];

		renderDeviceList(data);

		expect(screen.getByText("All devices are hidden.")).toBeInTheDocument();
		expect(screen.getByText(/Use the "Show hidden" button to reveal them/)).toBeInTheDocument();
	});

	it("does not show 'Show hidden' toggle when no devices are hidden", () => {
		const data = [createMockDevice("SN001", "Alpha")];

		renderDeviceList(data);

		expect(screen.queryByRole("button", { name: "Show hidden devices" })).not.toBeInTheDocument();
	});

	it("multiple favorites maintain alphabetical order within favorites group", () => {
		localStorage.setItem(FAVORITES_KEY, JSON.stringify(["SN003", "SN001"]));

		const data = [
			createMockDevice("SN001", "Alpha"),
			createMockDevice("SN002", "Beta"),
			createMockDevice("SN003", "Charlie"),
		];

		renderDeviceList(data);

		const cards = screen.getAllByRole("article");
		// Favorites (Alpha=SN001, Charlie=SN003) sorted alphabetically, then non-favorites (Beta)
		expect(within(cards[0]).getByRole("heading")).toHaveTextContent("Alpha");
		expect(within(cards[1]).getByRole("heading")).toHaveTextContent("Charlie");
		expect(within(cards[2]).getByRole("heading")).toHaveTextContent("Beta");
	});

	it("hidden device count annotation is accurate after hiding a device", () => {
		const data = [
			createMockDevice("SN001", "Alpha"),
			createMockDevice("SN002", "Beta"),
			createMockDevice("SN003", "Charlie"),
		];

		renderDeviceList(data);

		// Initially no hidden count
		expect(screen.queryByText(/hidden/)).not.toBeInTheDocument();

		// Hide one device
		fireEvent.click(screen.getByRole("button", { name: "Hide Beta" }));

		expect(screen.getByText("(1 hidden)")).toBeInTheDocument();
		expect(screen.getByText("2 devices")).toBeInTheDocument();
	});
});
