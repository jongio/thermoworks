import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @github/keytar before importing credentials module
vi.mock("@github/keytar", () => ({
	default: undefined,
}));

/**
 * Minimal SecretStorage stub backed by a Map.
 */
function createMockSecretStorage() {
	const store = new Map<string, string>();
	return {
		get: vi.fn((key: string) => Promise.resolve(store.get(key))),
		store: vi.fn((key: string, value: string) => {
			store.set(key, value);
			return Promise.resolve();
		}),
		delete: vi.fn((key: string) => {
			store.delete(key);
			return Promise.resolve();
		}),
		onDidChange: vi.fn(),
		_store: store,
	};
}

// Re-import the module fresh per test to reset the cached _keytar variable
async function importCredentials() {
	const mod = await import("../src/credentials.js");
	return mod;
}

describe("CredentialStore", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
		delete process.env.THERMOWORKS_EMAIL;
		delete process.env.THERMOWORKS_PASSWORD;
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	describe("getCredentials()", () => {
		it("returns env vars when THERMOWORKS_EMAIL and THERMOWORKS_PASSWORD are set", async () => {
			process.env.THERMOWORKS_EMAIL = "env@test.com";
			process.env.THERMOWORKS_PASSWORD = "envpass123";

			const { CredentialStore } = await importCredentials();
			const secrets = createMockSecretStorage();
			const store = new CredentialStore(secrets as any);

			const creds = await store.getCredentials();

			expect(creds).toEqual({ email: "env@test.com", password: "envpass123" });
			// Should not touch keytar or SecretStorage
			expect(secrets.get).not.toHaveBeenCalled();
		});

		it("returns keytar credentials when available (atomic format)", async () => {
			const keytarStore = new Map<string, string>();
			keytarStore.set(
				"thermoworks/credentials",
				JSON.stringify({ email: "keytar@test.com", password: "keytarpass" }),
			);

			vi.doMock("@github/keytar", () => ({
				default: {
					getPassword: vi.fn((service: string, account: string) =>
						Promise.resolve(keytarStore.get(`${service}/${account}`) ?? null),
					),
					setPassword: vi.fn((service: string, account: string, password: string) => {
						keytarStore.set(`${service}/${account}`, password);
						return Promise.resolve();
					}),
					deletePassword: vi.fn((service: string, account: string) => {
						keytarStore.delete(`${service}/${account}`);
						return Promise.resolve(true);
					}),
				},
			}));

			const { CredentialStore } = await importCredentials();
			const secrets = createMockSecretStorage();
			const store = new CredentialStore(secrets as any);

			const creds = await store.getCredentials();

			expect(creds).toEqual({ email: "keytar@test.com", password: "keytarpass" });
		});

		it("updates SecretStorage cache when reading from keytar", async () => {
			const keytarStore = new Map<string, string>();
			keytarStore.set(
				"thermoworks/credentials",
				JSON.stringify({ email: "sync@test.com", password: "syncpass" }),
			);

			vi.doMock("@github/keytar", () => ({
				default: {
					getPassword: vi.fn((service: string, account: string) =>
						Promise.resolve(keytarStore.get(`${service}/${account}`) ?? null),
					),
					setPassword: vi.fn(() => Promise.resolve()),
					deletePassword: vi.fn(() => Promise.resolve(true)),
				},
			}));

			const { CredentialStore } = await importCredentials();
			const secrets = createMockSecretStorage();
			const store = new CredentialStore(secrets as any);

			await store.getCredentials();

			expect(secrets.store).toHaveBeenCalledWith(
				"thermoworks.credentials",
				JSON.stringify({ email: "sync@test.com", password: "syncpass" }),
			);
		});

		it("clears SecretStorage when keytar is available but empty (logout sync)", async () => {
			vi.doMock("@github/keytar", () => ({
				default: {
					getPassword: vi.fn(() => Promise.resolve(null)),
					setPassword: vi.fn(() => Promise.resolve()),
					deletePassword: vi.fn(() => Promise.resolve(true)),
				},
			}));

			const { CredentialStore } = await importCredentials();
			const secrets = createMockSecretStorage();
			// Pre-populate SecretStorage to verify it gets cleared
			secrets._store.set(
				"thermoworks.credentials",
				JSON.stringify({ email: "stale@test.com", password: "stalepass" }),
			);
			const store = new CredentialStore(secrets as any);

			const creds = await store.getCredentials();

			expect(creds).toBeNull();
			expect(secrets.delete).toHaveBeenCalledWith("thermoworks.credentials");
		});

		it("falls back to SecretStorage when keytar unavailable", async () => {
			vi.doMock("@github/keytar", () => {
				throw new Error("Cannot find module @github/keytar");
			});

			const { CredentialStore } = await importCredentials();
			const secrets = createMockSecretStorage();
			secrets._store.set(
				"thermoworks.credentials",
				JSON.stringify({ email: "cached@test.com", password: "cachedpass" }),
			);
			const store = new CredentialStore(secrets as any);

			const creds = await store.getCredentials();

			expect(creds).toEqual({ email: "cached@test.com", password: "cachedpass" });
		});

		it("returns null when nothing available", async () => {
			vi.doMock("@github/keytar", () => {
				throw new Error("Cannot find module @github/keytar");
			});

			const { CredentialStore } = await importCredentials();
			const secrets = createMockSecretStorage();
			const store = new CredentialStore(secrets as any);

			const creds = await store.getCredentials();

			expect(creds).toBeNull();
		});

		it("migrates legacy keytar entries to atomic format", async () => {
			const keytarStore = new Map<string, string>();
			keytarStore.set("thermoworks/email", "legacy@test.com");
			keytarStore.set("thermoworks/password", "legacypass");

			const mockSetPassword = vi.fn((service: string, account: string, password: string) => {
				keytarStore.set(`${service}/${account}`, password);
				return Promise.resolve();
			});
			const mockDeletePassword = vi.fn((service: string, account: string) => {
				keytarStore.delete(`${service}/${account}`);
				return Promise.resolve(true);
			});

			vi.doMock("@github/keytar", () => ({
				default: {
					getPassword: vi.fn((service: string, account: string) =>
						Promise.resolve(keytarStore.get(`${service}/${account}`) ?? null),
					),
					setPassword: mockSetPassword,
					deletePassword: mockDeletePassword,
				},
			}));

			const { CredentialStore } = await importCredentials();
			const secrets = createMockSecretStorage();
			const store = new CredentialStore(secrets as any);

			const creds = await store.getCredentials();

			expect(creds).toEqual({ email: "legacy@test.com", password: "legacypass" });
			// Should have written atomic format
			expect(mockSetPassword).toHaveBeenCalledWith(
				"thermoworks",
				"credentials",
				JSON.stringify({ email: "legacy@test.com", password: "legacypass" }),
			);
			// Should have deleted legacy entries
			expect(mockDeletePassword).toHaveBeenCalledWith("thermoworks", "email");
			expect(mockDeletePassword).toHaveBeenCalledWith("thermoworks", "password");
		});

		it("migrates legacy SecretStorage entries to atomic format", async () => {
			vi.doMock("@github/keytar", () => {
				throw new Error("Cannot find module @github/keytar");
			});

			const { CredentialStore } = await importCredentials();
			const secrets = createMockSecretStorage();
			secrets._store.set("thermoworks.email", "legacyvs@test.com");
			secrets._store.set("thermoworks.password", "legacyvspass");
			const store = new CredentialStore(secrets as any);

			const creds = await store.getCredentials();

			expect(creds).toEqual({ email: "legacyvs@test.com", password: "legacyvspass" });
			// Should have migrated to atomic and deleted legacy
			expect(secrets.store).toHaveBeenCalledWith(
				"thermoworks.credentials",
				JSON.stringify({ email: "legacyvs@test.com", password: "legacyvspass" }),
			);
			expect(secrets.delete).toHaveBeenCalledWith("thermoworks.email");
			expect(secrets.delete).toHaveBeenCalledWith("thermoworks.password");
		});
	});

	describe("storeCredentials()", () => {
		it("writes to keytar and SecretStorage", async () => {
			const mockSetPassword = vi.fn(() => Promise.resolve());

			vi.doMock("@github/keytar", () => ({
				default: {
					getPassword: vi.fn(() => Promise.resolve(null)),
					setPassword: mockSetPassword,
					deletePassword: vi.fn(() => Promise.resolve(true)),
				},
			}));

			const { CredentialStore } = await importCredentials();
			const secrets = createMockSecretStorage();
			const store = new CredentialStore(secrets as any);

			await store.storeCredentials("user@test.com", "pass123");

			const expectedBlob = JSON.stringify({ email: "user@test.com", password: "pass123" });
			expect(mockSetPassword).toHaveBeenCalledWith("thermoworks", "credentials", expectedBlob);
			expect(secrets.store).toHaveBeenCalledWith("thermoworks.credentials", expectedBlob);
		});

		it("still updates SecretStorage when keytar is unavailable", async () => {
			vi.doMock("@github/keytar", () => {
				throw new Error("Cannot find module @github/keytar");
			});

			const { CredentialStore } = await importCredentials();
			const secrets = createMockSecretStorage();
			const store = new CredentialStore(secrets as any);

			await store.storeCredentials("user@test.com", "pass123");

			const expectedBlob = JSON.stringify({ email: "user@test.com", password: "pass123" });
			expect(secrets.store).toHaveBeenCalledWith("thermoworks.credentials", expectedBlob);
		});
	});

	describe("deleteCredentials()", () => {
		it("deletes from keytar and clears SecretStorage", async () => {
			const mockDeletePassword = vi.fn(() => Promise.resolve(true));

			vi.doMock("@github/keytar", () => ({
				default: {
					getPassword: vi.fn(() => Promise.resolve(null)),
					setPassword: vi.fn(() => Promise.resolve()),
					deletePassword: mockDeletePassword,
				},
			}));

			const { CredentialStore } = await importCredentials();
			const secrets = createMockSecretStorage();
			secrets._store.set(
				"thermoworks.credentials",
				JSON.stringify({ email: "old@test.com", password: "oldpass" }),
			);
			const store = new CredentialStore(secrets as any);

			await store.deleteCredentials();

			// Keytar deletions
			expect(mockDeletePassword).toHaveBeenCalledWith("thermoworks", "credentials");
			expect(mockDeletePassword).toHaveBeenCalledWith("thermoworks", "email");
			expect(mockDeletePassword).toHaveBeenCalledWith("thermoworks", "password");
			// SecretStorage cleared
			expect(secrets.delete).toHaveBeenCalledWith("thermoworks.credentials");
			expect(secrets.delete).toHaveBeenCalledWith("thermoworks.email");
			expect(secrets.delete).toHaveBeenCalledWith("thermoworks.password");
		});

		it("clears SecretStorage even when keytar is unavailable", async () => {
			vi.doMock("@github/keytar", () => {
				throw new Error("Cannot find module @github/keytar");
			});

			const { CredentialStore } = await importCredentials();
			const secrets = createMockSecretStorage();
			secrets._store.set(
				"thermoworks.credentials",
				JSON.stringify({ email: "old@test.com", password: "oldpass" }),
			);
			const store = new CredentialStore(secrets as any);

			await store.deleteCredentials();

			expect(secrets.delete).toHaveBeenCalledWith("thermoworks.credentials");
		});
	});
});
