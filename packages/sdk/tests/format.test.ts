import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatTimeAgo } from "../src/format.js";

describe("formatTimeAgo", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-06T12:00:00.000Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns 'Never' for null", () => {
		expect(formatTimeAgo(null)).toBe("Never");
	});

	it("returns 'Just now' for less than 60 seconds ago", () => {
		const date = new Date(Date.now() - 30_000);
		expect(formatTimeAgo(date)).toBe("Just now");
	});

	it("returns 'Just now' for exactly now", () => {
		const date = new Date(Date.now());
		expect(formatTimeAgo(date)).toBe("Just now");
	});

	it("returns minutes ago for 1-59 minutes", () => {
		const oneMin = new Date(Date.now() - 60_000);
		expect(formatTimeAgo(oneMin)).toBe("1m ago");

		const fiveMin = new Date(Date.now() - 5 * 60_000);
		expect(formatTimeAgo(fiveMin)).toBe("5m ago");

		const fiftyNineMin = new Date(Date.now() - 59 * 60_000);
		expect(formatTimeAgo(fiftyNineMin)).toBe("59m ago");
	});

	it("returns hours ago for 1-23 hours", () => {
		const oneHour = new Date(Date.now() - 60 * 60_000);
		expect(formatTimeAgo(oneHour)).toBe("1h ago");

		const threeHours = new Date(Date.now() - 3 * 60 * 60_000);
		expect(formatTimeAgo(threeHours)).toBe("3h ago");

		const twentyThreeHours = new Date(Date.now() - 23 * 60 * 60_000);
		expect(formatTimeAgo(twentyThreeHours)).toBe("23h ago");
	});

	it("returns days ago for 24+ hours", () => {
		const oneDay = new Date(Date.now() - 24 * 60 * 60_000);
		expect(formatTimeAgo(oneDay)).toBe("1d ago");

		const twoDays = new Date(Date.now() - 2 * 24 * 60 * 60_000);
		expect(formatTimeAgo(twoDays)).toBe("2d ago");

		const thirtyDays = new Date(Date.now() - 30 * 24 * 60 * 60_000);
		expect(formatTimeAgo(thirtyDays)).toBe("30d ago");
	});
});
