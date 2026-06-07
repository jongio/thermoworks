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

/** Setup auth + user doc (with accountId) for methods that call resolveAccountId. */
function setupAuthWithAccount(accountId = "acct-123") {
	setupAuth();
	mockRequest.mockResolvedValueOnce(
		mockRes(200, {
			fields: { accountId: { stringValue: accountId } },
		}) as any,
	);
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("ThermoworksCloud - Account & Billing", () => {
	describe("getDataUsage", () => {
		it("returns total data usage from callable function", async () => {
			setupAuthWithAccount();
			// callFunction response
			mockRequest.mockResolvedValueOnce(mockRes(200, { result: { totalBytes: 1048576 } }) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const usage = await client.getDataUsage();
			expect(usage.totalBytes).toBe(1048576);
			expect(usage.formattedSize).toBe("1.00 MB");
			client.close();
		});

		it("handles zero bytes", async () => {
			setupAuthWithAccount();
			mockRequest.mockResolvedValueOnce(mockRes(200, { result: { totalBytes: 0 } }) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const usage = await client.getDataUsage();
			expect(usage.totalBytes).toBe(0);
			expect(usage.formattedSize).toBe("0 B");
			client.close();
		});

		it("handles missing totalBytes in response", async () => {
			setupAuthWithAccount();
			mockRequest.mockResolvedValueOnce(mockRes(200, { result: {} }) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const usage = await client.getDataUsage();
			expect(usage.totalBytes).toBe(0);
			expect(usage.formattedSize).toBe("0 B");
			client.close();
		});

		it("formats large sizes correctly", async () => {
			setupAuthWithAccount();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { result: { totalBytes: 5368709120 } }) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const usage = await client.getDataUsage();
			expect(usage.totalBytes).toBe(5368709120);
			expect(usage.formattedSize).toBe("5.00 GB");
			client.close();
		});
	});

	describe("getDataUsageByDevice", () => {
		it("returns per-device data usage", async () => {
			setupAuthWithAccount();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					result: [
						{ deviceId: "DEV-001", bytes: 524288 },
						{ deviceId: "DEV-002", bytes: 2097152 },
					],
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const devices = await client.getDataUsageByDevice();
			expect(devices).toHaveLength(2);
			expect(devices[0]).toEqual({
				deviceId: "DEV-001",
				bytes: 524288,
				formattedSize: "512.00 KB",
			});
			expect(devices[1]).toEqual({
				deviceId: "DEV-002",
				bytes: 2097152,
				formattedSize: "2.00 MB",
			});
			client.close();
		});

		it("returns empty array for non-array response", async () => {
			setupAuthWithAccount();
			mockRequest.mockResolvedValueOnce(mockRes(200, { result: null }) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const devices = await client.getDataUsageByDevice();
			expect(devices).toEqual([]);
			client.close();
		});

		it("handles entries with missing fields", async () => {
			setupAuthWithAccount();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, { result: [{ deviceId: "DEV-001" }, { bytes: 1024 }] }) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const devices = await client.getDataUsageByDevice();
			expect(devices[0]).toEqual({
				deviceId: "DEV-001",
				bytes: 0,
				formattedSize: "0 B",
			});
			expect(devices[1]).toEqual({
				deviceId: "",
				bytes: 1024,
				formattedSize: "1.00 KB",
			});
			client.close();
		});
	});

	describe("getBillingPlan", () => {
		it("returns billing plan from Firestore", async () => {
			setupAuthWithAccount();
			// Account doc with billingPlanId
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						billingPlanId: { stringValue: "plan-pro" },
						name: { stringValue: "My Account" },
					},
				}) as any,
			);
			// Plan document
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						name: { stringValue: "Pro Plan" },
						description: { stringValue: "Professional plan with 10 devices" },
						monthlyAmount: { integerValue: "999" },
						deviceCount: { integerValue: "10" },
						isDefault: { booleanValue: false },
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const plan = await client.getBillingPlan();
			expect(plan).toEqual({
				id: "plan-pro",
				name: "Pro Plan",
				description: "Professional plan with 10 devices",
				monthlyAmount: 999,
				deviceCount: 10,
				isDefault: false,
			});
			client.close();
		});

		it("returns null when account has no billingPlanId", async () => {
			setupAuthWithAccount();
			// Account doc without billingPlanId
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						name: { stringValue: "My Account" },
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const plan = await client.getBillingPlan();
			expect(plan).toBeNull();
			client.close();
		});

		it("returns null when account document is not found", async () => {
			setupAuthWithAccount();
			// 404 for account doc
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const plan = await client.getBillingPlan();
			expect(plan).toBeNull();
			client.close();
		});

		it("returns null when plan document is not found", async () => {
			setupAuthWithAccount();
			// Account doc with billingPlanId
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						billingPlanId: { stringValue: "plan-deleted" },
					},
				}) as any,
			);
			// 404 for plan doc
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const plan = await client.getBillingPlan();
			expect(plan).toBeNull();
			client.close();
		});

		it("returns plan with default values for missing fields", async () => {
			setupAuthWithAccount();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						billingPlanId: { stringValue: "plan-basic" },
					},
				}) as any,
			);
			// Plan document with minimal fields
			mockRequest.mockResolvedValueOnce(mockRes(200, { fields: {} }) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const plan = await client.getBillingPlan();
			expect(plan).toEqual({
				id: "plan-basic",
				name: "",
				description: "",
				monthlyAmount: 0,
				deviceCount: 0,
				isDefault: false,
			});
			client.close();
		});
	});
});
