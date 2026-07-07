import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

const mockGetPassword = vi.fn();
vi.mock("@github/keytar", () => ({
	default: { getPassword: mockGetPassword },
}));

const mockGetDevices = vi.fn();
const mockGetUser = vi.fn();
const mockClose = vi.fn();

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();

	class MockThermoworksCloud {
		getDevices = mockGetDevices;
		getUser = mockGetUser;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

vi.mock("../src/output.js", () => ({
	outputJson: vi.fn(),
}));

import { doctor } from "../src/commands/doctor.js";
import { getCredentials } from "../src/credentials.js";
import { outputJson } from "../src/output.js";

const mockGetCredentials = vi.mocked(getCredentials);
const mockOutputJson = vi.mocked(outputJson);

let logSpy: ReturnType<typeof vi.spyOn>;
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
	vi.clearAllMocks();
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});

	originalEnv = { ...process.env };
	delete process.env.THERMOWORKS_EMAIL;
	delete process.env.THERMOWORKS_PASSWORD;

	mockGetCredentials.mockResolvedValue(null);
	mockGetPassword.mockResolvedValue(null);
	mockGetUser.mockResolvedValue({ userId: "u1", email: "test@example.com", accountId: "a1" });
	mockGetDevices.mockResolvedValue([]);
	mockClose.mockImplementation(() => {});
});

afterEach(() => {
	process.env = originalEnv;
	vi.restoreAllMocks();
});

// Mock global fetch
const originalFetch = globalThis.fetch;

function mockFetch(impl: typeof globalThis.fetch): void {
	globalThis.fetch = impl;
}

function restoreFetch(): void {
	globalThis.fetch = originalFetch;
}

describe("doctor", () => {
	afterEach(() => {
		restoreFetch();
	});

	it("runs all checks and prints results in text mode", async () => {
		mockGetPassword.mockResolvedValue('{"email":"test@example.com","password":"pw"}');
		mockGetCredentials.mockResolvedValue({ email: "test@example.com", password: "pw" });
		mockGetDevices.mockResolvedValue([{ serial: "ABC123" }, { serial: "DEF456" }]);
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("ThermoWorks Doctor");
		expect(output).toContain("Keychain access");
		expect(output).toContain("Env vars");
		expect(output).toContain("Credential validity");
		expect(output).toContain("Network connectivity");
		expect(output).toContain("Auth test");
		expect(output).toContain("API reachability");
		expect(output).toContain("Device fetch");
		expect(output).toContain("Token cache");
		expect(output).toContain("Config file");
	});

	it("outputs JSON when --json flag is set", async () => {
		mockGetPassword.mockResolvedValue(null);
		mockGetCredentials.mockResolvedValue(null);
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: true });

		expect(mockOutputJson).toHaveBeenCalledOnce();
		const results = mockOutputJson.mock.calls[0][0] as Array<{
			name: string;
			status: string;
			message: string;
		}>;
		expect(results).toHaveLength(9);
		for (const r of results) {
			expect(r).toHaveProperty("name");
			expect(r).toHaveProperty("status");
			expect(r).toHaveProperty("message");
			expect(["pass", "fail", "warn"]).toContain(r.status);
		}
	});

	it("reports pass for keychain when credentials exist", async () => {
		mockGetPassword.mockResolvedValue('{"email":"test@example.com","password":"secret"}');
		mockGetCredentials.mockResolvedValue({ email: "test@example.com", password: "secret" });
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: true });

		const results = mockOutputJson.mock.calls[0][0] as Array<{
			name: string;
			status: string;
		}>;
		const keychainResult = results.find((r) => r.name === "Keychain access");
		expect(keychainResult?.status).toBe("pass");
	});

	it("reports warn for keychain when empty", async () => {
		mockGetPassword.mockResolvedValue(null);
		mockGetCredentials.mockResolvedValue(null);
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: true });

		const results = mockOutputJson.mock.calls[0][0] as Array<{
			name: string;
			status: string;
		}>;
		const keychainResult = results.find((r) => r.name === "Keychain access");
		expect(keychainResult?.status).toBe("warn");
	});

	it("reports pass for env vars when both are set", async () => {
		process.env.THERMOWORKS_EMAIL = "env@test.com";
		process.env.THERMOWORKS_PASSWORD = "envpass";
		mockGetCredentials.mockResolvedValue({ email: "env@test.com", password: "envpass" });
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: true });

		const results = mockOutputJson.mock.calls[0][0] as Array<{
			name: string;
			status: string;
			message: string;
		}>;
		const envResult = results.find((r) => r.name === "Env vars");
		expect(envResult?.status).toBe("pass");
		expect(envResult?.message).toContain("yes");
	});

	it("reports warn for env vars when only one is set", async () => {
		process.env.THERMOWORKS_EMAIL = "env@test.com";
		mockGetCredentials.mockResolvedValue(null);
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: true });

		const results = mockOutputJson.mock.calls[0][0] as Array<{
			name: string;
			status: string;
		}>;
		const envResult = results.find((r) => r.name === "Env vars");
		expect(envResult?.status).toBe("warn");
	});

	it("reports fail for credential validity when no creds available", async () => {
		mockGetCredentials.mockResolvedValue(null);
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: true });

		const results = mockOutputJson.mock.calls[0][0] as Array<{
			name: string;
			status: string;
		}>;
		const credResult = results.find((r) => r.name === "Credential validity");
		expect(credResult?.status).toBe("fail");
	});

	it("reports pass for credential validity with valid email", async () => {
		mockGetCredentials.mockResolvedValue({ email: "user@example.com", password: "pw" });
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: true });

		const results = mockOutputJson.mock.calls[0][0] as Array<{
			name: string;
			status: string;
		}>;
		const credResult = results.find((r) => r.name === "Credential validity");
		expect(credResult?.status).toBe("pass");
	});

	it("reports warn for credential validity with invalid email format", async () => {
		mockGetCredentials.mockResolvedValue({ email: "not-an-email", password: "pw" });
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: true });

		const results = mockOutputJson.mock.calls[0][0] as Array<{
			name: string;
			status: string;
		}>;
		const credResult = results.find((r) => r.name === "Credential validity");
		expect(credResult?.status).toBe("warn");
	});

	it("reports fail for network connectivity on fetch error", async () => {
		mockGetCredentials.mockResolvedValue(null);
		mockFetch(async () => {
			throw new Error("getaddrinfo ENOTFOUND");
		});

		await doctor({ json: true });

		const results = mockOutputJson.mock.calls[0][0] as Array<{
			name: string;
			status: string;
			message: string;
		}>;
		const netResult = results.find((r) => r.name === "Network connectivity");
		expect(netResult?.status).toBe("fail");
		expect(netResult?.message).toContain("ENOTFOUND");
	});

	it("reports pass for network connectivity on any HTTP response", async () => {
		mockGetCredentials.mockResolvedValue(null);
		mockFetch(async () => new Response(null, { status: 404 }));

		await doctor({ json: true });

		const results = mockOutputJson.mock.calls[0][0] as Array<{
			name: string;
			status: string;
		}>;
		const netResult = results.find((r) => r.name === "Network connectivity");
		expect(netResult?.status).toBe("pass");
	});

	it("reports fail for auth test when auth fails", async () => {
		mockGetCredentials.mockResolvedValue({ email: "user@example.com", password: "wrong" });
		mockGetUser.mockRejectedValue(new Error("Invalid email or password"));
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: true });

		const results = mockOutputJson.mock.calls[0][0] as Array<{
			name: string;
			status: string;
			message: string;
		}>;
		const authResult = results.find((r) => r.name === "Auth test");
		expect(authResult?.status).toBe("fail");
		expect(authResult?.message).toContain("Invalid email or password");
	});

	it("reports pass for auth test on successful auth", async () => {
		mockGetCredentials.mockResolvedValue({ email: "user@example.com", password: "good" });
		mockGetUser.mockResolvedValue({ userId: "u1", email: "user@example.com", accountId: "a1" });
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: true });

		const results = mockOutputJson.mock.calls[0][0] as Array<{
			name: string;
			status: string;
		}>;
		const authResult = results.find((r) => r.name === "Auth test");
		expect(authResult?.status).toBe("pass");
	});

	it("reports device count on successful fetch", async () => {
		mockGetCredentials.mockResolvedValue({ email: "user@example.com", password: "pw" });
		mockGetDevices.mockResolvedValue([{ serial: "A" }, { serial: "B" }, { serial: "C" }]);
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: true });

		const results = mockOutputJson.mock.calls[0][0] as Array<{
			name: string;
			status: string;
			message: string;
		}>;
		const deviceResult = results.find((r) => r.name === "Device fetch");
		expect(deviceResult?.status).toBe("pass");
		expect(deviceResult?.message).toContain("3 devices");
	});

	it("does not print values of env vars or credentials", async () => {
		process.env.THERMOWORKS_EMAIL = "secret@email.com";
		process.env.THERMOWORKS_PASSWORD = "supersecret";
		mockGetCredentials.mockResolvedValue({ email: "secret@email.com", password: "supersecret" });
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).not.toContain("secret@email.com");
		expect(output).not.toContain("supersecret");
	});

	it("shows summary counts in text mode", async () => {
		mockGetCredentials.mockResolvedValue(null);
		mockFetch(async () => new Response(null, { status: 200 }));

		await doctor({ json: false });

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		// Should have a summary line with counts
		expect(output).toMatch(/passed|failed|warning/);
	});
});
