import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { TemperatureUnitProvider } from "../src/context/TemperatureUnitContext.tsx";
import { Guide } from "../src/pages/Guide.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockClient(
	overrides: Partial<ThermoworksWebClient> = {},
): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		getTemperatureGuide: vi.fn().mockResolvedValue({ categories: [] }),
		login: vi.fn(),
		logout: vi.fn(),
		getUser: vi.fn(),
		getDevices: vi.fn(),
		getDeviceChannel: vi.fn(),
		getAllDeviceChannels: vi.fn(),
		getDevicesWithChannels: vi.fn(),
		getArchives: vi.fn(),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

/** Minimal layout that provides outlet context, mirroring AppLayout. */
function LayoutWithContext({ client }: { client: ThermoworksWebClient }) {
	return <Outlet context={{ client }} />;
}

function renderGuide(client: ThermoworksWebClient) {
	return render(
		<TemperatureUnitProvider>
			<MemoryRouter initialEntries={["/guide"]}>
				<Routes>
					<Route element={<LayoutWithContext client={client} />}>
						<Route path="/guide" element={<Guide />} />
					</Route>
				</Routes>
			</MemoryRouter>
		</TemperatureUnitProvider>,
	);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Guide page", () => {
	it("renders fallback categories when API returns empty guide", async () => {
		const client = createMockClient({
			getTemperatureGuide: vi.fn().mockResolvedValue({ categories: [] }),
		});

		renderGuide(client);

		// Fallback guide should render the four default categories
		expect(await screen.findByText("Beef")).toBeInTheDocument();
		expect(screen.getByText("Poultry")).toBeInTheDocument();
		expect(screen.getByText("Pork")).toBeInTheDocument();
		expect(screen.getByText("Fish")).toBeInTheDocument();
	});

	it("renders API categories when data is available", async () => {
		const client = createMockClient({
			getTemperatureGuide: vi.fn().mockResolvedValue({
				categories: [
					{
						name: "Lamb",
						items: [
							{ name: "Leg of Lamb", temp: 145, units: "F", doneness: "Medium" },
						],
					},
				],
			}),
		});

		renderGuide(client);

		expect(await screen.findByText("Lamb")).toBeInTheDocument();
		expect(screen.getByText("Leg of Lamb")).toBeInTheDocument();
		expect(screen.getByText("(Medium)")).toBeInTheDocument();
	});

	it("filters items by search input", async () => {
		const client = createMockClient({
			getTemperatureGuide: vi.fn().mockResolvedValue({ categories: [] }),
		});

		renderGuide(client);

		// Wait for fallback to render
		expect(await screen.findByText("Beef")).toBeInTheDocument();

		const searchInput = screen.getByLabelText("Search temperature guide");
		fireEvent.change(searchInput, { target: { value: "salmon" } });

		// Salmon should remain visible, beef items should be gone
		expect(screen.getByText("Salmon")).toBeInTheDocument();
		expect(screen.queryByText("Rare")).not.toBeInTheDocument();
		expect(screen.queryByText("Beef")).not.toBeInTheDocument();
	});

	it("shows 'no results' message when search matches nothing", async () => {
		const client = createMockClient({
			getTemperatureGuide: vi.fn().mockResolvedValue({ categories: [] }),
		});

		renderGuide(client);

		expect(await screen.findByText("Beef")).toBeInTheDocument();

		const searchInput = screen.getByLabelText("Search temperature guide");
		fireEvent.change(searchInput, { target: { value: "unicorn" } });

		expect(screen.getByText(/no results found/i)).toBeInTheDocument();
	});

	it("displays temperatures in user-preferred unit format", async () => {
		const client = createMockClient({
			getTemperatureGuide: vi.fn().mockResolvedValue({ categories: [] }),
		});

		renderGuide(client);

		// Default unit is F, so should show degree F values
		expect(await screen.findByText("Beef")).toBeInTheDocument();
		// Medium Rare beef = 135°F (unique value in fallback data)
		expect(screen.getByText("135.0°F")).toBeInTheDocument();
		// Pulled Pork = 203°F (unique)
		expect(screen.getByText("203.0°F")).toBeInTheDocument();
	});

	it("renders the page heading", async () => {
		const client = createMockClient();
		renderGuide(client);

		expect(await screen.findByText("Temperature Guide")).toBeInTheDocument();
	});
});
