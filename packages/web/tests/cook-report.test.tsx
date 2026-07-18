import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Archive, ArchiveChannel } from "thermoworks-sdk";
import { makeArchive, makeArchiveChannel } from "thermoworks-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import { CookReport } from "../src/components/CookReport.tsx";
import { TemperatureUnitProvider } from "../src/context/TemperatureUnitContext.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";
import { annotationStorageKey } from "../src/lib/cook-annotations.ts";
import { buildCookReport, type CookAnnotation } from "../src/lib/cook-report.ts";
import { downloadBlob } from "../src/lib/export.ts";

vi.mock("../src/components/TemperatureChart.tsx", () => ({
	TemperatureChart: ({ annotations }: { annotations?: readonly CookAnnotation[] }) => (
		<div data-testid="temperature-chart">
			{annotations?.map((annotation) => (
				<span key={annotation.id} data-testid="chart-annotation">
					{annotation.label}
				</span>
			))}
		</div>
	),
	default: ({ annotations }: { annotations?: readonly CookAnnotation[] }) => (
		<div data-testid="temperature-chart">
			{annotations?.map((annotation) => (
				<span key={annotation.id} data-testid="chart-annotation">
					{annotation.label}
				</span>
			))}
		</div>
	),
}));

vi.mock("../src/components/ShareManager.tsx", () => ({
	ShareManager: ({ reportPayload }: { reportPayload: unknown }) => (
		<div role="dialog">
			shared report {JSON.stringify(reportPayload).includes("Spritz") ? "with annotations" : ""}
		</div>
	),
}));

vi.mock("../src/lib/export.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/lib/export.ts")>();
	return { ...actual, downloadBlob: vi.fn() };
});

function renderWithProvider(ui: ReactNode) {
	return render(<TemperatureUnitProvider>{ui}</TemperatureUnitProvider>);
}

function makeReportArchive(): Archive {
	const start = new Date("2026-01-01T00:00:00Z");
	const readings = [220, 225, 230, 240].map((value, index) => ({
		value,
		timestamp: new Date(start.getTime() + index * 10 * 60_000),
		units: "F",
	}));
	const channel: ArchiveChannel = makeArchiveChannel({
		alarmHigh: {
			enabled: true,
			alarming: false,
			muted: false,
			value: 225,
			units: "F",
			lastNotified: null,
		},
		recentReadings: readings,
		value: 240,
	});
	return makeArchive({
		id: "cook-1",
		start,
		end: new Date(start.getTime() + 30 * 60_000),
		channels: [channel],
	});
}

function makeClient(): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		shareArchive: vi
			.fn()
			.mockResolvedValue({ shareUrl: "http://localhost/#/share/archive/TW-1/cook-1" }),
		shareDevice: vi.fn(),
	} as unknown as ThermoworksWebClient;
}

describe("buildCookReport", () => {
	it("builds a report summary over a sample session", () => {
		const archive = makeReportArchive();
		const report = buildCookReport(archive, {
			targetTemp: 225,
			targetTolerance: 5,
			annotations: [
				{ id: "b", timestamp: new Date("2026-01-01T00:20:00Z"), label: "Wrap" },
				{ id: "a", timestamp: new Date("2026-01-01T00:10:00Z"), label: "Spritz" },
			],
		});

		expect(report.summary.durationMs).toBe(30 * 60_000);
		expect(report.summary.minTemp).toBe(220);
		expect(report.summary.maxTemp).toBe(240);
		expect(report.summary.timeAtTargetMs).toBe(30 * 60_000);
		expect(report.annotations.map((annotation) => annotation.label)).toEqual(["Spritz", "Wrap"]);
	});
});

describe("CookReport", () => {
	it("lets users add, edit, persist, and remove annotations", () => {
		const archive = makeReportArchive();
		renderWithProvider(<CookReport archive={archive} />);

		fireEvent.change(screen.getByLabelText("Annotation label"), { target: { value: "Spritz" } });
		fireEvent.change(screen.getByLabelText("Annotation note"), {
			target: { value: "Apple juice" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Add/i }));

		expect(
			within(screen.getByTestId("annotation-timeline")).getByText("Spritz"),
		).toBeInTheDocument();
		expect(localStorage.getItem(annotationStorageKey("cook-1"))).toContain("Spritz");

		fireEvent.click(screen.getByLabelText("Edit Spritz"));
		fireEvent.change(screen.getByLabelText("Annotation label"), { target: { value: "Wrapped" } });
		fireEvent.click(screen.getByRole("button", { name: /Save/i }));

		expect(
			within(screen.getByTestId("annotation-timeline")).getByText("Wrapped"),
		).toBeInTheDocument();
		expect(screen.queryByText("Spritz")).not.toBeInTheDocument();

		fireEvent.click(screen.getByLabelText("Remove Wrapped"));
		expect(screen.queryByText("Wrapped")).not.toBeInTheDocument();
		expect(screen.getByText("No annotations yet.")).toBeInTheDocument();
	});

	it("renders the graph, annotation timeline, and summary cards", () => {
		const archive = makeReportArchive();
		renderWithProvider(
			<CookReport
				archive={archive}
				initialAnnotations={[
					{ id: "a", timestamp: new Date("2026-01-01T00:10:00Z"), label: "Spritz" },
				]}
			/>,
		);

		expect(screen.getByTestId("temperature-chart")).toBeInTheDocument();
		expect(screen.getByTestId("chart-annotation")).toHaveTextContent("Spritz");
		expect(screen.getByTestId("annotation-timeline")).toHaveTextContent("Spritz");
		expect(screen.getByTestId("cook-report-summary")).toHaveTextContent("Duration");
		expect(screen.getByTestId("cook-report-summary")).toHaveTextContent("30m");
		expect(screen.getByTestId("cook-report-summary")).toHaveTextContent("Min");
		expect(screen.getByTestId("cook-report-summary")).toHaveTextContent("220");
		expect(screen.getByTestId("cook-report-summary")).toHaveTextContent("Max");
		expect(screen.getByTestId("cook-report-summary")).toHaveTextContent("240");
		expect(screen.getByTestId("cook-report-summary")).toHaveTextContent("Time at target");
	});

	it("exports and shares a report with annotations", () => {
		const archive = makeReportArchive();
		renderWithProvider(
			<CookReport
				archive={archive}
				serial="TW-1"
				client={makeClient()}
				initialAnnotations={[
					{ id: "a", timestamp: new Date("2026-01-01T00:10:00Z"), label: "Spritz" },
				]}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: /Export report/i }));
		expect(downloadBlob).toHaveBeenCalledWith(
			expect.stringContaining("Spritz"),
			"cook-report-cook-1.json",
			"application/json",
		);

		fireEvent.click(screen.getByRole("button", { name: /Share report/i }));
		expect(screen.getByRole("dialog")).toHaveTextContent("with annotations");
	});
});
