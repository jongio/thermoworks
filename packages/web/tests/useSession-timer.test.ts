import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThermoworksWebClient } from "../src/lib/api.ts";
import { useSession } from "../src/hooks/useSession.ts";

function createMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		startSession: vi.fn().mockResolvedValue({ success: true }),
		endSession: vi.fn().mockResolvedValue({ success: true }),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

describe("useSession timer branches", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns inactive when no session", () => {
		const client = createMockClient();
		const { result } = renderHook(() => useSession(client, "X", null, null));
		expect(result.current.isActive).toBe(false);
		expect(result.current.elapsed).toBe("00:00:00");
	});

	it("ticks elapsed", () => {
		const s = new Date(Date.now() - 3000);
		const client = createMockClient();
		const { result } = renderHook(() => useSession(client, "X", s, null));
		expect(result.current.elapsed).toBe("00:00:03");
		act(() => { vi.advanceTimersByTime(2000); });
		expect(result.current.elapsed).toBe("00:00:05");
	});

	it("resets on deactivation", () => {
		const s = new Date(Date.now() - 1000);
		const client = createMockClient();
		const { result, rerender } = renderHook(
			({ start }) => useSession(client, "X", start, null),
			{ initialProps: { start: s as Date | null } },
		);
		expect(result.current.isActive).toBe(true);
		rerender({ start: null });
		expect(result.current.elapsed).toBe("00:00:00");
	});

	it("formats hours", () => {
		const s = new Date(Date.now() - 8_130_000);
		const client = createMockClient();
		const { result } = renderHook(() => useSession(client, "X", s, null));
		expect(result.current.elapsed).toBe("02:15:30");
	});
});
