import { afterEach, describe, expect, it, vi } from "vitest";
import { ThermoworksCloud } from "../src/client.js";

vi.mock("../src/auth.js", () => ({
	createAuthSession: vi.fn(),
}));

import { createAuthSession } from "../src/auth.js";

const mockCallFunction = vi.fn();
const mockCreateAuth = vi.mocked(createAuthSession);

function setupSession() {
	mockCreateAuth.mockResolvedValue({
		request: vi.fn(),
		callFunction: mockCallFunction,
		getUserId: () => "user1",
		close: vi.fn(),
	});
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("ThermoworksCloud getHistory", () => {
	it("calls requestRetrieveInstrumentHistory with deviceId", async () => {
		setupSession();
		mockCallFunction.mockResolvedValueOnce({ readings: [] });

		const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
		await client.getHistory("ABC-123");

		expect(mockCallFunction).toHaveBeenCalledWith("requestRetrieveInstrumentHistory", {
			deviceId: "ABC-123",
		});
		client.close();
	});

	it("parses readings from callable response", async () => {
		setupSession();
		mockCallFunction.mockResolvedValueOnce({
			readings: [
				{ v: "67.000", ts: "2026-06-04T14:09:50.468Z", u: "F" },
				{ v: "21.500", ts: "2026-06-04T14:10:50.468Z", u: "C" },
			],
		});

		const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
		const history = await client.getHistory("DEV-001");

		expect(history.deviceId).toBe("DEV-001");
		expect(history.readings).toHaveLength(2);
		expect(history.readings[0]).toEqual({
			value: 67,
			timestamp: "2026-06-04T14:09:50.468Z",
			units: "F",
		});
		expect(history.readings[1]).toEqual({
			value: 21.5,
			timestamp: "2026-06-04T14:10:50.468Z",
			units: "C",
		});
		client.close();
	});

	it("returns empty readings when response has no readings array", async () => {
		setupSession();
		mockCallFunction.mockResolvedValueOnce({});

		const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
		const history = await client.getHistory("DEV-001");

		expect(history.deviceId).toBe("DEV-001");
		expect(history.readings).toEqual([]);
		client.close();
	});

	it("returns empty readings when response is null", async () => {
		setupSession();
		mockCallFunction.mockResolvedValueOnce(null);

		const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
		const history = await client.getHistory("DEV-001");

		expect(history.deviceId).toBe("DEV-001");
		expect(history.readings).toEqual([]);
		client.close();
	});

	it("skips entries with invalid or missing values", async () => {
		setupSession();
		mockCallFunction.mockResolvedValueOnce({
			readings: [
				{ v: "67.000", ts: "2026-06-04T14:09:50.468Z", u: "F" },
				{ v: "not-a-number", ts: "2026-06-04T14:10:50.468Z", u: "F" },
				{ v: "72.000", ts: null, u: "F" },
				{ v: "73.000", ts: "2026-06-04T14:11:50.468Z", u: null },
				{ v: null, ts: "2026-06-04T14:12:50.468Z", u: "F" },
				null,
				42,
			],
		});

		const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
		const history = await client.getHistory("DEV-001");

		expect(history.readings).toHaveLength(1);
		expect(history.readings[0]).toEqual({
			value: 67,
			timestamp: "2026-06-04T14:09:50.468Z",
			units: "F",
		});
		client.close();
	});

	it("rejects invalid serial", async () => {
		const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
		await expect(client.getHistory("")).rejects.toThrow("Invalid device serial");
		await expect(client.getHistory("bad serial!")).rejects.toThrow("Invalid device serial");
		client.close();
	});

	it("preserves decimal precision in value parsing", async () => {
		setupSession();
		mockCallFunction.mockResolvedValueOnce({
			readings: [{ v: "99.875", ts: "2026-06-04T14:09:50.468Z", u: "F" }],
		});

		const client = new ThermoworksCloud({ email: "a@b.com", password: "p" });
		const history = await client.getHistory("DEV-001");

		expect(history.readings[0].value).toBe(99.875);
		client.close();
	});
});
