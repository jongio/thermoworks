import { describe, expect, it } from "vitest";
import {
	DEFAULT_STATUSLINE_CONFIG,
	isValidDeviceEntry,
	isValidStatuslineConfig,
} from "../src/config.js";

describe("DEFAULT_STATUSLINE_CONFIG", () => {
	it("has empty devices array", () => {
		expect(DEFAULT_STATUSLINE_CONFIG.devices).toEqual([]);
	});

	it("has refreshSeconds of 30", () => {
		expect(DEFAULT_STATUSLINE_CONFIG.refreshSeconds).toBe(30);
	});
});

describe("isValidStatuslineConfig", () => {
	it("accepts a valid config object", () => {
		expect(isValidStatuslineConfig({ devices: [], refreshSeconds: 10 })).toBe(true);
	});

	it("accepts a partial config with only devices", () => {
		expect(isValidStatuslineConfig({ devices: [] })).toBe(true);
	});

	it("accepts a partial config with only refreshSeconds", () => {
		expect(isValidStatuslineConfig({ refreshSeconds: 60 })).toBe(true);
	});

	it("accepts an empty object", () => {
		expect(isValidStatuslineConfig({})).toBe(true);
	});

	it("rejects null", () => {
		expect(isValidStatuslineConfig(null)).toBe(false);
	});

	it("rejects an array", () => {
		expect(isValidStatuslineConfig([])).toBe(false);
	});

	it("rejects non-object types", () => {
		expect(isValidStatuslineConfig("string")).toBe(false);
		expect(isValidStatuslineConfig(42)).toBe(false);
		expect(isValidStatuslineConfig(undefined)).toBe(false);
	});

	it("rejects negative refreshSeconds", () => {
		expect(isValidStatuslineConfig({ refreshSeconds: -1 })).toBe(false);
	});

	it("rejects zero refreshSeconds", () => {
		expect(isValidStatuslineConfig({ refreshSeconds: 0 })).toBe(false);
	});

	it("rejects non-number refreshSeconds", () => {
		expect(isValidStatuslineConfig({ refreshSeconds: "fast" })).toBe(false);
	});

	it("rejects non-array devices", () => {
		expect(isValidStatuslineConfig({ devices: "not-array" })).toBe(false);
		expect(isValidStatuslineConfig({ devices: 42 })).toBe(false);
	});
});

describe("isValidDeviceEntry", () => {
	it("accepts a valid entry with channels array", () => {
		expect(isValidDeviceEntry({ serial: "ABC123", label: "Pit", channels: [1, 2] })).toBe(true);
	});

	it("accepts a valid entry with 'avg' channels", () => {
		expect(isValidDeviceEntry({ serial: "ABC123", label: "Pit", channels: "avg" })).toBe(true);
	});

	it("accepts an entry with empty label", () => {
		expect(isValidDeviceEntry({ serial: "ABC123", label: "", channels: [1] })).toBe(true);
	});

	it("rejects an entry with empty channels array", () => {
		expect(isValidDeviceEntry({ serial: "ABC123", label: "Pit", channels: [] })).toBe(false);
	});

	it("rejects null", () => {
		expect(isValidDeviceEntry(null)).toBe(false);
	});

	it("rejects non-object types", () => {
		expect(isValidDeviceEntry("string")).toBe(false);
		expect(isValidDeviceEntry(42)).toBe(false);
	});

	it("rejects missing serial", () => {
		expect(isValidDeviceEntry({ label: "Pit", channels: [1] })).toBe(false);
	});

	it("rejects empty serial", () => {
		expect(isValidDeviceEntry({ serial: "", label: "Pit", channels: [1] })).toBe(false);
	});

	it("rejects non-string serial", () => {
		expect(isValidDeviceEntry({ serial: 123, label: "Pit", channels: [1] })).toBe(false);
	});

	it("rejects missing label", () => {
		expect(isValidDeviceEntry({ serial: "ABC123", channels: [1] })).toBe(false);
	});

	it("rejects non-string label", () => {
		expect(isValidDeviceEntry({ serial: "ABC123", label: 42, channels: [1] })).toBe(false);
	});

	it("rejects channels with non-number elements", () => {
		expect(isValidDeviceEntry({ serial: "ABC123", label: "Pit", channels: ["a", "b"] })).toBe(
			false,
		);
	});

	it("rejects missing channels", () => {
		expect(isValidDeviceEntry({ serial: "ABC123", label: "Pit" })).toBe(false);
	});

	it("rejects invalid channels type", () => {
		expect(isValidDeviceEntry({ serial: "ABC123", label: "Pit", channels: 42 })).toBe(false);
	});
});
