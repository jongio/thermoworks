import { afterEach, describe, expect, it, vi } from "vitest";
import { ThermoworksCloud } from "../src/client.js";

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

function setupAuth() {
	mockRequest.mockResolvedValueOnce(mockRes(200, { projectId: "thermoworks-app" }) as any);
	mockRequest.mockResolvedValueOnce(
		mockRes(200, {
			idToken: "token",
			refreshToken: "refresh",
			localId: "user1",
			expiresIn: "3600",
		}) as any,
	);
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("ThermoworksCloud", () => {
	describe("shareDevice", () => {
		it("calls publicShareDeviceState and returns a share result", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					result: { success: true, publicLink: "https://share.thermoworks.com/d/ABC123" },
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const result = await client.shareDevice("ABC123");
			expect(result.success).toBe(true);
			expect(result.publicLink).toBe("https://share.thermoworks.com/d/ABC123");
			client.close();
		});

		it("returns success without publicLink when server omits it", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, { result: { success: true } }) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const result = await client.shareDevice("ABC123");
			expect(result.success).toBe(true);
			expect(result.publicLink).toBeUndefined();
			client.close();
		});

		it("returns failure on error envelope", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { result: { status: "error", message: "Device not found" } }) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const result = await client.shareDevice("ABC123");
			expect(result.success).toBe(false);
			expect(result.publicLink).toBeUndefined();
			client.close();
		});

		it("throws on invalid serial", async () => {
			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await expect(client.shareDevice("")).rejects.toThrow("Invalid device serial");
			await expect(client.shareDevice("bad serial!")).rejects.toThrow("Invalid device serial");
			client.close();
		});

		it("passes deviceId in the function call payload", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, { result: { success: true } }) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await client.shareDevice("SERIAL-99");

			const callFunctionReq = mockRequest.mock.calls[2];
			expect(callFunctionReq?.[0]).toContain("publicShareDeviceState");
			const body = JSON.parse(callFunctionReq?.[1]?.body as string);
			expect(body.data).toEqual({ deviceId: "SERIAL-99" });
			client.close();
		});
	});

	describe("shareArchive", () => {
		it("calls publicShareArchive and returns a share result", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					result: {
						success: true,
						publicLink: "https://share.thermoworks.com/a/archive-001",
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const result = await client.shareArchive("ABC123", "archive-001");
			expect(result.success).toBe(true);
			expect(result.publicLink).toBe("https://share.thermoworks.com/a/archive-001");
			client.close();
		});

		it("returns failure on error envelope", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { result: { error: "Archive not found" } }) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const result = await client.shareArchive("ABC123", "archive-001");
			expect(result.success).toBe(false);
			client.close();
		});

		it("throws on invalid serial", async () => {
			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await expect(client.shareArchive("", "archive-001")).rejects.toThrow("Invalid device serial");
			client.close();
		});

		it("throws on empty archiveId", async () => {
			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await expect(client.shareArchive("ABC123", "")).rejects.toThrow("archiveId is required");
			client.close();
		});

		it("passes archiveId and deviceId in the function call payload", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(mockRes(200, { result: { success: true } }) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await client.shareArchive("DEV-1", "arch-42");

			const callFunctionReq = mockRequest.mock.calls[2];
			expect(callFunctionReq?.[0]).toContain("publicShareArchive");
			const body = JSON.parse(callFunctionReq?.[1]?.body as string);
			expect(body.data).toEqual({ archiveId: "arch-42", deviceId: "DEV-1" });
			client.close();
		});
	});
});
