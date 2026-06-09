import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceList } from "../src/components/DeviceList.tsx";
import { TemperatureUnitProvider } from "../src/context/TemperatureUnitContext.tsx";
import type { DeviceWithChannels, ThermoworksWebClient } from "../src/lib/api.ts";

// Mock the useArchiveData hook to avoid real API calls
vi.mock("../src/hooks/useArchiveData.ts", () => ({
	useArchiveData: () => ({ archives: [], isLoading: false, error: null }),
}));

// Mock lazy-loaded TemperatureChart
vi.mock("../src/components/TemperatureChart", () => ({
	default: () => <div data-testid="mock-chart" />,
}));

/** Wrap in providers needed by DeviceCard subtree. */
function renderWithProviders(ui: ReactNode) {
	return render(
		<MemoryRouter>
			<TemperatureUnitProvider>{ui}</TemperatureUnitProvider>
		</MemoryRouter>,
	);
}

/** Creates a mock DeviceWithChannels for testing. */
function createMockDevice(serial: string, channelCount = 2): DeviceWithChannels {
	return {
		device: {
			serial,
			deviceId: `dev-${serial}`,
			label: `Device ${serial}`,
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

/** Creates a batch of mock devices. */
function createMockDevices(count: number): DeviceWithChannels[] {
	return Array.from({ length: count }, (_, i) =>
		createMockDevice(`SN${String(i).padStart(4, "0")}`),
	);
}

const mockClient = { isAuthenticated: true } as unknown as ThermoworksWebClient;

// Track ResizeObserver callbacks so we can trigger them
let resizeObserverCallbacks: ResizeObserverCallback[] = [];

class MockResizeObserver {
	callback: ResizeObserverCallback;
	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		resizeObserverCallbacks.push(callback);
	}
	observe(target: Element) {
		// Fire immediately with mock dimensions to simulate layout
		this.callback(
			[
				{
					target,
					contentRect: { width: 1024, height: 800 } as DOMRectReadOnly,
					borderBoxSize: [{ blockSize: 800, inlineSize: 1024 }],
					contentBoxSize: [{ blockSize: 800, inlineSize: 1024 }],
					devicePixelContentBoxSize: [],
				} as unknown as ResizeObserverEntry,
			],
			this as unknown as ResizeObserver,
		);
	}
	unobserve() {}
	disconnect() {}
}

describe("DeviceList", () => {
	beforeEach(() => {
		resizeObserverCallbacks = [];
		vi.stubGlobal("ResizeObserver", MockResizeObserver);

		// Mock element layout properties needed by virtualizer
		Object.defineProperty(HTMLElement.prototype, "clientWidth", {
			configurable: true,
			get() {
				return 1024;
			},
		});
		Object.defineProperty(HTMLElement.prototype, "clientHeight", {
			configurable: true,
			get() {
				return 800;
			},
		});
		Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
			configurable: true,
			get() {
				return 280;
			},
		});
		Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
			configurable: true,
			get() {
				return 5000;
			},
		});

		// Mock getBoundingClientRect for measureElement
		vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
			width: 1024,
			height: 280,
			top: 0,
			left: 0,
			bottom: 280,
			right: 1024,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		});
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("renders without virtualization for small lists (<=20 devices)", () => {
		const data = createMockDevices(5);

		renderWithProviders(
			<DeviceList
				data={data}
				isLoading={false}
				error={null}
				lastUpdated={new Date()}
				onRefresh={() => {}}
				client={mockClient}
			/>,
		);

		// Status bar shows device count
		expect(screen.getByText("5 devices")).toBeInTheDocument();

		// All 5 device cards rendered directly
		const cards = screen.getAllByRole("article");
		expect(cards).toHaveLength(5);

		// No virtualized list container
		expect(screen.queryByRole("list", { name: "Device list" })).not.toBeInTheDocument();
	});

	it("uses virtualized container for large lists (>20 devices)", () => {
		const data = createMockDevices(50);

		renderWithProviders(
			<DeviceList
				data={data}
				isLoading={false}
				error={null}
				lastUpdated={new Date()}
				onRefresh={() => {}}
				client={mockClient}
			/>,
		);

		// Status bar shows device count
		expect(screen.getByText("50 devices")).toBeInTheDocument();

		// Virtualized list container present
		expect(screen.getByRole("list", { name: "Device list" })).toBeInTheDocument();
	});

	it("renders exactly at threshold (20 devices) without virtualization", () => {
		const data = createMockDevices(20);

		renderWithProviders(
			<DeviceList
				data={data}
				isLoading={false}
				error={null}
				lastUpdated={new Date()}
				onRefresh={() => {}}
				client={mockClient}
			/>,
		);

		expect(screen.getByText("20 devices")).toBeInTheDocument();

		// All 20 cards rendered directly
		const cards = screen.getAllByRole("article");
		expect(cards).toHaveLength(20);

		// No virtual list container
		expect(screen.queryByRole("list", { name: "Device list" })).not.toBeInTheDocument();
	});

	it("renders exactly at threshold+1 (21 devices) with virtualization", () => {
		const data = createMockDevices(21);

		renderWithProviders(
			<DeviceList
				data={data}
				isLoading={false}
				error={null}
				lastUpdated={new Date()}
				onRefresh={() => {}}
				client={mockClient}
			/>,
		);

		expect(screen.getByText("21 devices")).toBeInTheDocument();

		// Virtualized container present
		expect(screen.getByRole("list", { name: "Device list" })).toBeInTheDocument();
	});

	it("shows loading skeleton when loading with no data", () => {
		renderWithProviders(
			<DeviceList
				data={[]}
				isLoading={true}
				error={null}
				lastUpdated={null}
				onRefresh={() => {}}
				client={mockClient}
			/>,
		);

		// Skeleton renders article-like placeholders (DeviceCardSkeleton uses <article>)
		const skeletonCards = screen.getAllByRole("article");
		expect(skeletonCards.length).toBeGreaterThan(0);
	});

	it("shows error state", () => {
		renderWithProviders(
			<DeviceList
				data={[]}
				isLoading={false}
				error="Network error"
				lastUpdated={null}
				onRefresh={() => {}}
				client={mockClient}
			/>,
		);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText("Network error")).toBeInTheDocument();
	});

	it("shows empty state with filtering message", () => {
		renderWithProviders(
			<DeviceList
				data={[]}
				isLoading={false}
				error={null}
				lastUpdated={null}
				onRefresh={() => {}}
				client={mockClient}
				isFiltering={true}
			/>,
		);

		expect(screen.getByText("No devices match your search.")).toBeInTheDocument();
	});

	it("shows empty state without filtering", () => {
		renderWithProviders(
			<DeviceList
				data={[]}
				isLoading={false}
				error={null}
				lastUpdated={null}
				onRefresh={() => {}}
				client={mockClient}
			/>,
		);

		expect(screen.getByText("No devices found.")).toBeInTheDocument();
		expect(
			screen.getByText("Make sure your devices are registered in ThermoWorks Cloud."),
		).toBeInTheDocument();
	});
});

