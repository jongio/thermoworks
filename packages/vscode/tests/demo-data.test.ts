import { describe, expect, it } from "vitest";
import {
	DEMO_ARCHIVES,
	DEMO_DEVICES,
	getDemoChartPayload,
	getDemoLiveSeriesId,
	isDemoSerial,
} from "../src/demo-data";

describe("isDemoSerial", () => {
	it("identifies demo serials", () => {
		expect(isDemoSerial("DEMO-SIGNALS-4CH")).toBe(true);
		expect(isDemoSerial("ABC123")).toBe(false);
	});
});

describe("getDemoChartPayload", () => {
	it("returns a multi-channel, time-ordered payload for a known demo device", () => {
		const payload = getDemoChartPayload("DEMO-SIGNALS-4CH");
		expect(payload).not.toBeNull();
		expect(payload?.deviceLabel).toBe("Backyard Smoker");
		expect(payload?.source).toBe("history");
		expect(payload?.units).toBe("F");
		expect((payload?.series.length ?? 0) >= 2).toBe(true);
		expect(payload?.thresholds).toEqual({ high: 275, low: 200 });

		const points = payload?.series[0]?.points ?? [];
		expect(points.length).toBeGreaterThan(10);
		expect((points[0]?.t ?? 0) < (points.at(-1)?.t ?? 0)).toBe(true);
	});

	it("returns null for an unknown serial", () => {
		expect(getDemoChartPayload("NOPE")).toBeNull();
	});
});

describe("getDemoLiveSeriesId", () => {
	it("returns the primary channel id, or null when unknown", () => {
		expect(getDemoLiveSeriesId("DEMO-SIGNALS-4CH")).toBe("pit");
		expect(getDemoLiveSeriesId("NOPE")).toBeNull();
	});
});

describe("DEMO_ARCHIVES", () => {
	it("provides an archive with channel readings + min/max for every demo device", () => {
		for (const device of DEMO_DEVICES) {
			const archives = DEMO_ARCHIVES[device.serial];
			expect(archives, `archives for ${device.serial}`).toBeDefined();
			expect((archives?.length ?? 0) > 0).toBe(true);

			const archive = archives?.[0];
			expect(archive?.deviceLabel).toBe(device.label);
			expect((archive?.channels?.length ?? 0) > 0).toBe(true);

			const channel = archive?.channels?.[0];
			expect((channel?.recentReadings.length ?? 0) > 0).toBe(true);
			expect(channel?.minimum?.value).not.toBeNull();
			expect(channel?.maximum?.value).not.toBeNull();
			// min should not exceed max
			expect((channel?.minimum?.value ?? 0) <= (channel?.maximum?.value ?? 0)).toBe(true);
		}
	});
});
