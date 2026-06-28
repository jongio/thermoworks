import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCloudConstructor = vi.fn();
const mockGetUser = vi.fn<() => Promise<void>>();
const mockClose = vi.fn();

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();

	class MockThermoworksCloud {
		constructor(options: { email: string; password: string }) {
			mockCloudConstructor(options);
		}

		getUser = mockGetUser;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	deleteCredentials: vi.fn(),
	getCredentials: vi.fn(),
	getStoredEmail: vi.fn(),
	storeCredentials: vi.fn(),
}));

vi.mock("../src/output.js", () => ({
	outputJson: vi.fn(),
}));

vi.mock("../src/prompt.js", () => ({
	prompt: vi.fn(),
	promptPassword: vi.fn(),
}));

import { authLogin, authLogout, authStatus } from "../src/commands/auth.js";
import {
	deleteCredentials,
	getCredentials,
	getStoredEmail,
	storeCredentials,
} from "../src/credentials.js";
import { outputJson } from "../src/output.js";
import { prompt, promptPassword } from "../src/prompt.js";

const mockDeleteCredentials = vi.mocked(deleteCredentials);
const mockGetCredentials = vi.mocked(getCredentials);
const mockGetStoredEmail = vi.mocked(getStoredEmail);
const mockStoreCredentials = vi.mocked(storeCredentials);
const mockOutputJson = vi.mocked(outputJson);
const mockPrompt = vi.mocked(prompt);
const mockPromptPassword = vi.mocked(promptPassword);
const mockGetUserFn = vi.mocked(mockGetUser);
const mockCloseFn = vi.mocked(mockClose);
const mockCloudConstructorFn = vi.mocked(mockCloudConstructor);

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.clearAllMocks();

	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

	mockPrompt.mockResolvedValue("");
	mockPromptPassword.mockResolvedValue("");
	mockGetCredentials.mockResolvedValue(null);
	mockGetStoredEmail.mockResolvedValue(null);
	mockDeleteCredentials.mockResolvedValue(false);
	mockStoreCredentials.mockResolvedValue(undefined);
	mockOutputJson.mockImplementation(() => {});
	mockGetUserFn.mockResolvedValue(undefined);
	mockCloseFn.mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("authLogin", () => {
	it("completes a successful login flow", async () => {
		mockPrompt.mockResolvedValue("pitmaster@example.com");
		mockPromptPassword.mockResolvedValue("super-secret");

		await authLogin();

		expect(logSpy).toHaveBeenCalledWith("ThermoWorks Cloud Login\n");
		expect(mockPrompt).toHaveBeenCalledWith("Email: ");
		expect(mockPromptPassword).toHaveBeenCalledWith("Password: ");
		expect(stdoutWriteSpy).toHaveBeenCalledWith("Verifying credentials... ");
		expect(mockCloudConstructorFn).toHaveBeenCalledWith({
			email: "pitmaster@example.com",
			password: "super-secret",
		});
		expect(mockGetUserFn).toHaveBeenCalledOnce();
		expect(mockCloseFn).toHaveBeenCalledOnce();
		expect(logSpy).toHaveBeenCalledWith("✓");
		expect(mockStoreCredentials).toHaveBeenCalledWith("pitmaster@example.com", "super-secret");
		expect(logSpy).toHaveBeenCalledWith("Credentials saved to system keychain.");
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("exits with an error when email is empty", async () => {
		mockPrompt.mockResolvedValue("");
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		await expect(authLogin()).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith("Email is required.");
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(mockPromptPassword).not.toHaveBeenCalled();
		expect(stdoutWriteSpy).not.toHaveBeenCalled();
		expect(mockCloudConstructorFn).not.toHaveBeenCalled();
		expect(mockStoreCredentials).not.toHaveBeenCalled();
	});

	it("exits with an error when password is empty", async () => {
		mockPrompt.mockResolvedValue("pitmaster@example.com");
		mockPromptPassword.mockResolvedValue("");
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		await expect(authLogin()).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith("Password is required.");
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(stdoutWriteSpy).not.toHaveBeenCalled();
		expect(mockCloudConstructorFn).not.toHaveBeenCalled();
		expect(mockStoreCredentials).not.toHaveBeenCalled();
	});

	it("shows the AuthError message and exits when verification fails", async () => {
		mockPrompt.mockResolvedValue("pitmaster@example.com");
		mockPromptPassword.mockResolvedValue("wrong-password");
		const authError = new Error("Invalid email or password");
		authError.name = "AuthError";
		mockGetUserFn.mockRejectedValue(authError);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		await expect(authLogin()).rejects.toThrow("process.exit");

		expect(stdoutWriteSpy).toHaveBeenCalledWith("Verifying credentials... ");
		expect(logSpy).toHaveBeenCalledWith("✗");
		expect(errorSpy).toHaveBeenCalledWith("\nError: Invalid email or password");
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(mockStoreCredentials).not.toHaveBeenCalled();
		expect(mockCloseFn).not.toHaveBeenCalled();
	});

	it("shows connection failed for non-AuthError failures", async () => {
		mockPrompt.mockResolvedValue("pitmaster@example.com");
		mockPromptPassword.mockResolvedValue("super-secret");
		mockGetUserFn.mockRejectedValue(new Error("socket hang up"));
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		await expect(authLogin()).rejects.toThrow("process.exit");

		expect(logSpy).toHaveBeenCalledWith("✗");
		expect(errorSpy).toHaveBeenCalledWith("\nError: Connection failed");
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(mockStoreCredentials).not.toHaveBeenCalled();
		expect(mockCloseFn).not.toHaveBeenCalled();
	});
});

describe("authLogout", () => {
	it("reports when credentials are deleted", async () => {
		mockDeleteCredentials.mockResolvedValue(true);

		await authLogout();

		expect(mockDeleteCredentials).toHaveBeenCalledOnce();
		expect(logSpy).toHaveBeenNthCalledWith(1, "Credentials removed from system keychain.");
		expect(logSpy).toHaveBeenNthCalledWith(
			2,
			"Note: To fully revoke access, change your password at cloud.thermoworks.com.",
		);
	});

	it("reports when no credentials are found", async () => {
		mockDeleteCredentials.mockResolvedValue(false);

		await authLogout();

		expect(mockDeleteCredentials).toHaveBeenCalledOnce();
		expect(logSpy).toHaveBeenCalledWith("No credentials found in system keychain.");
	});
});

describe("authStatus", () => {
	it("shows logged in status in text mode", async () => {
		mockGetCredentials.mockResolvedValue({
			email: "pitmaster@example.com",
			password: "super-secret",
		});

		await authStatus();

		expect(logSpy).toHaveBeenCalledWith("Logged in as pitmaster@example.com");
		expect(mockOutputJson).not.toHaveBeenCalled();
		expect(mockGetStoredEmail).not.toHaveBeenCalled();
	});

	it("shows logged in status in json mode", async () => {
		mockGetCredentials.mockResolvedValue({
			email: "pitmaster@example.com",
			password: "super-secret",
		});

		await authStatus({ json: true });

		expect(mockOutputJson).toHaveBeenCalledWith({
			loggedIn: true,
			email: "pitmaster@example.com",
		});
		expect(logSpy).not.toHaveBeenCalled();
		expect(mockGetStoredEmail).not.toHaveBeenCalled();
	});

	it("shows stored email in text mode when password is missing", async () => {
		mockGetCredentials.mockResolvedValue(null);
		mockGetStoredEmail.mockResolvedValue("pitmaster@example.com");

		await authStatus();

		expect(logSpy).toHaveBeenCalledWith("Stored email: pitmaster@example.com (password missing)");
		expect(mockOutputJson).not.toHaveBeenCalled();
	});

	it("shows stored email in json mode when password is missing", async () => {
		mockGetCredentials.mockResolvedValue(null);
		mockGetStoredEmail.mockResolvedValue("pitmaster@example.com");

		await authStatus({ json: true });

		expect(mockOutputJson).toHaveBeenCalledWith({
			loggedIn: false,
			email: "pitmaster@example.com",
			passwordMissing: true,
		});
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("shows not logged in message in text mode", async () => {
		mockGetCredentials.mockResolvedValue(null);
		mockGetStoredEmail.mockResolvedValue(null);

		await authStatus();

		expect(logSpy).toHaveBeenCalledWith("Not logged in. Run: thermoworks auth login");
		expect(mockOutputJson).not.toHaveBeenCalled();
	});

	it("shows not logged in status in json mode", async () => {
		mockGetCredentials.mockResolvedValue(null);
		mockGetStoredEmail.mockResolvedValue(null);

		await authStatus({ json: true });

		expect(mockOutputJson).toHaveBeenCalledWith({ loggedIn: false });
		expect(logSpy).not.toHaveBeenCalled();
	});
});
