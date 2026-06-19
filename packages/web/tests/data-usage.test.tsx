import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type {
	BillingPlan,
	DataUsage,
	DeviceDataUsage,
	ThermoworksWebClient,
} from "../src/lib/api.ts";
import { DataUsage as DataUsagePage } from "../src/pages/DataUsage.tsx";

const BASE_USAGE: DataUsage = {
	totalBytes: 512 * 1024 * 1024,
	limitBytes: 1024 * 1024 * 1024,
	periodStart: new Date("2026-06-01T00:00:00Z"),
	periodEnd: new Date("2026-06-30T00:00:00Z"),
	deviceCount: 2,
};

const BASE_DEVICE_USAGE: DeviceDataUsage[] = [
	{
		serial: "SN-001",
		label: "Kitchen Signals",
		bytes: 384 * 1024 * 1024,
		percentage: 75,
		lastSync: new Date("2026-06-08T18:00:00Z"),
	},
	{
		serial: "SN-002",
		label: "Patio Node",
		bytes: 128 * 1024 * 1024,
		percentage: 25,
		lastSync: new Date("2026-06-08T20:00:00Z"),
	},
];

const BASE_PLAN: BillingPlan = {
	name: "ThermoWorks Pro",
	tier: "pro",
	storageLimitBytes: 1024 * 1024 * 1024,
	deviceLimit: 10,
	retentionDays: 90,
	price: 999,
	currency: "USD",
	renewalDate: new Date("2026-06-30T00:00:00Z"),
};

function createMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		getDataUsage: vi.fn().mockResolvedValue(BASE_USAGE),
		getDataUsageByDevice: vi.fn().mockResolvedValue(BASE_DEVICE_USAGE),
		getBillingPlan: vi.fn().mockResolvedValue(BASE_PLAN),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

function LayoutWithContext({ client }: { client: ThermoworksWebClient }) {
	return <Outlet context={{ client }} />;
}

function renderDataUsage(client: ThermoworksWebClient) {
	return render(
		<MemoryRouter initialEntries={["/usage"]}>
			<Routes>
				<Route element={<LayoutWithContext client={client} />}>
					<Route path="/usage" element={<DataUsagePage />} />
				</Route>
			</Routes>
		</MemoryRouter>,
	);
}

describe("DataUsage page", () => {
	it("shows a loading state while usage data is pending", () => {
		const client = createMockClient({
			getDataUsage: vi.fn().mockReturnValue(new Promise(() => {})),
		});

		renderDataUsage(client);

		expect(screen.getByText("Loading usage data...")).toBeInTheDocument();
	});

	it("renders total usage, plan details, and upgrade link", async () => {
		const client = createMockClient();
		renderDataUsage(client);

		expect(await screen.findByRole("heading", { name: "Data Usage" })).toBeInTheDocument();
		expect(await screen.findByText("512.0 MB")).toBeInTheDocument();
		expect(screen.getByText("50% of 1.00 GB")).toBeInTheDocument();
		expect(screen.getByText("ThermoWorks Pro")).toBeInTheDocument();
		expect(screen.getByText("90 days")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Upgrade plan" })).toHaveAttribute("href", "/settings");
	});

	it("calculates the storage progress bar percentage from usage and limit", async () => {
		const client = createMockClient({
			getDataUsage: vi.fn().mockResolvedValue({
				...BASE_USAGE,
				totalBytes: 768 * 1024 * 1024,
				limitBytes: 1024 * 1024 * 1024,
			}),
		});

		renderDataUsage(client);

		const bar = await screen.findByRole("progressbar", { name: "Storage usage" });
		expect(bar).toHaveAttribute("aria-valuenow", "75");
	});

	it("renders a per-device breakdown with progress bars", async () => {
		const client = createMockClient();
		renderDataUsage(client);

		expect(await screen.findByRole("list", { name: "Per-device data usage" })).toBeInTheDocument();
		expect(screen.getByText("Kitchen Signals")).toBeInTheDocument();
		expect(screen.getByText("Patio Node")).toBeInTheDocument();
		expect(screen.getByRole("progressbar", { name: "Kitchen Signals usage" })).toHaveAttribute(
			"aria-valuenow",
			"75",
		);
		expect(screen.getByRole("progressbar", { name: "Patio Node usage" })).toHaveAttribute(
			"aria-valuenow",
			"25",
		);
	});
});
