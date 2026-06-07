import type { TemperatureCategory } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetTemperatureGuide = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getTemperatureGuide = mockGetTemperatureGuide;
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
const mockGetTemperatureGuide = vi.mocked(mockClient.getTemperatureGuide);

// --- Helpers ---

function makeCategory(
	overrides: Partial<TemperatureCategory> & { label: string },
): TemperatureCategory {
	return {
		label: overrides.label,
		icon: overrides.icon ?? "🐄",
		pullWarning: overrides.pullWarning ?? null,
		warning: overrides.warning ?? null,
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
// commands/guide.ts - list mode
// =============================================================================

describe("guide", () => {
	it("lists all categories with icons", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetTemperatureGuide.mockResolvedValue({
			categories: [
				makeCategory({ label: "Beef", icon: "🐄" }),
				makeCategory({ label: "Pork", icon: "🐷" }),
				makeCategory({ label: "Poultry", icon: "🐔" }),
			],
		});

		const { guide } = await import("../src/commands/guide.js");
		await guide(undefined);

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("🐄  Beef");
		expect(output).toContain("🐷  Pork");
		expect(output).toContain("🐔  Poultry");
	});

	it("shows 'No temperature guide categories found.' when empty", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetTemperatureGuide.mockResolvedValue({ categories: [] });

		const { guide } = await import("../src/commands/guide.js");
		await guide(undefined);

		expect(logSpy).toHaveBeenCalledWith("No temperature guide categories found.");
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { guide } = await import("../src/commands/guide.js");
		await expect(guide(undefined)).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});

	it("displays pullWarning when present", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetTemperatureGuide.mockResolvedValue({
			categories: [
				makeCategory({
					label: "Beef",
					icon: "🐄",
					pullWarning: "Pull 5°F before target",
				}),
			],
		});

		const { guide } = await import("../src/commands/guide.js");
		await guide(undefined);

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("🐄  Beef");
		expect(output).toContain("⚠ Pull: Pull 5°F before target");
	});

	it("displays warning when present", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetTemperatureGuide.mockResolvedValue({
			categories: [
				makeCategory({
					label: "Poultry",
					icon: "🐔",
					warning: "Always cook to 165°F internal",
				}),
			],
		});

		const { guide } = await import("../src/commands/guide.js");
		await guide(undefined);

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("🐔  Poultry");
		expect(output).toContain("⚠ Always cook to 165°F internal");
	});

	it("displays both pullWarning and warning when both present", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetTemperatureGuide.mockResolvedValue({
			categories: [
				makeCategory({
					label: "Pork",
					icon: "🐷",
					pullWarning: "Pull at 140°F",
					warning: "Rest 3 minutes",
				}),
			],
		});

		const { guide } = await import("../src/commands/guide.js");
		await guide(undefined);

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("⚠ Pull: Pull at 140°F");
		expect(output).toContain("⚠ Rest 3 minutes");
	});
});

// =============================================================================
// commands/guide.ts - filter mode
// =============================================================================

describe("guide filter", () => {
	it("filters categories case-insensitively", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetTemperatureGuide.mockResolvedValue({
			categories: [
				makeCategory({ label: "Beef", icon: "🐄" }),
				makeCategory({ label: "Pork", icon: "🐷" }),
				makeCategory({ label: "Poultry", icon: "🐔" }),
			],
		});

		const { guide } = await import("../src/commands/guide.js");
		await guide("beef");

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("🐄  Beef");
		expect(output).not.toContain("Pork");
		expect(output).not.toContain("Poultry");
	});

	it("matches partial category names", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetTemperatureGuide.mockResolvedValue({
			categories: [
				makeCategory({ label: "Beef", icon: "🐄" }),
				makeCategory({ label: "Poultry", icon: "🐔" }),
			],
		});

		const { guide } = await import("../src/commands/guide.js");
		await guide("pou");

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("🐔  Poultry");
		expect(output).not.toContain("Beef");
	});

	it("shows message when filter matches nothing", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetTemperatureGuide.mockResolvedValue({
			categories: [makeCategory({ label: "Beef", icon: "🐄" })],
		});

		const { guide } = await import("../src/commands/guide.js");
		await guide("fish");

		expect(logSpy).toHaveBeenCalledWith('No categories matching "fish".');
	});

	it("filter is case-insensitive with uppercase input", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetTemperatureGuide.mockResolvedValue({
			categories: [makeCategory({ label: "Beef", icon: "🐄" })],
		});

		const { guide } = await import("../src/commands/guide.js");
		await guide("BEEF");

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("🐄  Beef");
	});
});

// =============================================================================
// commands/guide.ts - JSON output
// =============================================================================

describe("guide --json", () => {
	it("outputs all categories as JSON array", async () => {
		const categories = [
			makeCategory({ label: "Beef", icon: "🐄" }),
			makeCategory({ label: "Pork", icon: "🐷" }),
		];
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetTemperatureGuide.mockResolvedValue({ categories });

		const { guide } = await import("../src/commands/guide.js");
		await guide(undefined, { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toBeInstanceOf(Array);
		expect(output).toHaveLength(2);
		expect(output[0].label).toBe("Beef");
		expect(output[1].label).toBe("Pork");
	});

	it("outputs filtered categories as JSON when filter provided", async () => {
		const categories = [
			makeCategory({ label: "Beef", icon: "🐄" }),
			makeCategory({ label: "Pork", icon: "🐷" }),
		];
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetTemperatureGuide.mockResolvedValue({ categories });

		const { guide } = await import("../src/commands/guide.js");
		await guide("pork", { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toHaveLength(1);
		expect(output[0].label).toBe("Pork");
	});

	it("outputs empty array when no categories match filter", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetTemperatureGuide.mockResolvedValue({
			categories: [makeCategory({ label: "Beef", icon: "🐄" })],
		});

		const { guide } = await import("../src/commands/guide.js");
		await guide("fish", { json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output).toEqual([]);
	});

	it("outputs valid JSON with no ANSI codes", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetTemperatureGuide.mockResolvedValue({
			categories: [makeCategory({ label: "Beef", icon: "🐄", warning: "Test warning" })],
		});

		const { guide } = await import("../src/commands/guide.js");
		await guide(undefined, { json: true });

		const raw = logSpy.mock.calls[0][0] as string;
		expect(raw).not.toContain("\u001b[");
		expect(() => JSON.parse(raw)).not.toThrow();
	});
});
