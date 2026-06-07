import type { DeviceEvent } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetEvents = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getEvents = mockGetEvents;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

import { ThermoworksCloud } from "thermoworks-sdk";
import { events, formatSeverityBadge, parseEventsArgs } from "../src/commands/events.js";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetEvents = vi.mocked(mockClient.getEvents);

// --- Helpers ---

function makeEvent(overrides: Partial<DeviceEvent> & { id: string }): DeviceEvent {
	return {
		id: overrides.id,
		eventType: overrides.eventType ?? "Low Battery Alert",
		severity: overrides.severity ?? 1,
		eventTime: overrides.eventTime ?? new Date("2026-06-07T12:00:00Z"),
		deviceId: overrides.deviceId ?? "ABC123",
		channelId: overrides.channelId ?? null,
		accountId: overrides.accountId ?? "acct-1",
		valueBefore: overrides.valueBefore ?? null,
		valueAfter: overrides.valueAfter ?? null,
		groups: overrides.groups ?? null,
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
// parseEventsArgs
// =============================================================================

describe("parseEventsArgs", () => {
	it("parses --device flag", () => {
		const result = parseEventsArgs(["--device", "SMOKE1"]);
		expect(result.device).toBe("SMOKE1");
	});

	it("parses --type flag", () => {
		const result = parseEventsArgs(["--type", "alarm"]);
		expect(result.type).toBe("alarm");
	});

	it("parses --limit flag as integer", () => {
		const result = parseEventsArgs(["--limit", "20"]);
		expect(result.limit).toBe(20);
	});

	it("ignores invalid --limit values", () => {
		const result = parseEventsArgs(["--limit", "abc"]);
		expect(result.limit).toBeUndefined();
	});

	it("ignores --limit with zero or negative", () => {
		expect(parseEventsArgs(["--limit", "0"]).limit).toBeUndefined();
		expect(parseEventsArgs(["--limit", "-5"]).limit).toBeUndefined();
	});

	it("parses all flags together", () => {
		const result = parseEventsArgs(["--device", "X", "--type", "alarm", "--limit", "10"]);
		expect(result.device).toBe("X");
		expect(result.type).toBe("alarm");
		expect(result.limit).toBe(10);
	});

	it("returns empty options when no flags provided", () => {
		const result = parseEventsArgs([]);
		expect(result.device).toBeUndefined();
		expect(result.type).toBeUndefined();
		expect(result.limit).toBeUndefined();
	});

	it("ignores flags without values", () => {
		const result = parseEventsArgs(["--device"]);
		expect(result.device).toBeUndefined();
	});
});

// =============================================================================
// formatSeverityBadge
// =============================================================================

describe("formatSeverityBadge", () => {
	it("returns CRITICAL badge with red ANSI for severity >= 3", () => {
		const badge = formatSeverityBadge(3);
		expect(badge).toContain("[CRITICAL]");
		expect(badge).toContain("\u001b[31m");
		expect(badge).toContain("\u001b[0m");
	});

	it("returns CRITICAL for severity 5", () => {
		expect(formatSeverityBadge(5)).toContain("[CRITICAL]");
	});

	it("returns WARNING badge with yellow ANSI for severity 2", () => {
		const badge = formatSeverityBadge(2);
		expect(badge).toContain("[WARNING]");
		expect(badge).toContain("\u001b[33m");
		expect(badge).toContain("\u001b[0m");
	});

	it("returns INFO badge without ANSI for severity < 2", () => {
		const badge = formatSeverityBadge(1);
		expect(badge).toBe("[INFO]");
		expect(badge).not.toContain("\u001b[");
	});

	it("returns INFO for severity 0", () => {
		expect(formatSeverityBadge(0)).toBe("[INFO]");
	});
});

// =============================================================================
// events command
// =============================================================================

describe("events", () => {
	it("displays events with severity badge, type, device, and time", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-07T12:05:00Z").getTime());
		mockGetEvents.mockResolvedValue([
			makeEvent({
				id: "evt-1",
				eventType: "High Temp Alarm",
				severity: 3,
				deviceId: "SMOKE1",
				eventTime: new Date("2026-06-07T12:00:00Z"),
			}),
		]);

		await events({}, { json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Found 1 event");
		expect(output).toContain("[CRITICAL]");
		expect(output).toContain("High Temp Alarm");
		expect(output).toContain("SMOKE1");
		expect(output).toContain("5m ago");
	});

	it("shows 'No events found.' when empty", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetEvents.mockResolvedValue([]);

		await events({}, { json: false });

		expect(logSpy).toHaveBeenCalledWith("No events found.");
	});

	it("shows value change when valueBefore and valueAfter present", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-07T12:05:00Z").getTime());
		mockGetEvents.mockResolvedValue([
			makeEvent({
				id: "evt-2",
				eventType: "Low Battery Alert",
				severity: 2,
				valueBefore: "80%",
				valueAfter: "15%",
			}),
		]);

		await events({}, { json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("80%");
		expect(output).toContain("→");
		expect(output).toContain("15%");
	});

	it("omits value change when both valueBefore and valueAfter are null", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-07T12:05:00Z").getTime());
		mockGetEvents.mockResolvedValue([
			makeEvent({
				id: "evt-3",
				valueBefore: null,
				valueAfter: null,
			}),
		]);

		await events({}, { json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).not.toContain("→");
	});

	it("passes device filter to SDK", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetEvents.mockResolvedValue([]);

		await events({ device: "NODE5" }, { json: false });

		expect(mockGetEvents).toHaveBeenCalledWith({
			deviceId: "NODE5",
			eventType: undefined,
			limit: undefined,
		});
	});

	it("passes type filter to SDK", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetEvents.mockResolvedValue([]);

		await events({ type: "alarm" }, { json: false });

		expect(mockGetEvents).toHaveBeenCalledWith({
			deviceId: undefined,
			eventType: "alarm",
			limit: undefined,
		});
	});

	it("passes limit filter to SDK", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetEvents.mockResolvedValue([]);

		await events({ limit: 10 }, { json: false });

		expect(mockGetEvents).toHaveBeenCalledWith({
			deviceId: undefined,
			eventType: undefined,
			limit: 10,
		});
	});

	it("shows plural 'events' for multiple results", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-07T12:05:00Z").getTime());
		mockGetEvents.mockResolvedValue([
			makeEvent({ id: "e1" }),
			makeEvent({ id: "e2" }),
			makeEvent({ id: "e3" }),
		]);

		await events({}, { json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Found 3 events");
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		await expect(events({}, { json: false })).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});

	it("shows '?' for missing valueBefore when valueAfter is present", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		vi.spyOn(Date, "now").mockReturnValue(new Date("2026-06-07T12:05:00Z").getTime());
		mockGetEvents.mockResolvedValue([
			makeEvent({
				id: "evt-4",
				valueBefore: null,
				valueAfter: "online",
			}),
		]);

		await events({}, { json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("? → online");
	});
});

// =============================================================================
// events --json
// =============================================================================

describe("events --json", () => {
	it("outputs event list as JSON array", async () => {
		const eventData = [makeEvent({ id: "evt-1", eventType: "Alarm", severity: 3, deviceId: "X" })];
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetEvents.mockResolvedValue(eventData);

		await events({}, { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toBeInstanceOf(Array);
		expect(output).toHaveLength(1);
		expect(output[0].id).toBe("evt-1");
		expect(output[0].eventType).toBe("Alarm");
		expect(output[0].severity).toBe(3);
	});

	it("outputs empty array when no events", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetEvents.mockResolvedValue([]);

		await events({}, { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual([]);
	});

	it("outputs valid JSON with no ANSI codes", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetEvents.mockResolvedValue([makeEvent({ id: "x", severity: 3 })]);

		await events({}, { json: true });

		const raw = logSpy.mock.calls[0][0] as string;
		expect(raw).not.toContain("\u001b[");
		expect(() => JSON.parse(raw)).not.toThrow();
	});
});
