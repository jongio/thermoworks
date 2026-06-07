import { afterEach, describe, expect, it } from "vitest";
import {
	CREDENTIAL_ACCOUNT,
	CREDENTIAL_SERVICE,
	LEGACY_ACCOUNT_EMAIL,
	LEGACY_ACCOUNT_PASSWORD,
	parseCredentialBlob,
	resolveEnvCredentials,
	serializeCredentials,
} from "../src/credentials.js";

describe("credential constants", () => {
	it("has correct service and account names", () => {
		expect(CREDENTIAL_SERVICE).toBe("thermoworks");
		expect(CREDENTIAL_ACCOUNT).toBe("credentials");
		expect(LEGACY_ACCOUNT_EMAIL).toBe("email");
		expect(LEGACY_ACCOUNT_PASSWORD).toBe("password");
	});
});

describe("parseCredentialBlob", () => {
	it("parses valid JSON blob with email and password", () => {
		const blob = JSON.stringify({ email: "user@example.com", password: "secret" });
		expect(parseCredentialBlob(blob)).toEqual({ email: "user@example.com", password: "secret" });
	});

	it("returns null for empty email", () => {
		expect(parseCredentialBlob(JSON.stringify({ email: "", password: "secret" }))).toBeNull();
	});

	it("returns null for empty password", () => {
		expect(
			parseCredentialBlob(JSON.stringify({ email: "user@example.com", password: "" })),
		).toBeNull();
	});

	it("returns null for missing fields", () => {
		expect(parseCredentialBlob(JSON.stringify({ email: "user@example.com" }))).toBeNull();
		expect(parseCredentialBlob(JSON.stringify({ password: "secret" }))).toBeNull();
		expect(parseCredentialBlob(JSON.stringify({}))).toBeNull();
	});

	it("returns null for invalid JSON", () => {
		expect(parseCredentialBlob("not-json")).toBeNull();
		expect(parseCredentialBlob("")).toBeNull();
	});

	it("returns null for non-object JSON", () => {
		expect(parseCredentialBlob('"string"')).toBeNull();
		expect(parseCredentialBlob("42")).toBeNull();
	});
});

describe("serializeCredentials", () => {
	it("serializes email and password to JSON", () => {
		const blob = serializeCredentials("user@example.com", "secret");
		expect(JSON.parse(blob)).toEqual({ email: "user@example.com", password: "secret" });
	});

	it("roundtrips with parseCredentialBlob", () => {
		const blob = serializeCredentials("test@test.com", "pass123");
		const parsed = parseCredentialBlob(blob);
		expect(parsed).toEqual({ email: "test@test.com", password: "pass123" });
	});
});

describe("resolveEnvCredentials", () => {
	afterEach(() => {
		delete process.env.THERMOWORKS_EMAIL;
		delete process.env.THERMOWORKS_PASSWORD;
	});

	it("returns credentials when both env vars are set", () => {
		process.env.THERMOWORKS_EMAIL = "env@example.com";
		process.env.THERMOWORKS_PASSWORD = "envpass";
		expect(resolveEnvCredentials()).toEqual({ email: "env@example.com", password: "envpass" });
	});

	it("returns null when only email is set", () => {
		process.env.THERMOWORKS_EMAIL = "env@example.com";
		expect(resolveEnvCredentials()).toBeNull();
	});

	it("returns null when only password is set", () => {
		process.env.THERMOWORKS_PASSWORD = "envpass";
		expect(resolveEnvCredentials()).toBeNull();
	});

	it("returns null when neither is set", () => {
		expect(resolveEnvCredentials()).toBeNull();
	});
});
