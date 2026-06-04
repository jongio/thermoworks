import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "../src/types.js";

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

afterEach(() => {
	vi.clearAllMocks();
});

describe("createAuthSession", () => {
	it("authenticates and returns a session", async () => {
		mockRequest.mockResolvedValueOnce(mockRes(200, { projectId: "thermoworks-app" }) as any);
		mockRequest.mockResolvedValueOnce(
			mockRes(200, {
				idToken: "test-id-token",
				refreshToken: "test-refresh-token",
				localId: "user123",
				expiresIn: "3600",
			}) as any,
		);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "password123");

		expect(session.getUserId()).toBe("user123");
		expect(mockRequest).toHaveBeenCalledTimes(2);
	});

	it("throws AuthError on invalid credentials", async () => {
		mockRequest.mockResolvedValueOnce(mockRes(200, { projectId: "thermoworks-app" }) as any);
		mockRequest.mockResolvedValueOnce(
			mockRes(400, { error: { message: "INVALID_PASSWORD" } }) as any,
		);

		const { createAuthSession } = await import("../src/auth.js");
		await expect(createAuthSession("test@example.com", "wrong")).rejects.toThrow(AuthError);
	});

	it("makes authenticated requests with bearer token", async () => {
		mockRequest.mockResolvedValueOnce(mockRes(200, { projectId: "thermoworks-app" }) as any);
		mockRequest.mockResolvedValueOnce(
			mockRes(200, {
				idToken: "tok-abc",
				refreshToken: "ref-xyz",
				localId: "user456",
				expiresIn: "3600",
			}) as any,
		);
		mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "password123");
		await session.request("GET", "documents/users/user456");

		const apiCall = mockRequest.mock.calls[2];
		expect(apiCall?.[0]).toContain("firestore.googleapis.com");
		expect((apiCall?.[1] as any)?.headers?.authorization).toBe("Bearer tok-abc");
	});

	it("refreshes expired tokens automatically", async () => {
		mockRequest.mockResolvedValueOnce(mockRes(200, { projectId: "thermoworks-app" }) as any);
		mockRequest.mockResolvedValueOnce(
			mockRes(200, {
				idToken: "expired",
				refreshToken: "ref",
				localId: "user789",
				expiresIn: "0",
			}) as any,
		);
		mockRequest.mockResolvedValueOnce(
			mockRes(200, {
				id_token: "new-token",
				refresh_token: "new-ref",
				user_id: "user789",
				expires_in: "3600",
			}) as any,
		);
		mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

		const { createAuthSession } = await import("../src/auth.js");
		const session = await createAuthSession("test@example.com", "password123");
		await session.request("GET", "documents/users/user789");

		expect(mockRequest).toHaveBeenCalledTimes(4);
		const apiCall = mockRequest.mock.calls[3];
		expect((apiCall?.[1] as any)?.headers?.authorization).toBe("Bearer new-token");
	});
});
