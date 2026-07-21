import { describe, expect, it } from "vitest";
import {
	channelLabelKey,
	isValidChannelLabelMap,
	MAX_CHANNEL_LABEL_LENGTH,
	resolveChannelLabel,
	sanitizeLabel,
} from "../src/config.js";

describe("sanitizeLabel", () => {
	it("returns null for null input", () => {
		expect(sanitizeLabel(null)).toBeNull();
	});

	it("returns null for undefined input", () => {
		expect(sanitizeLabel(undefined)).toBeNull();
	});

	it("passes through a clean string", () => {
		expect(sanitizeLabel("Brisket Flat")).toBe("Brisket Flat");
	});

	it("strips ANSI escape sequences", () => {
		expect(sanitizeLabel("\x1b[31mred\x1b[0m")).toBe("red");
	});

	it("strips control characters", () => {
		expect(sanitizeLabel("hello\x00world\x07")).toBe("helloworld");
	});

	it("strips C1 control characters (8-bit CSI/OSC)", () => {
		// U+009B (CSI) and U+009F (APC) are C1 controls some terminals honor.
		expect(sanitizeLabel("a\u009bb\u009fc")).toBe("abc");
	});

	it("truncates to MAX_CHANNEL_LABEL_LENGTH", () => {
		const long = "A".repeat(100);
		const result = sanitizeLabel(long);
		expect(result?.length).toBe(MAX_CHANNEL_LABEL_LENGTH);
	});
});

describe("channelLabelKey", () => {
	it("builds key from string channel number", () => {
		expect(channelLabelKey("ABC123", "2")).toBe("ABC123:2");
	});

	it("builds key from numeric channel number", () => {
		expect(channelLabelKey("ABC123", 3)).toBe("ABC123:3");
	});
});

describe("resolveChannelLabel", () => {
	it("returns custom label when set in map", () => {
		const labels = { "SN1:1": "Pit" };
		const channel = { label: "Cloud Name", number: "1" };
		expect(resolveChannelLabel("SN1", channel, labels, 0)).toBe("Pit");
	});

	it("falls back to cloud label when no custom label", () => {
		const channel = { label: "Cloud Name", number: "1" };
		expect(resolveChannelLabel("SN1", channel, {}, 0)).toBe("Cloud Name");
	});

	it("falls back to Ch N when no custom or cloud label", () => {
		const channel = { label: null, number: "2" };
		expect(resolveChannelLabel("SN1", channel, {}, 1)).toBe("Ch 2");
	});

	it("uses index+1 when channel.number is null", () => {
		const channel = { label: null, number: null };
		expect(resolveChannelLabel("SN1", channel, undefined, 2)).toBe("Ch 3");
	});

	it("handles undefined channelLabels", () => {
		const channel = { label: "Probe", number: "1" };
		expect(resolveChannelLabel("SN1", channel, undefined, 0)).toBe("Probe");
	});

	it("prefers custom label over cloud label", () => {
		const labels = { "SN1:1": "Custom" };
		const channel = { label: "Cloud", number: "1" };
		expect(resolveChannelLabel("SN1", channel, labels, 0)).toBe("Custom");
	});

	it("returns Ch N when label map has entry for different device", () => {
		const labels = { "OTHER:1": "Not Me" };
		const channel = { label: null, number: "1" };
		expect(resolveChannelLabel("SN1", channel, labels, 0)).toBe("Ch 1");
	});
});

describe("isValidChannelLabelMap", () => {
	it("accepts an empty object", () => {
		expect(isValidChannelLabelMap({})).toBe(true);
	});

	it("accepts an object with string values", () => {
		expect(isValidChannelLabelMap({ "SN1:1": "Pit", "SN1:2": "Meat" })).toBe(true);
	});

	it("rejects null", () => {
		expect(isValidChannelLabelMap(null)).toBe(false);
	});

	it("rejects an array", () => {
		expect(isValidChannelLabelMap([])).toBe(false);
	});

	it("rejects non-string values", () => {
		expect(isValidChannelLabelMap({ "SN1:1": 42 })).toBe(false);
	});

	it("rejects mixed valid and invalid values", () => {
		expect(isValidChannelLabelMap({ "SN1:1": "Pit", "SN1:2": true })).toBe(false);
	});
});
