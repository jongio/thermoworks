import { render, screen } from "@testing-library/react";
import type { CalibrationRecord } from "thermoworks-sdk";
import { describe, expect, it } from "vitest";
import { CalibrationView } from "../src/components/CalibrationView.tsx";
import { TemperatureUnitProvider } from "../src/context/TemperatureUnitContext.tsx";

function makeRecord(overrides: Partial<CalibrationRecord> = {}): CalibrationRecord {
	return {
		calibrationId: "cal-001",
		calibrationDate: new Date("2025-03-15T10:30:00Z"),
		deviceId: "TW-001",
		sessionId: "session-1",
		performedBy: "Technician A",
		manager: "Manager B",
		referenceDetail: "NIST-traceable ice point",
		statedAccuracy: "±0.1°F",
		ambientTemperature: "72.0°F",
		ambientHumidity: "45%",
		result: "Pass",
		lowPointAdjustments: [
			{
				channel: 1,
				value: 32.1,
				units: "F",
				referenceValue: 32.0,
				deviation: 0.1,
				trimValue: null,
				result: "Pass",
			},
			{
				channel: 2,
				value: 32.3,
				units: "F",
				referenceValue: 32.0,
				deviation: 0.3,
				trimValue: 0.3,
				result: "Pass",
			},
		],
		highPointReference: [
			{
				channel: 1,
				value: 211.8,
				units: "F",
				referenceValue: 212.0,
				deviation: -0.2,
				trimValue: null,
				result: "Pass",
			},
		],
		...overrides,
	};
}

function renderWithProviders(records: CalibrationRecord[]) {
	return render(
		<TemperatureUnitProvider>
			<CalibrationView records={records} />
		</TemperatureUnitProvider>,
	);
}

describe("CalibrationView", () => {
	it("renders empty state when no records exist", () => {
		renderWithProviders([]);

		expect(screen.getByText("No calibration data recorded")).toBeInTheDocument();
	});

	it("renders calibration record with date and performer", () => {
		renderWithProviders([makeRecord()]);

		expect(screen.getByText(/Mar 15, 2025/)).toBeInTheDocument();
		expect(screen.getByText(/Technician A/)).toBeInTheDocument();
	});

	it("renders overall result badge", () => {
		renderWithProviders([makeRecord({ result: "Pass" })]);

		// The top-level result badge
		const badges = screen.getAllByText("Pass");
		expect(badges.length).toBeGreaterThan(0);
	});

	it("renders reference detail and accuracy", () => {
		renderWithProviders([makeRecord()]);

		expect(screen.getByText(/NIST-traceable ice point/)).toBeInTheDocument();
		expect(screen.getByText(/±0\.1°F/)).toBeInTheDocument();
	});

	it("renders ambient conditions", () => {
		renderWithProviders([makeRecord()]);

		expect(screen.getByText(/72\.0°F/)).toBeInTheDocument();
		expect(screen.getByText(/45%/)).toBeInTheDocument();
	});

	it("renders low point adjustment table", () => {
		renderWithProviders([makeRecord()]);

		expect(screen.getByText("Low Point Adjustments")).toBeInTheDocument();
		// Channel numbers
		expect(screen.getAllByText("1").length).toBeGreaterThan(0);
		expect(screen.getAllByText("2").length).toBeGreaterThan(0);
	});

	it("renders high point reference table", () => {
		renderWithProviders([makeRecord()]);

		expect(screen.getByText("High Point Reference")).toBeInTheDocument();
	});

	it("renders deviation values with sign", () => {
		renderWithProviders([makeRecord()]);

		// +0.1° from low point channel 1
		expect(screen.getByText("+0.1°")).toBeInTheDocument();
		// -0.2° from high point channel 1
		expect(screen.getByText("-0.2°")).toBeInTheDocument();
	});

	it("renders multiple calibration records", () => {
		const records = [
			makeRecord({ calibrationId: "cal-001", calibrationDate: new Date("2025-03-15T12:00:00Z") }),
			makeRecord({
				calibrationId: "cal-002",
				calibrationDate: new Date("2024-11-20T12:00:00Z"),
				performedBy: "Technician B",
				result: "Fail",
			}),
		];

		renderWithProviders(records);

		// Verify both records rendered (use performer names which are unambiguous)
		expect(screen.getByText(/Technician A/)).toBeInTheDocument();
		expect(screen.getByText(/Technician B/)).toBeInTheDocument();
		// Verify both Fail and Pass badges appear
		expect(screen.getAllByText("Pass").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Fail").length).toBeGreaterThan(0);
	});

	it("handles record with no calibration points", () => {
		const record = makeRecord({
			lowPointAdjustments: [],
			highPointReference: [],
		});

		renderWithProviders([record]);

		expect(screen.queryByText("Low Point Adjustments")).not.toBeInTheDocument();
		expect(screen.queryByText("High Point Reference")).not.toBeInTheDocument();
	});

	it("handles record with null date", () => {
		const record = makeRecord({ calibrationDate: null });

		renderWithProviders([record]);

		expect(screen.getByText("--")).toBeInTheDocument();
	});

	it("displays temperature values using unit context (default F)", () => {
		renderWithProviders([makeRecord()]);

		// Reference value 32.0°F rendered through formatTemp
		expect(screen.getAllByText("32.0°F").length).toBeGreaterThan(0);
	});
});
