import { afterEach, describe, expect, it, vi } from "vitest";
import { ThermoworksCloud } from "../src/client.js";

vi.mock("../src/auth.js", () => ({
	createAuthSession: vi.fn(),
}));

import { createAuthSession } from "../src/auth.js";

const mockRequest = vi.fn();
const mockCallFunction = vi.fn();
const mockCreateAuth = vi.mocked(createAuthSession);

function setupSession(accountId = "acct-123") {
	// First request call resolves the user doc (for resolveAccountId)
	mockRequest.mockResolvedValueOnce({
		status: 200,
		ok: true,
		json: async () => ({
			fields: { accountId: { stringValue: accountId } },
		}),
		text: async () => "",
	});

	mockCreateAuth.mockResolvedValue({
		request: mockRequest,
		callFunction: mockCallFunction,
		getUserId: () => "user1",
		close: vi.fn(),
	});
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("ThermoworksCloud - Multi-User Management", () => {
	describe("getInvites", () => {
		it("queries usersInvites by accountId and returns results", async () => {
			setupSession();
			// Query response with invite documents
			mockRequest.mockResolvedValueOnce({
				status: 200,
				ok: true,
				json: async () => [
					{
						document: {
							name: "projects/thermoworks-app/databases/(default)/documents/usersInvites/inv-1",
							fields: {
								accountId: { stringValue: "acct-123" },
								email: { stringValue: "user@example.com" },
								status: { stringValue: "pending" },
								createdAt: { stringValue: "2026-01-15T10:00:00Z" },
							},
						},
					},
					{
						document: {
							name: "projects/thermoworks-app/databases/(default)/documents/usersInvites/inv-2",
							fields: {
								accountId: { stringValue: "acct-123" },
								email: { stringValue: "other@example.com" },
								status: { stringValue: "accepted" },
							},
						},
					},
				],
				text: async () => "",
			});

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const invites = await client.getInvites();

			expect(invites).toHaveLength(2);
			expect(invites[0]).toEqual({
				id: "inv-1",
				accountId: "acct-123",
				email: "user@example.com",
				status: "pending",
				createdAt: "2026-01-15T10:00:00Z",
			});
			expect(invites[1]).toEqual({
				id: "inv-2",
				accountId: "acct-123",
				email: "other@example.com",
				status: "accepted",
				createdAt: undefined,
			});

			// Verify the structured query was sent correctly
			const queryCall = mockRequest.mock.calls[1];
			expect(queryCall[0]).toBe("POST");
			expect(queryCall[1]).toBe("documents:runQuery");
			expect(queryCall[2]).toEqual({
				structuredQuery: {
					from: [{ collectionId: "usersInvites" }],
					where: {
						fieldFilter: {
							field: { fieldPath: "accountId" },
							op: "EQUAL",
							value: { stringValue: "acct-123" },
						},
					},
					orderBy: [{ field: { fieldPath: "__name__" }, direction: "ASCENDING" }],
				},
			});
			client.close();
		});

		it("returns empty array when no invites exist", async () => {
			setupSession();
			// Query returns empty results (Firestore returns array with no document)
			mockRequest.mockResolvedValueOnce({
				status: 200,
				ok: true,
				json: async () => [{ readTime: "2026-01-15T10:00:00Z" }],
				text: async () => "",
			});

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const invites = await client.getInvites();

			expect(invites).toEqual([]);
			client.close();
		});

		it("returns empty array for non-array response", async () => {
			setupSession();
			mockRequest.mockResolvedValueOnce({
				status: 200,
				ok: true,
				json: async () => ({}),
				text: async () => "",
			});

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const invites = await client.getInvites();

			expect(invites).toEqual([]);
			client.close();
		});

		it("throws NetworkError on query error response", async () => {
			setupSession();
			mockRequest.mockResolvedValueOnce({
				status: 200,
				ok: true,
				json: async () => ({ error: { message: "Permission denied" } }),
				text: async () => "",
			});

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.getInvites()).rejects.toThrow("Permission denied");
			client.close();
		});

		it("handles invites with minimal fields", async () => {
			setupSession();
			mockRequest.mockResolvedValueOnce({
				status: 200,
				ok: true,
				json: async () => [
					{
						document: {
							name: "projects/thermoworks-app/databases/(default)/documents/usersInvites/inv-3",
							fields: {
								accountId: { stringValue: "acct-123" },
							},
						},
					},
				],
				text: async () => "",
			});

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const invites = await client.getInvites();

			expect(invites).toHaveLength(1);
			expect(invites[0]).toEqual({
				id: "inv-3",
				accountId: "acct-123",
				email: undefined,
				status: undefined,
				createdAt: undefined,
			});
			client.close();
		});
	});

	describe("removeUser", () => {
		it("calls userRemoteFromAccount with userId and accountId", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.removeUser("target-user-id");

			expect(mockCallFunction).toHaveBeenCalledWith("userRemoteFromAccount", {
				userId: "target-user-id",
				accountId: "acct-123",
			});
			expect(result.success).toBe(true);
			expect(result.error).toBeNull();
			client.close();
		});

		it("returns error result on failure", async () => {
			setupSession();
			mockCallFunction.mockResolvedValueOnce({ status: "error", message: "User not found" });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			const result = await client.removeUser("unknown-user");

			expect(result.success).toBe(false);
			expect(result.error).toBe("User not found");
			client.close();
		});

		it("throws when userId is empty", async () => {
			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await expect(client.removeUser("")).rejects.toThrow("userId is required");
			client.close();
		});

		it("resolves accountId before calling function", async () => {
			setupSession("my-account-456");
			mockCallFunction.mockResolvedValueOnce({ success: true });

			const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
			await client.removeUser("user-to-remove");

			expect(mockCallFunction).toHaveBeenCalledWith("userRemoteFromAccount", {
				userId: "user-to-remove",
				accountId: "my-account-456",
			});
			client.close();
		});
	});
});
