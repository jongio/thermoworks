import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryViewer } from "../src/components/HistoryViewer.tsx";
import { TemperatureUnitProvider } from "../src/context/TemperatureUnitContext.tsx";
import type { DeviceHistory } from "../src/lib/api.ts";

// Mock the lazy-loaded TemperatureChart
vi.mock("../src/components/TemperatureChart", () => ({
	default: ({ channels }: { channels: unknown[] }) => (
		<div data-testid="temperature-chart" data-channels={JSON.stringify(channels)}>
			Chart
		</div>
	),
}));

function makeHistory(
	readings: Array<{ timestamp: Date; channels: Record<string, number> }>,
): DeviceHistory {
	return { readings };
}

function renderViewer(history: DeviceHistory) {
	return render(
		<TemperatureUnitProvider>
			<HistoryViewer history={history} />
		</TemperatureUnitProvider>,
	);
}

describe("HistoryViewer", () => {
	it("renders empty state when no readings", () => {
		renderViewer(makeHistory([]));

		expect(screen.getByText("No historical data available for this device")).toBeInTheDocument();
	});

	it("renders time range buttons", () => {
		const now = Date.now();
		renderViewer(
			makeHistory([{ timestamp: new Date(now - 1000), channels: { "1": 72 } }]),
		);

		expect(screen.getByRole("button", { name: "1 Hour" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "6 Hours" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "1 Day" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "1 Week" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "1 Month" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
	});

	it("defaults to 1 Day time range", () => {
		const now = Date.now();
		renderViewer(
			makeHistory([{ timestamp: new Date(now - 1000), channels: { "1": 72 } }]),
		);

		const dayButton = screen.getByRole("button", { name: "1 Day" });
		expect(dayButton).toHaveAttribute("aria-pressed", "true");
	});

	it("filters readings by selected time range", () => {
		const now = Date.now();
		const readings = [
			// 30 minutes ago - should appear in 1h range
			{ timestamp: new Date(now - 30 * 60 * 1000), channels: { "1": 72 } },
			// 2 hours ago - should NOT appear in 1h range
			{ timestamp: new Date(now - 2 * 60 * 60 * 1000), channels: { "1": 74 } },
			// 3 days ago - should NOT appear in 1h or 1d range
			{ timestamp: new Date(now - 3 * 24 * 60 * 60 * 1000), channels: { "1": 76 } },
		];

		renderViewer(makeHistory(readings));

		// Default is "1 Day" - should show 2 readings (30min + 2hr ago)
		expect(screen.getByText(/2 points/)).toBeInTheDocument();

		// Switch to 1 Hour - should show only 1 reading
		fireEvent.click(screen.getByRole("button", { name: "1 Hour" }));
		expect(screen.getByText(/1 points/)).toBeInTheDocument();

		// Switch to All - should show all 3
		fireEvent.click(screen.getByRole("button", { name: "All" }));
		expect(screen.getByText(/3 points/)).toBeInTheDocument();
	});

	it("shows no-data message when time range has no readings", () => {
		// Only readings from 2 days ago
		const now = Date.now();
		const readings = [
			{ timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000), channels: { "1": 72 } },
		];

		renderViewer(makeHistory(readings));

		// Switch to 1 Hour - no readings in range
		fireEvent.click(screen.getByRole("button", { name: "1 Hour" }));
		expect(screen.getByText("No data in selected time range")).toBeInTheDocument();
	});

	it("renders chart when data is available", () => {
		const now = Date.now();
		renderViewer(
			makeHistory([{ timestamp: new Date(now - 1000), channels: { "1": 72 } }]),
		);

		expect(screen.getByTestId("temperature-chart")).toBeInTheDocument();
	});

	it("displays point count info", () => {
		const now = Date.now();
		renderViewer(
			makeHistory([
				{ timestamp: new Date(now - 60 * 60 * 1000), channels: { "1": 72 } },
				{ timestamp: new Date(now - 1000), channels: { "1": 74 } },
			]),
		);

		expect(screen.getByText(/2 points/)).toBeInTheDocument();
	});

	it("handles readings with invalid timestamps gracefully", () => {
		const now = Date.now();
		renderViewer(
			makeHistory([
				{ timestamp: new Date(now - 1000), channels: { "1": 72 } },
				{ timestamp: new Date("invalid-date"), channels: { "1": 74 } },
			]),
		);

		// Should still render chart with valid reading (invalid timestamp filtered out)
		expect(screen.getByTestId("temperature-chart")).toBeInTheDocument();
		expect(screen.getByText(/1 points/)).toBeInTheDocument();
	});
});
