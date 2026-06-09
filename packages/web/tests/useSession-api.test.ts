import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSession } from "../src/hooks/useSession.ts";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

function createMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		startSession: vi.fn().mockResolvedValue({ success: true }),
		endSession: vi.fn().mockResolvedValue({ success: true }),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

describe("useSession API branches", () => {
	it("does nothing when client is null", async () => {
		const { result } = renderHook(() => useSession(null, "X", null, null));
		await act(async () => {
			await result.current.startSession("Test");
		});
		expect(result.current.error).toBeNull();
	});

	it("skips start when unauthenticated", async () => {
		const startSession = vi.fn().mockResolvedValue({ success: true });
		const client = createMockClient({
			isAuthenticated: false,
			startSession,
		} as unknown as Partial<ThermoworksWebClient>);
		const { result } = renderHook(() => useSession(client, "X", null, null));
		await act(async () => {
			await result.current.startSession("Test");
		});
		expect(startSession).not.toHaveBeenCalled();
	});

	it("sets error when startSession throws", async () => {
		const client = createMockClient({ startSession: vi.fn().mockRejectedValue(new Error("fail")) });
		const { result } = renderHook(() => useSession(client, "X", null, null));
		await act(async () => {
			await result.current.startSession("Test");
		});
		expect(result.current.error).toBe("fail");
	});

	it("handles non-Error thrown values", async () => {
		const client = createMockClient({ startSession: vi.fn().mockRejectedValue("oops") });
		const { result } = renderHook(() => useSession(client, "X", null, null));
		await act(async () => {
			await result.current.startSession();
		});
		expect(result.current.error).toBe("Failed to start session");
	});
});
