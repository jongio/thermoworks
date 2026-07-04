import type { NotificationSettings } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetNotificationSettings = vi.fn();
	const mockUpdateNotificationSettings = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getNotificationSettings = mockGetNotificationSettings;
		updateNotificationSettings = mockUpdateNotificationSettings;
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
const mockGetNotificationSettings = vi.mocked(mockClient.getNotificationSettings);
const mockUpdateNotificationSettings = vi.mocked(mockClient.updateNotificationSettings);

// --- Helpers ---

function makeSettings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
	return {
		enabled: overrides.enabled ?? true,
		continuousAlerts: overrides.continuousAlerts ?? false,
		emailNotification: overrides.emailNotification ?? true,
		smsNotification: overrides.smsNotification ?? false,
		deviceNotification: overrides.deviceNotification ?? true,
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
// notifications command - display
// =============================================================================

describe("notifications", () => {
	it("displays all settings with on/off state", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetNotificationSettings.mockResolvedValue(makeSettings());

		const { notifications } = await import("../src/commands/notifications.js");
		await notifications([]);

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Notification settings");
		expect(output).toContain("Notifications enabled");
		expect(output).toContain("Continuous alerts");
		expect(output).toContain("Email alerts");
		expect(output).toContain("SMS alerts");
		expect(output).toContain("Device (app) alerts");
		expect(output).toContain("\x1b[32mon\x1b[0m");
		expect(output).toContain("off");
	});

	it("does not call update when no flags are given", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetNotificationSettings.mockResolvedValue(makeSettings());

		const { notifications } = await import("../src/commands/notifications.js");
		await notifications([]);

		expect(mockUpdateNotificationSettings).not.toHaveBeenCalled();
	});

	it("enables a setting via --enable", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetNotificationSettings.mockResolvedValue(makeSettings({ smsNotification: true }));

		const { notifications } = await import("../src/commands/notifications.js");
		await notifications(["--enable", "sms"]);

		expect(mockUpdateNotificationSettings).toHaveBeenCalledWith({ smsNotification: true });
	});

	it("disables a setting via --disable", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetNotificationSettings.mockResolvedValue(makeSettings({ emailNotification: false }));

		const { notifications } = await import("../src/commands/notifications.js");
		await notifications(["--disable", "email"]);

		expect(mockUpdateNotificationSettings).toHaveBeenCalledWith({ emailNotification: false });
	});

	it("maps 'all' to the enabled field", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetNotificationSettings.mockResolvedValue(makeSettings());

		const { notifications } = await import("../src/commands/notifications.js");
		await notifications(["--disable", "all"]);

		expect(mockUpdateNotificationSettings).toHaveBeenCalledWith({ enabled: false });
	});

	it("maps 'continuous' and 'device' fields", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetNotificationSettings.mockResolvedValue(makeSettings());

		const { notifications } = await import("../src/commands/notifications.js");
		await notifications(["--enable", "continuous"]);
		expect(mockUpdateNotificationSettings).toHaveBeenCalledWith({ continuousAlerts: true });

		vi.clearAllMocks();
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetNotificationSettings.mockResolvedValue(makeSettings());
		await notifications(["--disable", "device"]);
		expect(mockUpdateNotificationSettings).toHaveBeenCalledWith({ deviceNotification: false });
	});

	it("exits with error for an unknown field", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { notifications } = await import("../src/commands/notifications.js");
		await expect(notifications(["--enable", "bogus"])).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("requires a field"));
		exitSpy.mockRestore();
	});

	it("exits with error for an unknown option", async () => {
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { notifications } = await import("../src/commands/notifications.js");
		await expect(notifications(["--frobnicate"])).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown option"));
		exitSpy.mockRestore();
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { notifications } = await import("../src/commands/notifications.js");
		await expect(notifications([])).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});
});

// =============================================================================
// notifications command - JSON output
// =============================================================================

describe("notifications --json", () => {
	it("outputs settings as JSON with no ANSI codes", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetNotificationSettings.mockResolvedValue(makeSettings());

		const { notifications } = await import("../src/commands/notifications.js");
		await notifications([], { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const raw = logSpy.mock.calls[0][0] as string;
		expect(raw).not.toContain("\x1b[");
		const output = JSON.parse(raw);
		expect(output.enabled).toBe(true);
		expect(output.smsNotification).toBe(false);
	});

	it("applies an update then outputs the refreshed settings as JSON", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetNotificationSettings.mockResolvedValue(makeSettings({ smsNotification: true }));

		const { notifications } = await import("../src/commands/notifications.js");
		await notifications(["--enable", "sms"], { json: true });

		expect(mockUpdateNotificationSettings).toHaveBeenCalledWith({ smsNotification: true });
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.smsNotification).toBe(true);
	});
});
