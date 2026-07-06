import type { CalibrationRecord } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetCalibration = vi.fn();
	const mockClose = vi.fn();
	class MockThermoworksCloud {
		getCalibration = mockGetCalibration;
		close = mockClose;
	}
	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

import { ThermoworksCloud } from "thermoworks-sdk";
import {
	addMonths,
	computeCalibrationDue,
	DEFAULT_RECAL_INTERVAL_MONTHS,
} from "../src/commands/calibration.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);
const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetCalibration = vi.mocked(mockClient.getCalibration);

function makeRecord(date: Date | null): CalibrationRecord {
	return {
		calibrationId: "CAL-001",
		calibrationDate: date,
		deviceId: "DEV123",
		sessionId: null,
		performedBy: null,
		manager: null,
		referenceDetail: null,
		statedAccuracy: null,
		ambientTemperature: null,
		ambientHumidity: null,
		result: "Pass",
		lowPointAdjustments: [],
		highPointReference: [],
	};
}

describe("addMonths", () => {
	it("adds whole months", () => {
		expect(addMonths(new Date("2026-01-15T00:00:00Z"), 12).toISOString()).toBe(
			new Date("2027-01-15T00:00:00Z").toISOString(),
		);
	});

	it("clamps to the last valid day for shorter months", () => {
		// Jan 31 + 1 month has no Feb 31, so it clamps to the last day of February.
		const result = addMonths(new Date(2026, 0, 31), 1);
		expect(result.getMonth()).toBe(1); // February
		expect(result.getDate()).toBe(28);
	});
});

describe("computeCalibrationDue", () => {
	const now = new Date("2026-07-01T00:00:00Z");

	it("reports current when well within the interval", () => {
		const due = computeCalibrationDue(new Date("2026-06-01T00:00:00Z"), 12, now);
		expect(due.status).toBe("current");
		expect(due.dueAt).toBe(new Date("2027-06-01T00:00:00Z").toISOString());
		expect(due.daysRemaining).toBeGreaterThan(30);
	});

	it("reports due-soon within 30 days of the due date", () => {
		const due = computeCalibrationDue(new Date("2025-07-10T00:00:00Z"), 12, now);
		expect(due.status).toBe("due-soon");
		expect(due.daysRemaining).toBeGreaterThanOrEqual(0);
		expect(due.daysRemaining).toBeLessThanOrEqual(30);
	});

	it("reports overdue past the due date", () => {
		const due = computeCalibrationDue(new Date("2025-01-01T00:00:00Z"), 12, now);
		expect(due.status).toBe("overdue");
		expect(due.daysRemaining).toBeLessThan(0);
	});

	it("reports unknown when there is no calibration date", () => {
		const due = computeCalibrationDue(null, 12, now);
		expect(due).toEqual({
			status: "unknown",
			calibratedAt: null,
			dueAt: null,
			daysRemaining: null,
		});
	});

	it("honors a custom interval", () => {
		const due = computeCalibrationDue(new Date("2026-01-01T00:00:00Z"), 3, now);
		expect(due.status).toBe("overdue");
	});
});

describe("calibration command recalibration output", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
	});
	afterEach(() => {
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it("includes a recalibration block in JSON output", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		mockGetCalibration.mockResolvedValue([makeRecord(new Date("2020-01-01T00:00:00Z"))]);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("ABC123", { json: true }, []);

		const parsed = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
		expect(parsed[0].recalibration.status).toBe("overdue");
		expect(parsed[0].recalibration.calibratedAt).toBeTruthy();
		expect(parsed[0].recalibration.dueAt).toBeTruthy();
		expect(typeof parsed[0].recalibration.daysRemaining).toBe("number");
	});

	it("shows a Status line in text output", async () => {
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		mockGetCalibration.mockResolvedValue([makeRecord(new Date("2020-01-01T00:00:00Z"))]);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("ABC123", { json: false }, []);

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Status:");
		expect(output).toContain("Next due:");
		expect(output).toContain("overdue");
	});

	it("defaults to a 12 month interval", () => {
		expect(DEFAULT_RECAL_INTERVAL_MONTHS).toBe(12);
	});
});
