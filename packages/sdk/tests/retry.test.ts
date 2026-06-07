import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NetworkError } from "../src/types.js";

vi.mock("undici", () => {
	const mockRequest = vi.fn();
	class MockAgent {
		close = vi.fn();
	}
	return {
		Agent: MockAgent,
		request: mockRequest,
	};
});

import { request as undiciRequest } from "undici";

const mockRequest = vi.mocked(undiciRequest);

function mockRes(statusCode: number, body: unknown, headers: Record<string, string> = {}) {
	return {
		statusCode,
		headers,
		body: { text: async () => JSON.stringify(body) },
	};
}

/** Create mock responses for auth setup (web config + login). */
function mockAuthSetup() {
	mockRequest.mockResolvedValueOnce(mockRes(200, { projectId: "thermoworks-app" }) as any);
	mockRequest.mockResolvedValueOnce(
		mockRes(200, {
			idToken: "test-token",
			refreshToken: "test-refresh",
			localId: "user123",
			expiresIn: "3600",
		}) as any,
	);
}

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe("computeRetryDelay", () => {
	let computeRetryDelay: typeof import("../src/auth.js")["computeRetryDelay"];

	beforeEach(async () => {
		const mod = await import("../src/auth.js");
		computeRetryDelay = mod.computeRetryDelay;
	});

	it("returns a value between 0 and baseDelay * 2^attempt", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		// attempt 0: min(1000 * 2^0, 30000) = 1000; jitter: 0.5 * 1000 = 500
		const delay = computeRetryDelay(0, 1000, 30_000);
		expect(delay).toBe(500);
	});

	it("applies exponential growth per attempt", () => {
		vi.spyOn(Math, "random").mockReturnValue(1); // max jitter = full delay
		// attempt 0: 1000 * 1 = 1000
		expect(computeRetryDelay(0, 1000, 30_000)).toBe(1000);
		// attempt 1: 1000 * 2 = 2000
		expect(computeRetryDelay(1, 1000, 30_000)).toBe(2000);
		// attempt 2: 1000 * 4 = 4000
		expect(computeRetryDelay(2, 1000, 30_000)).toBe(4000);
		// attempt 3: 1000 * 8 = 8000
		expect(computeRetryDelay(3, 1000, 30_000)).toBe(8000);
	});

	it("caps delay at maxDelayMs", () => {
		vi.spyOn(Math, "random").mockReturnValue(1);
		// attempt 10: 1000 * 2^10 = 1024000 -> capped at 30000
		const delay = computeRetryDelay(10, 1000, 30_000);
		expect(delay).toBe(30_000);
	});

	it("respects Retry-After header as seconds", () => {
		vi.spyOn(Math, "random").mockReturnValue(1);
		// Retry-After: 5 seconds = 5000ms. Attempt 0: base would be 1000, but floor is 5000.
		const delay = computeRetryDelay(0, 1000, 30_000, "5");
		expect(delay).toBe(5000);
	});

	it("respects Retry-After header as HTTP date", () => {
		vi.spyOn(Math, "random").mockReturnValue(1);
		const futureDate = new Date(Date.now() + 3000).toUTCString();
		const delay = computeRetryDelay(0, 1000, 30_000, futureDate);
		// Should be approximately 3000ms (within tolerance for timing)
		expect(delay).toBeGreaterThan(2500);
		expect(delay).toBeLessThanOrEqual(30_000);
	});

	it("ignores invalid Retry-After header", () => {
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		const delay = computeRetryDelay(0, 1000, 30_000, "not-a-number-or-date");
		// Falls back to exponential: 0.5 * 1000 = 500
		expect(delay).toBe(500);
	});

	it("returns 0 when random is 0", () => {
		vi.spyOn(Math, "random").mockReturnValue(0);
		const delay = computeRetryDelay(0, 1000, 30_000);
		expect(delay).toBe(0);
	});
});

describe("retry on HTTP 429 (rate limit)", () => {
	it("retries on 429 and succeeds on subsequent attempt", async () => {
		mockAuthSetup();
		// First API call returns 429, second succeeds
		mockRequest.mockResolvedValueOnce(
			mockRes(429, { error: "rate limited" }, { "retry-after": "1" }) as any,
		);
		mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

		vi.spyOn(Math, "random").mockReturnValue(0); // zero jitter for fast test

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass", undefined, undefined, {
			maxRetries: 3,
			baseDelayMs: 10,
			maxDelayMs: 100,
		});
		const response = await session.request("GET", "documents/users/user123");

		expect(response.ok).toBe(true);
		// 2 auth calls + 2 API calls (1 retry + 1 success) = 4 total
		expect(mockRequest).toHaveBeenCalledTimes(4);
		session.close();
	});

	it("throws after exhausting retries on persistent 429", async () => {
		mockAuthSetup();
		// All attempts return 429
		for (let i = 0; i < 4; i++) {
			mockRequest.mockResolvedValueOnce(mockRes(429, { error: "rate limited" }) as any);
		}

		vi.spyOn(Math, "random").mockReturnValue(0);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass", undefined, undefined, {
			maxRetries: 3,
			baseDelayMs: 10,
			maxDelayMs: 100,
		});

		await expect(session.request("GET", "documents/users/user123")).rejects.toThrow(NetworkError);
		// 2 auth + 4 API attempts (1 initial + 3 retries) = 6
		expect(mockRequest).toHaveBeenCalledTimes(6);
		session.close();
	});
});

describe("retry on HTTP 503 (unavailable)", () => {
	it("retries on 503 and succeeds", async () => {
		mockAuthSetup();
		mockRequest.mockResolvedValueOnce(mockRes(503, { error: "unavailable" }) as any);
		mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

		vi.spyOn(Math, "random").mockReturnValue(0);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass", undefined, undefined, {
			maxRetries: 3,
			baseDelayMs: 10,
			maxDelayMs: 100,
		});
		const response = await session.request("GET", "documents/users/user123");

		expect(response.ok).toBe(true);
		expect(mockRequest).toHaveBeenCalledTimes(4);
		session.close();
	});
});

describe("no retry on client errors", () => {
	it("does not retry on 400 (bad request)", async () => {
		mockAuthSetup();
		mockRequest.mockResolvedValueOnce(mockRes(400, { error: "bad request" }) as any);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass", undefined, undefined, {
			maxRetries: 3,
			baseDelayMs: 10,
			maxDelayMs: 100,
		});

		await expect(session.request("GET", "documents/users/user123")).rejects.toThrow(NetworkError);
		// 2 auth + 1 API call (no retries) = 3
		expect(mockRequest).toHaveBeenCalledTimes(3);
		session.close();
	});

	it("does not retry on 401 (unauthorized)", async () => {
		mockAuthSetup();
		mockRequest.mockResolvedValueOnce(mockRes(401, { error: "unauthorized" }) as any);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass", undefined, undefined, {
			maxRetries: 3,
			baseDelayMs: 10,
			maxDelayMs: 100,
		});

		await expect(session.request("GET", "documents/users/user123")).rejects.toThrow(NetworkError);
		expect(mockRequest).toHaveBeenCalledTimes(3);
		session.close();
	});

	it("does not retry on 403 (forbidden)", async () => {
		mockAuthSetup();
		mockRequest.mockResolvedValueOnce(mockRes(403, { error: "forbidden" }) as any);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass", undefined, undefined, {
			maxRetries: 3,
			baseDelayMs: 10,
			maxDelayMs: 100,
		});

		await expect(session.request("GET", "documents/users/user123")).rejects.toThrow(NetworkError);
		expect(mockRequest).toHaveBeenCalledTimes(3);
		session.close();
	});

	it("does not retry on 404 (not found) - returns response directly", async () => {
		mockAuthSetup();
		mockRequest.mockResolvedValueOnce(mockRes(404, { error: "not found" }) as any);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass", undefined, undefined, {
			maxRetries: 3,
			baseDelayMs: 10,
			maxDelayMs: 100,
		});

		// 404 is handled specially by request() - it doesn't throw
		const response = await session.request("GET", "documents/users/user123");
		expect(response.status).toBe(404);
		expect(mockRequest).toHaveBeenCalledTimes(3);
		session.close();
	});
});

describe("retry on network errors", () => {
	it("retries when fetch throws a network error", async () => {
		mockAuthSetup();
		// First API call throws, second succeeds
		mockRequest.mockRejectedValueOnce(new TypeError("fetch failed"));
		mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

		vi.spyOn(Math, "random").mockReturnValue(0);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass", undefined, undefined, {
			maxRetries: 3,
			baseDelayMs: 10,
			maxDelayMs: 100,
		});
		const response = await session.request("GET", "documents/users/user123");

		expect(response.ok).toBe(true);
		expect(mockRequest).toHaveBeenCalledTimes(4);
		session.close();
	});

	it("throws NetworkError after all retries exhausted on network failure", async () => {
		mockAuthSetup();
		for (let i = 0; i < 4; i++) {
			mockRequest.mockRejectedValueOnce(new TypeError("fetch failed"));
		}

		vi.spyOn(Math, "random").mockReturnValue(0);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass", undefined, undefined, {
			maxRetries: 3,
			baseDelayMs: 10,
			maxDelayMs: 100,
		});

		await expect(session.request("GET", "documents/users/user123")).rejects.toThrow(NetworkError);
		// 2 auth + 4 attempts = 6
		expect(mockRequest).toHaveBeenCalledTimes(6);
		session.close();
	});
});

describe("max retries configuration", () => {
	it("respects maxRetries=0 (no retries)", async () => {
		mockAuthSetup();
		mockRequest.mockResolvedValueOnce(mockRes(503, { error: "unavailable" }) as any);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass", undefined, undefined, {
			maxRetries: 0,
			baseDelayMs: 10,
			maxDelayMs: 100,
		});

		// With maxRetries=0, 503 is returned directly (httpRequest doesn't retry)
		// But the request() method will throw NetworkError for non-404 errors
		await expect(session.request("GET", "documents/users/user123")).rejects.toThrow(NetworkError);
		// 2 auth + 1 API call = 3
		expect(mockRequest).toHaveBeenCalledTimes(3);
		session.close();
	});

	it("respects maxRetries=1 (one retry)", async () => {
		mockAuthSetup();
		mockRequest.mockResolvedValueOnce(mockRes(503, { error: "unavailable" }) as any);
		mockRequest.mockResolvedValueOnce(mockRes(503, { error: "unavailable" }) as any);

		vi.spyOn(Math, "random").mockReturnValue(0);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass", undefined, undefined, {
			maxRetries: 1,
			baseDelayMs: 10,
			maxDelayMs: 100,
		});

		await expect(session.request("GET", "documents/users/user123")).rejects.toThrow(NetworkError);
		// 2 auth + 2 API calls (1 initial + 1 retry) = 4
		expect(mockRequest).toHaveBeenCalledTimes(4);
		session.close();
	});
});

describe("exponential backoff timing", () => {
	it("waits with increasing delays between retries", async () => {
		const delays: number[] = [];
		const originalSetTimeout = globalThis.setTimeout;
		vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: any, ms?: number) => {
			delays.push(ms ?? 0);
			return originalSetTimeout(fn, 0); // execute immediately for test speed
		});
		vi.spyOn(Math, "random").mockReturnValue(1); // max jitter = full delay

		mockAuthSetup();
		// 3 retries then success
		mockRequest.mockResolvedValueOnce(mockRes(503, {}) as any);
		mockRequest.mockResolvedValueOnce(mockRes(503, {}) as any);
		mockRequest.mockResolvedValueOnce(mockRes(503, {}) as any);
		mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass", undefined, undefined, {
			maxRetries: 3,
			baseDelayMs: 100,
			maxDelayMs: 5000,
		});
		await session.request("GET", "documents/users/user123");

		// Filter delays from retry logic (skip any 0ms from immediate callbacks)
		const retryDelays = delays.filter((d) => d > 0);
		// With random=1: attempt 0 -> 100, attempt 1 -> 200, attempt 2 -> 400
		expect(retryDelays).toContain(100);
		expect(retryDelays).toContain(200);
		expect(retryDelays).toContain(400);
		session.close();
	});
});

describe("default retry config", () => {
	it("uses default values when no retry config is provided", async () => {
		mockAuthSetup();
		// Return 429 once then succeed - verify it still retries with defaults
		mockRequest.mockResolvedValueOnce(mockRes(429, {}) as any);
		mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

		vi.spyOn(Math, "random").mockReturnValue(0);

		const { createAuthSession } = await import("../src/auth.js");
		// No retry config - uses defaults (maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000)
		const session = await createAuthSession("test@example.com", "pass");
		const response = await session.request("GET", "documents/users/user123");

		expect(response.ok).toBe(true);
		expect(mockRequest).toHaveBeenCalledTimes(4);
		session.close();
	});
});

describe("retry on HTTP 500 (internal server error)", () => {
	it("retries on 500 and succeeds", async () => {
		mockAuthSetup();
		mockRequest.mockResolvedValueOnce(mockRes(500, { error: "internal" }) as any);
		mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

		vi.spyOn(Math, "random").mockReturnValue(0);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass", undefined, undefined, {
			maxRetries: 3,
			baseDelayMs: 10,
			maxDelayMs: 100,
		});
		const response = await session.request("GET", "documents/users/user123");

		expect(response.ok).toBe(true);
		expect(mockRequest).toHaveBeenCalledTimes(4);
		session.close();
	});
});
