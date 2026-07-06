import type { CalibrationPoint, CalibrationRecord } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

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
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetCalibration = vi.mocked(mockClient.getCalibration);

// --- Helpers ---

function makeCalibrationPoint(overrides: Partial<CalibrationPoint> = {}): CalibrationPoint {
	return {
		channel: overrides.channel ?? 1,
		value: overrides.value ?? 32.0,
		units: overrides.units ?? "F",
		referenceValue: overrides.referenceValue ?? 32.0,
		deviation: overrides.deviation ?? 0,
		trimValue: overrides.trimValue ?? null,
		result: overrides.result ?? "Pass",
	};
}

function makeCalibrationRecord(overrides: Partial<CalibrationRecord> = {}): CalibrationRecord {
	return {
		calibrationId: overrides.calibrationId ?? "CAL-001",
		calibrationDate:
			"calibrationDate" in overrides
				? overrides.calibrationDate!
				: new Date("2026-03-15T10:00:00Z"),
		deviceId: overrides.deviceId ?? "DEV123",
		sessionId: overrides.sessionId ?? null,
		performedBy: "performedBy" in overrides ? overrides.performedBy! : "Jane Smith",
		manager: "manager" in overrides ? overrides.manager! : null,
		referenceDetail:
			"referenceDetail" in overrides
				? overrides.referenceDetail!
				: "NIST-traceable reference thermometer SN:REF-42",
		statedAccuracy: "statedAccuracy" in overrides ? overrides.statedAccuracy! : "+/- 0.1F",
		ambientTemperature: "ambientTemperature" in overrides ? overrides.ambientTemperature! : "72.3F",
		ambientHumidity: "ambientHumidity" in overrides ? overrides.ambientHumidity! : "45%",
		result: "result" in overrides ? overrides.result! : "Pass",
		lowPointAdjustments: overrides.lowPointAdjustments ?? [makeCalibrationPoint()],
		highPointReference: overrides.highPointReference ?? [
			makeCalibrationPoint({ value: 212.0, referenceValue: 212.0, channel: 1 }),
		],
	};
}

// --- Test suites ---

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

// =============================================================================
// calibration command - human-readable output
// =============================================================================

describe("calibration", () => {
	it("displays calibration record with all metadata fields", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetCalibration.mockResolvedValue([makeCalibrationRecord()]);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("ABC123");

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("CAL-001");
		expect(output).toContain("March 15, 2026");
		expect(output).toContain("Jane Smith");
		expect(output).toContain("NIST-traceable reference thermometer SN:REF-42");
		expect(output).toContain("+/- 0.1F");
		expect(output).toContain("72.3F");
		expect(output).toContain("45%");
	});

	it("displays pass result in green ANSI", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetCalibration.mockResolvedValue([makeCalibrationRecord({ result: "Pass" })]);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("ABC123");

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		// Green ANSI: \x1b[32mPASS\x1b[0m
		expect(output).toContain("\x1b[32mPASS\x1b[0m");
	});

	it("displays fail result in red ANSI", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetCalibration.mockResolvedValue([
			makeCalibrationRecord({
				result: "Fail",
				lowPointAdjustments: [makeCalibrationPoint({ result: "Fail", deviation: 1.5 })],
			}),
		]);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("ABC123");

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		// Red ANSI: \x1b[31mFAIL\x1b[0m
		expect(output).toContain("\x1b[31mFAIL\x1b[0m");
	});

	it("displays per-channel calibration points with deviation", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetCalibration.mockResolvedValue([
			makeCalibrationRecord({
				lowPointAdjustments: [
					makeCalibrationPoint({
						channel: 1,
						value: 32.1,
						referenceValue: 32.0,
						deviation: 0.1,
						trimValue: -0.1,
					}),
					makeCalibrationPoint({
						channel: 2,
						value: 31.8,
						referenceValue: 32.0,
						deviation: -0.2,
						trimValue: 0.2,
					}),
				],
			}),
		]);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("ABC123");

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Low-Point Adjustments");
		expect(output).toContain("32.1F");
		expect(output).toContain("32F"); // JS renders 32.0 as "32"
		expect(output).toContain("+0.1F");
		expect(output).toContain("-0.1");
		expect(output).toContain("-0.2F");
		expect(output).toContain("0.2");
	});

	it("displays high-point reference section", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetCalibration.mockResolvedValue([
			makeCalibrationRecord({
				highPointReference: [
					makeCalibrationPoint({ channel: 1, value: 212.1, referenceValue: 212.0, deviation: 0.1 }),
				],
			}),
		]);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("ABC123");

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("High-Point Reference");
		expect(output).toContain("212.1F");
		expect(output).toContain("212F"); // JS renders 212.0 as "212"
	});

	it("shows 'No calibration records found' for empty results", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetCalibration.mockResolvedValue([]);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("XYZ999");

		expect(logSpy).toHaveBeenCalledWith("No calibration records found for XYZ999.");
	});

	it("handles null optional metadata gracefully", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetCalibration.mockResolvedValue([
			makeCalibrationRecord({
				calibrationDate: null,
				performedBy: null,
				manager: null,
				referenceDetail: null,
				statedAccuracy: null,
				ambientTemperature: null,
				ambientHumidity: null,
				result: null,
				lowPointAdjustments: [],
				highPointReference: [],
			}),
		]);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("ABC123");

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("CAL-001");
		expect(output).toContain("N/A");
		// None of the optional fields should appear
		expect(output).not.toContain("Technician:");
		expect(output).not.toContain("Manager:");
		expect(output).not.toContain("Reference:");
		expect(output).not.toContain("Accuracy:");
		expect(output).not.toContain("Ambient:");
		expect(output).not.toContain("Humidity:");
		expect(output).not.toContain("Result:");
	});

	it("displays multiple calibration records separated by blank line", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetCalibration.mockResolvedValue([
			makeCalibrationRecord({ calibrationId: "CAL-001" }),
			makeCalibrationRecord({ calibrationId: "CAL-002" }),
		]);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("ABC123");

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("CAL-001");
		expect(output).toContain("CAL-002");
		// Blank line separator between records
		expect(logSpy).toHaveBeenCalledWith("");
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { calibration } = await import("../src/commands/calibration.js");
		await expect(calibration("ABC123")).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});

	it("exits with error when serial is undefined", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { calibration } = await import("../src/commands/calibration.js");
		await expect(calibration(undefined)).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(
			"Usage: thermoworks calibration <SERIAL> [--interval-months N]",
		);
		exitSpy.mockRestore();
	});

	it("shows dash for null trimValue in points table", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetCalibration.mockResolvedValue([
			makeCalibrationRecord({
				lowPointAdjustments: [makeCalibrationPoint({ trimValue: null })],
			}),
		]);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("ABC123");

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		// The trim column should show "-" for null
		expect(output).toMatch(/-\s+.*PASS/);
	});
});

// =============================================================================
// calibration command - JSON output
// =============================================================================

describe("calibration --json", () => {
	it("outputs calibration records as JSON array", async () => {
		const records = [makeCalibrationRecord()];
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetCalibration.mockResolvedValue(records);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("ABC123", { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toBeInstanceOf(Array);
		expect(output).toHaveLength(1);
		expect(output[0].calibrationId).toBe("CAL-001");
		expect(output[0].performedBy).toBe("Jane Smith");
		expect(output[0].lowPointAdjustments).toHaveLength(1);
		expect(output[0].highPointReference).toHaveLength(1);
	});

	it("outputs empty array as JSON when no records", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetCalibration.mockResolvedValue([]);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("ABC123", { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual([]);
	});

	it("outputs valid JSON with no ANSI codes", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetCalibration.mockResolvedValue([
			makeCalibrationRecord({
				result: "Fail",
				lowPointAdjustments: [makeCalibrationPoint({ result: "Fail" })],
			}),
		]);

		const { calibration } = await import("../src/commands/calibration.js");
		await calibration("ABC123", { json: true });

		const raw = logSpy.mock.calls[0][0] as string;
		expect(raw).not.toContain("\x1b[");
		expect(() => JSON.parse(raw)).not.toThrow();
	});
});
