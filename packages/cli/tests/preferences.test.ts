import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	mkdir: vi.fn(),
}));

import { mkdir, readFile, writeFile } from "node:fs/promises";

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

beforeEach(() => {
	mockMkdir.mockResolvedValue(undefined as never);
	mockWriteFile.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe("isKnownKey", () => {
	it("accepts known keys and rejects others", async () => {
		const { isKnownKey } = await import("../src/preferences.js");
		expect(isKnownKey("unit")).toBe(true);
		expect(isKnownKey("device")).toBe(true);
		expect(isKnownKey("watchInterval")).toBe(true);
		expect(isKnownKey("nope")).toBe(false);
	});
});

describe("validatePreferenceValue", () => {
	it("validates and upper-cases unit", async () => {
		const { validatePreferenceValue } = await import("../src/preferences.js");
		expect(validatePreferenceValue("unit", "f")).toEqual({ ok: true, value: "F" });
		expect(validatePreferenceValue("unit", "C")).toEqual({ ok: true, value: "C" });
		expect(validatePreferenceValue("unit", "kelvin").ok).toBe(false);
	});

	it("validates device serial", async () => {
		const { validatePreferenceValue } = await import("../src/preferences.js");
		expect(validatePreferenceValue("device", " M100 ")).toEqual({ ok: true, value: "M100" });
		expect(validatePreferenceValue("device", "   ").ok).toBe(false);
	});

	it("validates watchInterval as a number >= 1", async () => {
		const { validatePreferenceValue } = await import("../src/preferences.js");
		expect(validatePreferenceValue("watchInterval", "15")).toEqual({ ok: true, value: 15 });
		expect(validatePreferenceValue("watchInterval", "0").ok).toBe(false);
		expect(validatePreferenceValue("watchInterval", "abc").ok).toBe(false);
	});
});

describe("loadPreferences", () => {
	it("returns empty object when file is missing", async () => {
		mockReadFile.mockRejectedValue(new Error("ENOENT"));
		const { loadPreferences } = await import("../src/preferences.js");
		expect(await loadPreferences()).toEqual({});
	});

	it("returns empty object and warns on corrupt JSON", async () => {
		mockReadFile.mockResolvedValue("{bad json" as never);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { loadPreferences } = await import("../src/preferences.js");
		expect(await loadPreferences()).toEqual({});
		expect(errorSpy).toHaveBeenCalled();
	});

	it("returns empty object and warns on invalid shape", async () => {
		mockReadFile.mockResolvedValue(JSON.stringify({ unit: "K" }) as never);
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { loadPreferences } = await import("../src/preferences.js");
		expect(await loadPreferences()).toEqual({});
		expect(errorSpy).toHaveBeenCalled();
	});

	it("returns stored preferences", async () => {
		mockReadFile.mockResolvedValue(
			JSON.stringify({ unit: "C", device: "M100", watchInterval: 20 }) as never,
		);
		const { loadPreferences } = await import("../src/preferences.js");
		expect(await loadPreferences()).toEqual({ unit: "C", device: "M100", watchInterval: 20 });
	});
});

describe("savePreferences", () => {
	it("creates the directory and writes with safe permissions", async () => {
		const { savePreferences } = await import("../src/preferences.js");
		await savePreferences({ unit: "F" });
		expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining(".thermoworks"), {
			recursive: true,
			mode: 0o700,
		});
		expect(mockWriteFile).toHaveBeenCalledWith(
			expect.stringContaining("preferences.json"),
			expect.stringContaining('"unit": "F"'),
			{ encoding: "utf8", mode: 0o600 },
		);
	});
});

describe("getPreferencesPath", () => {
	it("points at preferences.json under .thermoworks", async () => {
		const { getPreferencesPath } = await import("../src/preferences.js");
		expect(getPreferencesPath()).toContain(".thermoworks");
		expect(getPreferencesPath()).toContain("preferences.json");
	});
});
