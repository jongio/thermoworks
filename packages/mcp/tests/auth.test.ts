import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveEnvCredentials = vi.fn();
const mockParseCredentialBlob = vi.fn();
const mockGetPassword = vi.fn();

vi.mock("thermoworks-sdk", () => ({
	CREDENTIAL_ACCOUNT: "credentials",
	CREDENTIAL_SERVICE: "thermoworks",
	resolveEnvCredentials: (...args: unknown[]) => mockResolveEnvCredentials(...args),
	parseCredentialBlob: (...args: unknown[]) => mockParseCredentialBlob(...args),
}));

vi.mock("@github/keytar", () => ({
	default: {
		getPassword: (...args: unknown[]) => mockGetPassword(...args),
	},
}));

const { resolveCredentials } = await import("../src/auth.js");

beforeEach(() => {
	vi.clearAllMocks();
});

describe("resolveCredentials", () => {
	it("returns env credentials when available", async () => {
		mockResolveEnvCredentials.mockReturnValue({ email: "env@test.com", password: "envpass" });

		const result = await resolveCredentials();
		expect(result).toEqual({ email: "env@test.com", password: "envpass" });
		expect(mockGetPassword).not.toHaveBeenCalled();
	});

	it("falls back to keytar when env vars not set", async () => {
		mockResolveEnvCredentials.mockReturnValue(null);
		mockGetPassword.mockResolvedValue('{"email":"key@test.com","password":"keypass"}');
		mockParseCredentialBlob.mockReturnValue({ email: "key@test.com", password: "keypass" });

		const result = await resolveCredentials();
		expect(result).toEqual({ email: "key@test.com", password: "keypass" });
		expect(mockGetPassword).toHaveBeenCalledWith("thermoworks", "credentials");
	});

	it("returns null when keytar has no stored credentials", async () => {
		mockResolveEnvCredentials.mockReturnValue(null);
		mockGetPassword.mockResolvedValue(null);

		const result = await resolveCredentials();
		expect(result).toBeNull();
	});

	it("returns null when keytar blob is unparseable", async () => {
		mockResolveEnvCredentials.mockReturnValue(null);
		mockGetPassword.mockResolvedValue("corrupted-blob");
		mockParseCredentialBlob.mockReturnValue(null);

		const result = await resolveCredentials();
		expect(result).toBeNull();
	});

	it("returns null when keytar throws (not available)", async () => {
		mockResolveEnvCredentials.mockReturnValue(null);
		mockGetPassword.mockRejectedValue(new Error("keytar not available"));

		const result = await resolveCredentials();
		expect(result).toBeNull();
	});
});
