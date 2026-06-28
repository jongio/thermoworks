import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-mcp", () => ({
	startServer: vi.fn(),
}));

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

import { startServer } from "thermoworks-mcp";
import { getCredentials } from "../src/credentials.js";

const mockStartServer = vi.mocked(startServer);
const mockGetCredentials = vi.mocked(getCredentials);

// --- Test suite ---

describe("mcpStart", () => {
	const originalEmail = process.env.THERMOWORKS_EMAIL;
	const originalPassword = process.env.THERMOWORKS_PASSWORD;

	beforeEach(() => {
		delete process.env.THERMOWORKS_EMAIL;
		delete process.env.THERMOWORKS_PASSWORD;
	});

	afterEach(() => {
		vi.clearAllMocks();
		if (originalEmail === undefined) delete process.env.THERMOWORKS_EMAIL;
		else process.env.THERMOWORKS_EMAIL = originalEmail;
		if (originalPassword === undefined) delete process.env.THERMOWORKS_PASSWORD;
		else process.env.THERMOWORKS_PASSWORD = originalPassword;
	});

	it("bridges keychain credentials into the environment when env vars are unset", async () => {
		mockGetCredentials.mockResolvedValue({ email: "kc@example.com", password: "kc-pass" });

		const { mcpStart } = await import("../src/commands/mcp.js");
		await mcpStart();

		expect(mockGetCredentials).toHaveBeenCalledOnce();
		expect(process.env.THERMOWORKS_EMAIL).toBe("kc@example.com");
		expect(process.env.THERMOWORKS_PASSWORD).toBe("kc-pass");
		expect(mockStartServer).toHaveBeenCalledOnce();
	});

	it("does not override explicit environment credentials", async () => {
		process.env.THERMOWORKS_EMAIL = "env@example.com";
		process.env.THERMOWORKS_PASSWORD = "env-pass";

		const { mcpStart } = await import("../src/commands/mcp.js");
		await mcpStart();

		expect(mockGetCredentials).not.toHaveBeenCalled();
		expect(process.env.THERMOWORKS_EMAIL).toBe("env@example.com");
		expect(process.env.THERMOWORKS_PASSWORD).toBe("env-pass");
		expect(mockStartServer).toHaveBeenCalledOnce();
	});

	it("starts the server even when no credentials are available", async () => {
		mockGetCredentials.mockResolvedValue(null);

		const { mcpStart } = await import("../src/commands/mcp.js");
		await mcpStart();

		expect(mockGetCredentials).toHaveBeenCalledOnce();
		expect(process.env.THERMOWORKS_EMAIL).toBeUndefined();
		expect(process.env.THERMOWORKS_PASSWORD).toBeUndefined();
		expect(mockStartServer).toHaveBeenCalledOnce();
	});
});
