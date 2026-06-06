import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPassword = vi.fn<(service: string, account: string) => Promise<string | null>>();
const mockSetPassword = vi.fn<(service: string, account: string, password: string) => Promise<void>>();
const mockDeletePassword = vi.fn<(service: string, account: string) => Promise<boolean>>();

function registerKeytarMock() {
	vi.doMock("@github/keytar", () => ({
		default: {
			getPassword: mockGetPassword,
			setPassword: mockSetPassword,
			deletePassword: mockDeletePassword,
		},
	}));
}

// Fresh module import per test to reset the cached _keytar
async function importCredentials() {
	return await import("../src/credentials.js");
}

beforeEach(() => {
	vi.resetModules();
	registerKeytarMock();
});

afterEach(() => {
	vi.resetAllMocks();
	delete process.env.THERMOWORKS_EMAIL;
	delete process.env.THERMOWORKS_PASSWORD;
});

describe("getCredentials", () => {
	it("returns env vars when THERMOWORKS_EMAIL and THERMOWORKS_PASSWORD are set", async () => {
		process.env.THERMOWORKS_EMAIL = "env@example.com";
		process.env.THERMOWORKS_PASSWORD = "env-pass-123";

		const { getCredentials } = await importCredentials();
		const creds = await getCredentials();

		expect(creds).toEqual({ email: "env@example.com", password: "env-pass-123" });
		// Should not call keytar at all
		expect(mockGetPassword).not.toHaveBeenCalled();
	});

	it("ignores env vars when only THERMOWORKS_EMAIL is set", async () => {
		process.env.THERMOWORKS_EMAIL = "partial@example.com";

		mockGetPassword.mockResolvedValue(null);

		const { getCredentials } = await importCredentials();
		const creds = await getCredentials();

		expect(creds).toBeNull();
	});

	it("ignores env vars when only THERMOWORKS_PASSWORD is set", async () => {
		process.env.THERMOWORKS_PASSWORD = "lonely-password";

		mockGetPassword.mockResolvedValue(null);

		const { getCredentials } = await importCredentials();
		const creds = await getCredentials();

		expect(creds).toBeNull();
	});

	it("returns credentials from keytar JSON blob", async () => {
		mockGetPassword.mockImplementation(async (_service, account) => {
			if (account === "credentials") {
				return JSON.stringify({ email: "stored@example.com", password: "stored-pass" });
			}
			return null;
		});

		const { getCredentials } = await importCredentials();
		const creds = await getCredentials();

		expect(creds).toEqual({ email: "stored@example.com", password: "stored-pass" });
		expect(mockGetPassword).toHaveBeenCalledWith("thermoworks", "credentials");
	});

	it("falls back to legacy format and migrates to new format", async () => {
		mockGetPassword.mockImplementation(async (_service, account) => {
			if (account === "credentials") return null;
			if (account === "email") return "legacy@example.com";
			if (account === "password") return "legacy-pass";
			return null;
		});
		mockSetPassword.mockResolvedValue(undefined);
		mockDeletePassword.mockResolvedValue(true);

		const { getCredentials } = await importCredentials();
		const creds = await getCredentials();

		expect(creds).toEqual({ email: "legacy@example.com", password: "legacy-pass" });
		// Should migrate: store new blob
		expect(mockSetPassword).toHaveBeenCalledWith(
			"thermoworks",
			"credentials",
			JSON.stringify({ email: "legacy@example.com", password: "legacy-pass" }),
		);
		// Should clean up legacy entries
		expect(mockDeletePassword).toHaveBeenCalledWith("thermoworks", "email");
		expect(mockDeletePassword).toHaveBeenCalledWith("thermoworks", "password");
	});

	it("returns null when no credentials are available anywhere", async () => {
		mockGetPassword.mockResolvedValue(null);

		const { getCredentials } = await importCredentials();
		const creds = await getCredentials();

		expect(creds).toBeNull();
	});

	it("returns null when keytar is unavailable (import fails)", async () => {
		mockGetPassword.mockRejectedValue(new Error("Keychain unavailable"));

		const { getCredentials } = await importCredentials();
		const creds = await getCredentials();

		expect(creds).toBeNull();
	});

	it("returns null when JSON blob has missing email field", async () => {
		mockGetPassword.mockImplementation(async (_service, account) => {
			if (account === "credentials") {
				return JSON.stringify({ password: "only-pass" });
			}
			return null;
		});

		const { getCredentials } = await importCredentials();
		const creds = await getCredentials();

		expect(creds).toBeNull();
	});

	it("returns null when JSON blob has missing password field", async () => {
		mockGetPassword.mockImplementation(async (_service, account) => {
			if (account === "credentials") {
				return JSON.stringify({ email: "only-email@test.com" });
			}
			return null;
		});

		const { getCredentials } = await importCredentials();
		const creds = await getCredentials();

		expect(creds).toBeNull();
	});
});

describe("storeCredentials", () => {
	it("stores credentials as JSON blob in keytar", async () => {
		mockSetPassword.mockResolvedValue(undefined);

		const { storeCredentials } = await importCredentials();
		await storeCredentials("user@example.com", "s3cret");

		expect(mockSetPassword).toHaveBeenCalledWith(
			"thermoworks",
			"credentials",
			JSON.stringify({ email: "user@example.com", password: "s3cret" }),
		);
	});

	it("throws when keytar is unavailable", async () => {
		mockSetPassword.mockRejectedValue(new Error("OS keychain not available"));

		const { storeCredentials } = await importCredentials();

		await expect(storeCredentials("x@y.com", "pw")).rejects.toThrow(
			/Failed to save credentials/,
		);
	});

	it("throws when keytar.setPassword rejects", async () => {
		mockSetPassword.mockRejectedValue(new Error("Keychain locked"));

		const { storeCredentials } = await importCredentials();

		await expect(storeCredentials("x@y.com", "pw")).rejects.toThrow(
			/Failed to save credentials/,
		);
	});
});

describe("deleteCredentials", () => {
	it("deletes the credentials entry and legacy entries from keytar", async () => {
		mockDeletePassword.mockResolvedValue(true);

		const { deleteCredentials } = await importCredentials();
		const result = await deleteCredentials();

		expect(result).toBe(true);
		expect(mockDeletePassword).toHaveBeenCalledWith("thermoworks", "credentials");
		// Also cleans up legacy entries
		expect(mockDeletePassword).toHaveBeenCalledWith("thermoworks", "email");
		expect(mockDeletePassword).toHaveBeenCalledWith("thermoworks", "password");
	});

	it("returns false when no credentials entry existed", async () => {
		mockDeletePassword.mockResolvedValue(false);

		const { deleteCredentials } = await importCredentials();
		const result = await deleteCredentials();

		expect(result).toBe(false);
	});

	it("throws when keychain operation fails", async () => {
		mockDeletePassword.mockRejectedValue(new Error("Keychain locked"));

		const { deleteCredentials } = await importCredentials();

		await expect(deleteCredentials()).rejects.toThrow(
			/Failed to remove credentials/,
		);
	});
});

describe("getStoredEmail", () => {
	it("parses email from the JSON blob", async () => {
		mockGetPassword.mockImplementation(async (_service, account) => {
			if (account === "credentials") {
				return JSON.stringify({ email: "me@thermoworks.fan", password: "irrelevant" });
			}
			return null;
		});

		const { getStoredEmail } = await importCredentials();
		const email = await getStoredEmail();

		expect(email).toBe("me@thermoworks.fan");
	});

	it("returns null when no blob is stored", async () => {
		mockGetPassword.mockResolvedValue(null);

		const { getStoredEmail } = await importCredentials();
		const email = await getStoredEmail();

		expect(email).toBeNull();
	});

	it("falls back to legacy email entry", async () => {
		mockGetPassword.mockImplementation(async (_service, account) => {
			if (account === "credentials") return null;
			if (account === "email") return "legacy@example.com";
			return null;
		});

		const { getStoredEmail } = await importCredentials();
		const email = await getStoredEmail();

		expect(email).toBe("legacy@example.com");
	});

	it("returns null when keychain operation fails", async () => {
		mockGetPassword.mockRejectedValue(new Error("Keychain locked"));

		const { getStoredEmail } = await importCredentials();
		const email = await getStoredEmail();

		expect(email).toBeNull();
	});

	it("returns null when blob has no email field", async () => {
		mockGetPassword.mockImplementation(async (_service, account) => {
			if (account === "credentials") {
				return JSON.stringify({ password: "no-email-here" });
			}
			return null;
		});

		const { getStoredEmail } = await importCredentials();
		const email = await getStoredEmail();

		expect(email).toBeNull();
	});
});
