import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRetry } from "../src/hooks/useRetry.ts";

describe("useRetry", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns initial state before execute is called", () => {
		const fn = vi.fn().mockResolvedValue("ok");
		const { result } = renderHook(() => useRetry(fn));

		expect(result.current.isRetrying).toBe(false);
		expect(result.current.attempts).toBe(0);
		expect(result.current.error).toBeNull();
	});

	it("succeeds on first attempt without retrying", async () => {
		const fn = vi.fn().mockResolvedValue("success");
		const { result } = renderHook(() => useRetry(fn));

		let returnValue: string | undefined;
		await act(async () => {
			returnValue = await result.current.execute();
		});

		expect(returnValue).toBe("success");
		expect(result.current.isRetrying).toBe(false);
		expect(result.current.attempts).toBe(1);
		expect(result.current.error).toBeNull();
	});

	it("retries on failure and succeeds on second attempt", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("fail 1"))
			.mockResolvedValueOnce("recovered");

		const { result } = renderHook(() => useRetry(fn, { maxAttempts: 3, delay: 1000 }));

		let returnValue: string | undefined;
		await act(async () => {
			const promise = result.current.execute();
			// Flush microtasks so first attempt resolves (fails)
			await vi.advanceTimersByTimeAsync(0);
			// Advance past backoff (1000ms)
			await vi.advanceTimersByTimeAsync(1000);
			returnValue = await promise;
		});

		expect(fn).toHaveBeenCalledTimes(2);
		expect(result.current.isRetrying).toBe(false);
		expect(result.current.attempts).toBe(2);
		expect(result.current.error).toBeNull();
		expect(returnValue).toBe("recovered");
	});

	it("sets error after max attempts are exhausted", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("persistent failure"));
		const { result } = renderHook(() => useRetry(fn, { maxAttempts: 3, delay: 100 }));

		let returnValue: unknown;
		await act(async () => {
			const promise = result.current.execute();
			// Flush attempt 1
			await vi.advanceTimersByTimeAsync(0);
			// Backoff 100ms, flush attempt 2
			await vi.advanceTimersByTimeAsync(100);
			// Backoff 200ms, flush attempt 3 (final)
			await vi.advanceTimersByTimeAsync(200);
			returnValue = await promise;
		});

		expect(returnValue).toBeUndefined();
		expect(fn).toHaveBeenCalledTimes(3);
		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("persistent failure");
		expect(result.current.isRetrying).toBe(false);
		expect(result.current.attempts).toBe(3);
	});

	it("aborts when execute is called again while retrying", async () => {
		let callCount = 0;
		const fn = vi.fn().mockImplementation(async () => {
			callCount++;
			if (callCount <= 2) throw new Error("fail");
			return "success";
		});

		const { result } = renderHook(() => useRetry(fn, { maxAttempts: 3, delay: 500 }));

		await act(async () => {
			// Start first execution — it will fail on attempt 1 and start backoff
			const firstPromise = result.current.execute();
			await vi.advanceTimersByTimeAsync(0); // flush attempt 1 fail

			// Start second execution (aborts first), resets callCount handling
			const secondPromise = result.current.execute();
			// Advance past all backoffs
			await vi.advanceTimersByTimeAsync(5000);

			await firstPromise;
			await secondPromise;
		});

		expect(result.current.isRetrying).toBe(false);
	});

	it("reset clears all state and aborts in-progress execution", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("fail"));
		const { result } = renderHook(() => useRetry(fn, { maxAttempts: 3, delay: 1000 }));

		await act(async () => {
			result.current.execute();
			// Let first attempt fail
			await vi.advanceTimersByTimeAsync(0);
		});

		// Reset mid-retry
		act(() => {
			result.current.reset();
		});

		expect(result.current.isRetrying).toBe(false);
		expect(result.current.attempts).toBe(0);
		expect(result.current.error).toBeNull();
	});

	it("uses exponential backoff with correct delays", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("fail"));
		const { result } = renderHook(() => useRetry(fn, { maxAttempts: 4, delay: 1000 }));

		await act(async () => {
			result.current.execute();
			// Attempt 1 at t=0 — fails immediately
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(fn).toHaveBeenCalledTimes(1);

		// Backoff after attempt 1: delay * 2^0 = 1000ms
		await act(async () => {
			await vi.advanceTimersByTimeAsync(999);
		});
		expect(fn).toHaveBeenCalledTimes(1); // not yet

		await act(async () => {
			await vi.advanceTimersByTimeAsync(1);
		});
		expect(fn).toHaveBeenCalledTimes(2); // attempt 2

		// Backoff after attempt 2: delay * 2^1 = 2000ms
		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000);
		});
		expect(fn).toHaveBeenCalledTimes(3); // attempt 3

		// Backoff after attempt 3: delay * 2^2 = 4000ms
		await act(async () => {
			await vi.advanceTimersByTimeAsync(4000);
		});
		expect(fn).toHaveBeenCalledTimes(4); // attempt 4 (final)
	});

	it("caps backoff at 30 seconds", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("fail"));
		const { result } = renderHook(() => useRetry(fn, { maxAttempts: 4, delay: 10_000 }));

		await act(async () => {
			result.current.execute();
			// Attempt 1 fails
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(fn).toHaveBeenCalledTimes(1);

		// Backoff: min(10000 * 2^0, 30000) = 10000
		await act(async () => {
			await vi.advanceTimersByTimeAsync(10_000);
		});
		expect(fn).toHaveBeenCalledTimes(2);

		// Backoff: min(10000 * 2^1, 30000) = 20000
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000);
		});
		expect(fn).toHaveBeenCalledTimes(3);

		// Backoff: min(10000 * 2^2, 30000) = min(40000, 30000) = 30000
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(fn).toHaveBeenCalledTimes(4);
	});

	it("wraps non-Error thrown values in Error", async () => {
		const fn = vi.fn().mockRejectedValue("string error");
		const { result } = renderHook(() => useRetry(fn, { maxAttempts: 1, delay: 100 }));

		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.error).toBeInstanceOf(Error);
		expect(result.current.error?.message).toBe("string error");
	});

	it("uses default maxAttempts of 3 and delay of 1000", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("fail"));
		const { result } = renderHook(() => useRetry(fn));

		await act(async () => {
			const promise = result.current.execute();
			// Flush all attempts: attempt 1 + 1000ms + attempt 2 + 2000ms + attempt 3
			await vi.advanceTimersByTimeAsync(3100);
			await promise;
		});

		expect(fn).toHaveBeenCalledTimes(3);
		expect(result.current.error?.message).toBe("fail");
	});
});
