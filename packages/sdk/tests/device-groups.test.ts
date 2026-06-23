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

describe("ThermoworksCloud - Device Groups", () => {
	describe("getDeviceGroups", () => {
		it("returns groups from deviceGroupOrDeviceOrder", async () => {
			setupAuth();
			// User document with deviceGroupOrDeviceOrder
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						accountId: { stringValue: "acct-123" },
						deviceGroupOrDeviceOrder: {
							mapValue: {
								fields: {
									"acct-123": {
										mapValue: {
											fields: {
												"0": {
													mapValue: {
														fields: {
															id: { stringValue: "group-1" },
															type: { stringValue: "deviceGroup" },
														},
													},
												},
												"1": {
													mapValue: {
														fields: {
															id: { stringValue: "M100009168" },
															type: { stringValue: "device" },
														},
													},
												},
												"2": {
													mapValue: {
														fields: {
															id: { stringValue: "group-2" },
															type: { stringValue: "deviceGroup" },
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				}) as any,
			);

			// Group 1 document
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						name: { stringValue: "Kitchen" },
						devices: {
							arrayValue: {
								values: [{ stringValue: "ABC123" }, { stringValue: "DEF456" }],
							},
						},
					},
				}) as any,
			);

			// Group 2 document
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						name: { stringValue: "Outdoor" },
						devices: {
							arrayValue: {
								values: [{ stringValue: "GHI789" }],
							},
						},
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const groups = await client.getDeviceGroups();

			expect(groups).toHaveLength(2);
			expect(groups[0]).toEqual({ id: "group-1", name: "Kitchen", devices: ["ABC123", "DEF456"] });
			expect(groups[1]).toEqual({ id: "group-2", name: "Outdoor", devices: ["GHI789"] });
			client.close();
		});

		it("returns empty array when user has no accountId", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						email: { stringValue: "test@example.com" },
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const groups = await client.getDeviceGroups();

			expect(groups).toEqual([]);
			client.close();
		});

		it("returns empty array when deviceGroupOrDeviceOrder is missing", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						accountId: { stringValue: "acct-123" },
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const groups = await client.getDeviceGroups();

			expect(groups).toEqual([]);
			client.close();
		});

		it("returns empty array when order map has no groups", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						accountId: { stringValue: "acct-123" },
						deviceGroupOrDeviceOrder: {
							mapValue: {
								fields: {
									"acct-123": {
										mapValue: {
											fields: {
												"0": {
													mapValue: {
														fields: {
															id: { stringValue: "M100009168" },
															type: { stringValue: "device" },
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const groups = await client.getDeviceGroups();

			expect(groups).toEqual([]);
			client.close();
		});

		it("handles 404 for missing group documents gracefully", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						accountId: { stringValue: "acct-123" },
						deviceGroupOrDeviceOrder: {
							mapValue: {
								fields: {
									"acct-123": {
										mapValue: {
											fields: {
												"0": {
													mapValue: {
														fields: {
															id: { stringValue: "missing-group" },
															type: { stringValue: "deviceGroup" },
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				}) as any,
			);

			// Group document returns 404
			mockRequest.mockResolvedValueOnce(mockRes(404, {}) as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const groups = await client.getDeviceGroups();

			expect(groups).toHaveLength(1);
			expect(groups[0]).toEqual({ id: "missing-group", name: "", devices: [] });
			client.close();
		});

		it("handles account order map not matching accountId", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						accountId: { stringValue: "acct-123" },
						deviceGroupOrDeviceOrder: {
							mapValue: {
								fields: {
									"different-account": {
										mapValue: {
											fields: {
												"0": {
													mapValue: {
														fields: {
															id: { stringValue: "group-1" },
															type: { stringValue: "deviceGroup" },
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const groups = await client.getDeviceGroups();

			expect(groups).toEqual([]);
			client.close();
		});
	});

	describe("createDeviceGroup", () => {
		it("creates group and returns it", async () => {
			setupAuth();
			// User document with accountId
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: {
						accountId: { stringValue: "acct-123" },
					},
				}) as any,
			);
			// POST response for new group document
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					name: "projects/thermoworks-app/databases/(default)/documents/accounts/acct-123/deviceGroups/new-group-id",
					fields: {
						name: { stringValue: "Kitchen" },
						devices: {
							arrayValue: {
								values: [{ stringValue: "ABC123" }],
							},
						},
					},
				}) as any,
			);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			const group = await client.createDeviceGroup("Kitchen", ["ABC123"]);

			expect(group).toEqual({ id: "new-group-id", name: "Kitchen", devices: ["ABC123"] });
			client.close();
		});

		it("throws on API failure", async () => {
			setupAuth();
			mockRequest.mockResolvedValueOnce(
				mockRes(200, {
					fields: { accountId: { stringValue: "acct-123" } },
				}) as any,
			);
			mockRequest.mockResolvedValueOnce(mockRes(400, "Bad request") as any);

			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });
			await expect(client.createDeviceGroup("Kitchen", ["ABC123"])).rejects.toThrow("HTTP 400");
			client.close();
		});
	});

	describe("deleteDeviceGroup", () => {
		it("throws not supported error", async () => {
			const client = new ThermoworksCloud({ email: "test@example.com", password: "pass" });

			await expect(client.deleteDeviceGroup("group-1")).rejects.toThrow(
				"deleteDeviceGroup is not yet supported",
			);
			client.close();
		});
	});
});
