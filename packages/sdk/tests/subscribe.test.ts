import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ChannelFetcher, type ChannelUpdate, createSubscription } from "../src/subscribe.js";
import type { DeviceChannel } from "../src/types.js";

function makeChannel(overrides: Partial<DeviceChannel> = {}): DeviceChannel {
	return {
		value: 72.5,
		units: "F",
		label: "Probe 1",
		status: "online",
		type: "temperature",
		number: "1",
		enabled: true,
		color: "#ff0000",
		lastSeen: new Date("2026-06-01T12:00:00.000Z"),
		lastTelemetrySaved: null,
		lastEventId: null,
		showAvgTemp: null,
		estimatedAlarmStatus: null,
		rateOfChange: null,
		rateOfChangeUnit: null,
		alarmHigh: null,
		alarmLow: null,
		minimum: null,
		maximum: null,
		...overrides,
	};
}

describe("createSubscription", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("fires callback immediately on subscribe with initial state", async () => {
		const channels = [makeChannel({ number: "1", value: 72.5 })];
		const fetcher: ChannelFetcher = vi.fn().mockResolvedValue(channels);
		const updates: ChannelUpdate[] = [];

		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u));

		// Let the initial poll complete
		await vi.advanceTimersByTimeAsync(0);

		expect(updates).toHaveLength(1);
		expect(updates[0]).toEqual({
			serial: "ABC123",
			channel: 1,
			value: 72.5,
			units: "F",
			status: "online",
			timestamp: "2026-06-01T12:00:00.000Z",
		});

		sub.unsubscribe();
	});

	it("deduplicates - does not fire callback when value unchanged", async () => {
		const channels = [makeChannel({ number: "1", value: 72.5 })];
		const fetcher: ChannelFetcher = vi.fn().mockResolvedValue(channels);
		const updates: ChannelUpdate[] = [];

		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u), {
			intervalMs: 5000,
		});

		// Initial poll
		await vi.advanceTimersByTimeAsync(0);
		expect(updates).toHaveLength(1);

		// Advance timer - same data returned
		await vi.advanceTimersByTimeAsync(5000);
		expect(updates).toHaveLength(1); // Still 1 - deduplicated

		sub.unsubscribe();
	});

	it("fires callback when value changes between polls", async () => {
		const fetcher: ChannelFetcher = vi
			.fn()
			.mockResolvedValueOnce([makeChannel({ number: "1", value: 72.5 })])
			.mockResolvedValueOnce([makeChannel({ number: "1", value: 75.0 })]);
		const updates: ChannelUpdate[] = [];

		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u), {
			intervalMs: 5000,
		});

		// Initial poll
		await vi.advanceTimersByTimeAsync(0);
		expect(updates).toHaveLength(1);
		expect(updates[0]?.value).toBe(72.5);

		// Next poll with changed value
		await vi.advanceTimersByTimeAsync(5000);
		expect(updates).toHaveLength(2);
		expect(updates[1]?.value).toBe(75.0);

		sub.unsubscribe();
	});

	it("fires callback when units change", async () => {
		const fetcher: ChannelFetcher = vi
			.fn()
			.mockResolvedValueOnce([makeChannel({ number: "1", value: 72.5, units: "F" })])
			.mockResolvedValueOnce([makeChannel({ number: "1", value: 72.5, units: "C" })]);
		const updates: ChannelUpdate[] = [];

		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u), {
			intervalMs: 5000,
		});

		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(5000);

		expect(updates).toHaveLength(2);
		expect(updates[1]?.units).toBe("C");

		sub.unsubscribe();
	});

	it("fires callback when status changes", async () => {
		const fetcher: ChannelFetcher = vi
			.fn()
			.mockResolvedValueOnce([makeChannel({ number: "1", status: "online" })])
			.mockResolvedValueOnce([makeChannel({ number: "1", status: "offline" })]);
		const updates: ChannelUpdate[] = [];

		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u), {
			intervalMs: 5000,
		});

		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(5000);

		expect(updates).toHaveLength(2);
		expect(updates[1]?.status).toBe("offline");

		sub.unsubscribe();
	});

	it("handles multiple channels independently", async () => {
		const fetcher: ChannelFetcher = vi
			.fn()
			.mockResolvedValueOnce([
				makeChannel({ number: "1", value: 72.5 }),
				makeChannel({ number: "2", value: 150.0 }),
			])
			.mockResolvedValueOnce([
				makeChannel({ number: "1", value: 72.5 }), // unchanged
				makeChannel({ number: "2", value: 155.0 }), // changed
			]);
		const updates: ChannelUpdate[] = [];

		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u), {
			intervalMs: 5000,
		});

		await vi.advanceTimersByTimeAsync(0);
		expect(updates).toHaveLength(2); // Both channels fire on first poll

		await vi.advanceTimersByTimeAsync(5000);
		expect(updates).toHaveLength(3); // Only channel 2 changed
		expect(updates[2]?.channel).toBe(2);
		expect(updates[2]?.value).toBe(155.0);

		sub.unsubscribe();
	});

	it("unsubscribe stops polling", async () => {
		const fetcher: ChannelFetcher = vi.fn().mockResolvedValue([makeChannel()]);
		const updates: ChannelUpdate[] = [];

		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u), {
			intervalMs: 5000,
		});

		await vi.advanceTimersByTimeAsync(0);
		expect(fetcher).toHaveBeenCalledTimes(1);

		sub.unsubscribe();

		await vi.advanceTimersByTimeAsync(5000);
		// No more calls after unsubscribe
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it("unsubscribe is idempotent", async () => {
		const fetcher: ChannelFetcher = vi.fn().mockResolvedValue([makeChannel()]);
		const sub = createSubscription("ABC123", fetcher, () => {});

		await vi.advanceTimersByTimeAsync(0);

		// Call unsubscribe multiple times - should not throw
		sub.unsubscribe();
		sub.unsubscribe();
		sub.unsubscribe();
	});

	it("calls onError when fetcher throws", async () => {
		const error = new Error("network failure");
		const fetcher: ChannelFetcher = vi.fn().mockRejectedValue(error);
		const errors: Error[] = [];
		const updates: ChannelUpdate[] = [];

		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u), {
			intervalMs: 5000,
			onError: (e) => errors.push(e),
		});

		await vi.advanceTimersByTimeAsync(0);

		expect(updates).toHaveLength(0);
		expect(errors).toHaveLength(1);
		expect(errors[0]?.message).toBe("network failure");

		sub.unsubscribe();
	});

	it("swallows errors silently when onError is not provided", async () => {
		const fetcher: ChannelFetcher = vi.fn().mockRejectedValue(new Error("oops"));
		const updates: ChannelUpdate[] = [];

		// Should not throw
		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u), {
			intervalMs: 5000,
		});

		await vi.advanceTimersByTimeAsync(0);
		expect(updates).toHaveLength(0);

		sub.unsubscribe();
	});

	it("continues polling after an error", async () => {
		const fetcher: ChannelFetcher = vi
			.fn()
			.mockRejectedValueOnce(new Error("transient"))
			.mockResolvedValueOnce([makeChannel({ number: "1", value: 80.0 })]);
		const updates: ChannelUpdate[] = [];
		const errors: Error[] = [];

		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u), {
			intervalMs: 5000,
			onError: (e) => errors.push(e),
		});

		// First poll - error
		await vi.advanceTimersByTimeAsync(0);
		expect(errors).toHaveLength(1);
		expect(updates).toHaveLength(0);

		// Second poll - success
		await vi.advanceTimersByTimeAsync(5000);
		expect(updates).toHaveLength(1);
		expect(updates[0]?.value).toBe(80.0);

		sub.unsubscribe();
	});

	it("uses default interval of 10000ms", async () => {
		const fetcher: ChannelFetcher = vi.fn().mockResolvedValue([makeChannel()]);

		const sub = createSubscription("ABC123", fetcher, () => {});

		await vi.advanceTimersByTimeAsync(0);
		expect(fetcher).toHaveBeenCalledTimes(1);

		// Advance less than default interval - no new poll
		await vi.advanceTimersByTimeAsync(9999);
		expect(fetcher).toHaveBeenCalledTimes(1);

		// Advance to exactly 10000ms - new poll
		await vi.advanceTimersByTimeAsync(1);
		expect(fetcher).toHaveBeenCalledTimes(2);

		sub.unsubscribe();
	});

	it("handles null value in channel correctly", async () => {
		const fetcher: ChannelFetcher = vi
			.fn()
			.mockResolvedValueOnce([makeChannel({ number: "1", value: null, units: null, status: null })])
			.mockResolvedValueOnce([
				makeChannel({ number: "1", value: 50.0, units: "F", status: "online" }),
			]);
		const updates: ChannelUpdate[] = [];

		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u), {
			intervalMs: 5000,
		});

		await vi.advanceTimersByTimeAsync(0);
		expect(updates).toHaveLength(1);
		expect(updates[0]?.value).toBeNull();
		expect(updates[0]?.units).toBeNull();

		await vi.advanceTimersByTimeAsync(5000);
		expect(updates).toHaveLength(2);
		expect(updates[1]?.value).toBe(50.0);

		sub.unsubscribe();
	});

	it("skips channels with null or non-numeric number field", async () => {
		const fetcher: ChannelFetcher = vi
			.fn()
			.mockResolvedValue([
				makeChannel({ number: null, value: 72.5 }),
				makeChannel({ number: "abc", value: 80.0 }),
				makeChannel({ number: "2", value: 100.0 }),
			]);
		const updates: ChannelUpdate[] = [];

		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u));

		await vi.advanceTimersByTimeAsync(0);

		// Only channel "2" should produce an update
		expect(updates).toHaveLength(1);
		expect(updates[0]?.channel).toBe(2);

		sub.unsubscribe();
	});

	it("handles lastSeen being null as timestamp null", async () => {
		const fetcher: ChannelFetcher = vi
			.fn()
			.mockResolvedValue([makeChannel({ number: "1", lastSeen: null })]);
		const updates: ChannelUpdate[] = [];

		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u));

		await vi.advanceTimersByTimeAsync(0);
		expect(updates[0]?.timestamp).toBeNull();

		sub.unsubscribe();
	});

	it("does not fire callback after unsubscribe even if poll is in-flight", async () => {
		let resolvePromise: ((val: DeviceChannel[]) => void) | undefined;
		const delayedPromise = new Promise<DeviceChannel[]>((resolve) => {
			resolvePromise = resolve;
		});
		const fetcher: ChannelFetcher = vi.fn().mockReturnValue(delayedPromise);
		const updates: ChannelUpdate[] = [];

		const sub = createSubscription("ABC123", fetcher, (u) => updates.push(u));

		// Unsubscribe while poll is in-flight
		sub.unsubscribe();

		// Now resolve the pending fetch
		resolvePromise?.([makeChannel({ number: "1", value: 99.0 })]);
		await vi.advanceTimersByTimeAsync(0);

		// Should not have fired callback
		expect(updates).toHaveLength(0);
	});

	it("wraps non-Error thrown values in Error for onError", async () => {
		const fetcher: ChannelFetcher = vi.fn().mockRejectedValue("string error");
		const errors: Error[] = [];

		const sub = createSubscription("ABC123", fetcher, () => {}, {
			onError: (e) => errors.push(e),
		});

		await vi.advanceTimersByTimeAsync(0);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toBeInstanceOf(Error);
		expect(errors[0]?.message).toBe("string error");

		sub.unsubscribe();
	});
});
