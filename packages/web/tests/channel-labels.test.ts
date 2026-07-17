import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { channelLabelKey, resolveChannelLabel } from "../src/hooks/useChannelLabels.ts";

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
});

describe("channelLabelKey", () => {
	it("joins serial and channel number with colon", () => {
		expect(channelLabelKey("SN1", "2")).toBe("SN1:2");
	});

	it("accepts numeric channel number", () => {
		expect(channelLabelKey("SN1", 3)).toBe("SN1:3");
	});
});

describe("resolveChannelLabel", () => {
	it("returns custom label when present", () => {
		const labels = { "SN1:1": "Brisket" };
		expect(resolveChannelLabel("SN1", { label: "Cloud", number: "1" }, labels, 0)).toBe("Brisket");
	});

	it("falls back to cloud label", () => {
		expect(resolveChannelLabel("SN1", { label: "Probe A", number: "1" }, {}, 0)).toBe("Probe A");
	});

	it("falls back to Ch N when no labels", () => {
		expect(resolveChannelLabel("SN1", { label: null, number: "2" }, {}, 1)).toBe("Ch 2");
	});

	it("uses index+1 when number is null", () => {
		expect(resolveChannelLabel("SN1", { label: null, number: null }, {}, 3)).toBe("Ch 4");
	});
});
