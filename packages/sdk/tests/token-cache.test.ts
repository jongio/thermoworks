import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function mockRes(statusCode: number, body: unknown) {
	return { statusCode, headers: {}, body: { text: async () => JSON.stringify(body) } };
}

let testDir: string;

beforeEach(async () => {
	mockRequest.mockReset();
	testDir = join(
		tmpdir(),
		`tw-token-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
	vi.clearAllMocks();
	await rm(testDir, { recursive: true, force: true });
});

describe("token-cache module", () => {
	describe("readTokenCache", () => {
		it("returns null for missing file", async () => {
			const { readTokenCache } = await import("../src/token-cache.js");
			const result = await readTokenCache(join(testDir, "nonexistent.json"));
			expect(result).toBeNull();
		});

		it("returns null for corrupt JSON", async () => {
			const cachePath = join(testDir, "corrupt.json");
			await writeFile(cachePath, "not-json{{{", "utf8");

			const { readTokenCache } = await import("../src/token-cache.js");
			const result = await readTokenCache(cachePath);
			expect(result).toBeNull();
		});

		it("returns null for malformed data (missing fields)", async () => {
			const cachePath = join(testDir, "partial.json");
			await writeFile(cachePath, JSON.stringify({ idToken: "tok" }), "utf8");

			const { readTokenCache } = await import("../src/token-cache.js");
			const result = await readTokenCache(cachePath);
			expect(result).toBeNull();
		});

		it("returns null for invalid expiresAt date", async () => {
			const cachePath = join(testDir, "bad-date.json");
			await writeFile(
				cachePath,
				JSON.stringify({
					idToken: "tok",
					refreshToken: "ref",
					userId: "uid",
					expiresAt: "not-a-date",
					projectId: "proj",
				}),
				"utf8",
			);

			const { readTokenCache } = await import("../src/token-cache.js");
			const result = await readTokenCache(cachePath);
			expect(result).toBeNull();
		});

		it("reads valid cache data", async () => {
			const cachePath = join(testDir, "valid.json");
			const data = {
				idToken: "my-id-token",
				refreshToken: "my-refresh-token",
				userId: "user123",
				expiresAt: new Date(Date.now() + 3600_000).toISOString(),
				projectId: "thermoworks-cloud-production",
			};
			await writeFile(cachePath, JSON.stringify(data), "utf8");

			const { readTokenCache } = await import("../src/token-cache.js");
			const result = await readTokenCache(cachePath);
			expect(result).toEqual(data);
		});
	});

	describe("writeTokenCache", () => {
		it("creates parent directories and writes cache", async () => {
			const cachePath = join(testDir, "sub", "dir", "cache.json");

			const { writeTokenCache } = await import("../src/token-cache.js");
			const data = {
				idToken: "tok",
				refreshToken: "ref",
				userId: "uid",
				expiresAt: new Date().toISOString(),
				projectId: "proj",
			};
			await writeTokenCache(cachePath, data);

			const raw = await readFile(cachePath, "utf8");
			expect(JSON.parse(raw)).toEqual(data);
		});
	});

	describe("invalidateTokenCache", () => {
		it("removes cache file", async () => {
			const cachePath = join(testDir, "to-delete.json");
			await writeFile(cachePath, "{}", "utf8");

			const { invalidateTokenCache } = await import("../src/token-cache.js");
			await invalidateTokenCache(cachePath);

			await expect(readFile(cachePath, "utf8")).rejects.toThrow();
		});

		it("does not throw for missing file", async () => {
			const { invalidateTokenCache } = await import("../src/token-cache.js");
			await expect(invalidateTokenCache(join(testDir, "nope.json"))).resolves.toBeUndefined();
		});
	});

	describe("resolveTokenCachePath", () => {
		it("returns custom path when provided", async () => {
			const { resolveTokenCachePath } = await import("../src/token-cache.js");
			expect(resolveTokenCachePath("/custom/path.json")).toBe("/custom/path.json");
		});

		it("returns default path when no argument", async () => {
			const { resolveTokenCachePath } = await import("../src/token-cache.js");
			const result = resolveTokenCachePath();
			expect(result).toContain(".thermoworks");
			expect(result).toContain(".token-cache.json");
		});
	});
});

describe("createAuthSession with token caching", () => {
	it("cache hit - uses cached token without network calls", async () => {
		const cachePath = join(testDir, "cached.json");
		const futureExpiry = new Date(Date.now() + 3600_000).toISOString();
		await writeFile(
			cachePath,
			JSON.stringify({
				idToken: "cached-id-token",
				refreshToken: "cached-refresh-token",
				userId: "cached-user",
				expiresAt: futureExpiry,
				projectId: "thermoworks-app",
			}),
			"utf8",
		);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession({
			email: "test@example.com",
			password: "pass",
			tokenCachePath: cachePath,
		});

		expect(session.getUserId()).toBe("cached-user");
		// No network calls made - token was valid in cache
		expect(mockRequest).not.toHaveBeenCalled();
	});

	it("cache miss - full login and writes cache", async () => {
		const cachePath = join(testDir, "miss.json");

		mockRequest.mockResolvedValueOnce(mockRes(200, { projectId: "thermoworks-app" }) as any);
		mockRequest.mockResolvedValueOnce(
			mockRes(200, {
				idToken: "fresh-token",
				refreshToken: "fresh-refresh",
				localId: "fresh-user",
				expiresIn: "3600",
			}) as any,
		);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession({
			email: "test@example.com",
			password: "pass",
			tokenCachePath: cachePath,
		});

		expect(session.getUserId()).toBe("fresh-user");
		expect(mockRequest).toHaveBeenCalledTimes(2);

		// Verify cache was written
		const raw = await readFile(cachePath, "utf8");
		const cached = JSON.parse(raw);
		expect(cached.idToken).toBe("fresh-token");
		expect(cached.refreshToken).toBe("fresh-refresh");
		expect(cached.userId).toBe("fresh-user");
		expect(cached.projectId).toBe("thermoworks-app");
	});

	it("expired token - refreshes and updates cache", async () => {
		const cachePath = join(testDir, "expired.json");
		const pastExpiry = new Date(Date.now() - 120_000).toISOString();
		await writeFile(
			cachePath,
			JSON.stringify({
				idToken: "expired-token",
				refreshToken: "still-valid-refresh",
				userId: "user123",
				expiresAt: pastExpiry,
				projectId: "thermoworks-app",
			}),
			"utf8",
		);

		// Mock the token refresh call
		mockRequest.mockResolvedValueOnce(
			mockRes(200, {
				id_token: "refreshed-token",
				refresh_token: "new-refresh",
				user_id: "user123",
				expires_in: "3600",
			}) as any,
		);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession({
			email: "test@example.com",
			password: "pass",
			tokenCachePath: cachePath,
		});

		expect(session.getUserId()).toBe("user123");
		// Only one call: the token refresh (no webConfig, no login)
		expect(mockRequest).toHaveBeenCalledTimes(1);

		// Verify cache was updated
		const raw = await readFile(cachePath, "utf8");
		const cached = JSON.parse(raw);
		expect(cached.idToken).toBe("refreshed-token");
		expect(cached.refreshToken).toBe("new-refresh");
	});

	it("refresh failure - falls back to full re-auth", async () => {
		const cachePath = join(testDir, "refresh-fail.json");
		const pastExpiry = new Date(Date.now() - 120_000).toISOString();
		await writeFile(
			cachePath,
			JSON.stringify({
				idToken: "expired-token",
				refreshToken: "invalid-refresh",
				userId: "user123",
				expiresAt: pastExpiry,
				projectId: "thermoworks-app",
			}),
			"utf8",
		);

		// First call: token refresh fails
		mockRequest.mockResolvedValueOnce(mockRes(400, { error: { message: "TOKEN_EXPIRED" } }) as any);
		// Second call: fetchWebConfig succeeds
		mockRequest.mockResolvedValueOnce(mockRes(200, { projectId: "thermoworks-app" }) as any);
		// Third call: full login succeeds
		mockRequest.mockResolvedValueOnce(
			mockRes(200, {
				idToken: "new-login-token",
				refreshToken: "new-login-refresh",
				localId: "user123",
				expiresIn: "3600",
			}) as any,
		);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession({
			email: "test@example.com",
			password: "pass",
			tokenCachePath: cachePath,
		});

		expect(session.getUserId()).toBe("user123");
		// 3 calls: failed refresh + webConfig + login
		expect(mockRequest).toHaveBeenCalledTimes(3);

		// Verify cache was updated with new tokens
		const raw = await readFile(cachePath, "utf8");
		const cached = JSON.parse(raw);
		expect(cached.idToken).toBe("new-login-token");
	});

	it("caching disabled - behaves like original (no cache reads/writes)", async () => {
		mockRequest.mockResolvedValueOnce(mockRes(200, { projectId: "thermoworks-app" }) as any);
		mockRequest.mockResolvedValueOnce(
			mockRes(200, {
				idToken: "tok",
				refreshToken: "ref",
				localId: "user1",
				expiresIn: "3600",
			}) as any,
		);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession({
			email: "test@example.com",
			password: "pass",
			// tokenCachePath not set - caching disabled
		});

		expect(session.getUserId()).toBe("user1");
		expect(mockRequest).toHaveBeenCalledTimes(2);
	});

	it("tokenCachePath=true uses default path", async () => {
		mockRequest.mockResolvedValueOnce(mockRes(200, { projectId: "thermoworks-app" }) as any);
		mockRequest.mockResolvedValueOnce(
			mockRes(200, {
				idToken: "tok",
				refreshToken: "ref",
				localId: "user1",
				expiresIn: "3600",
			}) as any,
		);

		const { createAuthSession } = await import("../src/auth.js");
		// This will attempt to write to the real default path, but we just confirm no crash
		const session = await createAuthSession({
			email: "test@example.com",
			password: "pass",
			tokenCachePath: true,
		});

		expect(session.getUserId()).toBe("user1");
	});

	it("backward compatible - positional args still work", async () => {
		mockRequest.mockResolvedValueOnce(mockRes(200, { projectId: "thermoworks-app" }) as any);
		mockRequest.mockResolvedValueOnce(
			mockRes(200, {
				idToken: "tok",
				refreshToken: "ref",
				localId: "user1",
				expiresIn: "3600",
			}) as any,
		);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "pass");

		expect(session.getUserId()).toBe("user1");
		expect(mockRequest).toHaveBeenCalledTimes(2);
	});

	it("cache invalidation removes cache file", async () => {
		const cachePath = join(testDir, "to-invalidate.json");
		await writeFile(
			cachePath,
			JSON.stringify({
				idToken: "tok",
				refreshToken: "ref",
				userId: "uid",
				expiresAt: new Date().toISOString(),
				projectId: "proj",
			}),
			"utf8",
		);

		const { invalidateTokenCache } = await import("../src/token-cache.js");
		await invalidateTokenCache(cachePath);

		await expect(readFile(cachePath, "utf8")).rejects.toThrow();
	});

	it("in-session refresh also updates cache", async () => {
		const cachePath = join(testDir, "in-session-refresh.json");
		// Token valid now but will expire before the request (simulated via short expiresIn at login)
		// We'll do a full login (no cache) with a short-lived token, then make a request that triggers refresh
		mockRequest.mockResolvedValueOnce(mockRes(200, { projectId: "thermoworks-app" }) as any);
		mockRequest.mockResolvedValueOnce(
			mockRes(200, {
				idToken: "short-lived-token",
				refreshToken: "valid-refresh",
				localId: "user789",
				expiresIn: "0", // Expires immediately
			}) as any,
		);
		// When ensureValidToken triggers refresh during request:
		mockRequest.mockResolvedValueOnce(
			mockRes(200, {
				id_token: "refreshed-in-session",
				refresh_token: "new-ref-session",
				user_id: "user789",
				expires_in: "3600",
			}) as any,
		);
		// The actual Firestore request after refresh:
		mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession({
			email: "test@example.com",
			password: "pass",
			tokenCachePath: cachePath,
		});

		// Make a request - this triggers in-session refresh since token expired immediately
		await session.request("GET", "documents/users/user789");

		expect(mockRequest).toHaveBeenCalledTimes(4);

		// Verify cache was written with the refreshed token
		const raw = await readFile(cachePath, "utf8");
		const cached = JSON.parse(raw);
		expect(cached.idToken).toBe("refreshed-in-session");
		expect(cached.refreshToken).toBe("new-ref-session");
	});
});
