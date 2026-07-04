import type { Account, BillingPlan } from "thermoworks-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Module mocks ---

vi.mock("thermoworks-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("thermoworks-sdk")>();
	const mockGetAccount = vi.fn();
	const mockGetBillingPlan = vi.fn();
	const mockClose = vi.fn();

	class MockThermoworksCloud {
		getAccount = mockGetAccount;
		getBillingPlan = mockGetBillingPlan;
		close = mockClose;
	}

	return { ...actual, ThermoworksCloud: MockThermoworksCloud };
});

vi.mock("../src/credentials.js", () => ({
	getCredentials: vi.fn(),
}));

import { ThermoworksCloud } from "thermoworks-sdk";
import { getCredentials } from "../src/credentials.js";

const mockGetCredentials = vi.mocked(getCredentials);

const mockClient = new ThermoworksCloud({ email: "", password: "" });
const mockGetAccount = vi.mocked(mockClient.getAccount);
const mockGetBillingPlan = vi.mocked(mockClient.getBillingPlan);

// --- Helpers ---

function makeAccount(overrides: Partial<Account> = {}): Account {
	return {
		accountId: overrides.accountId ?? "acct-abc123",
		name: "name" in overrides ? overrides.name! : "Jane's Kitchen",
		type: "type" in overrides ? overrides.type! : "standard",
		createdOn: "createdOn" in overrides ? overrides.createdOn! : new Date("2024-03-15T10:00:00Z"),
		exportVersion: "exportVersion" in overrides ? overrides.exportVersion! : 2,
	};
}

function makePlan(overrides: Partial<BillingPlan> = {}): BillingPlan {
	return {
		id: overrides.id ?? "plan-1",
		name: overrides.name ?? "Cloud Basic",
		description: overrides.description ?? "Basic cloud storage",
		monthlyAmount: overrides.monthlyAmount ?? 0,
		deviceCount: overrides.deviceCount ?? 3,
		isDefault: overrides.isDefault ?? true,
	};
}

// --- Test suites ---

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

// =============================================================================
// account command - human-readable output
// =============================================================================

describe("account", () => {
	it("displays account details and billing plan", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetAccount.mockResolvedValue(makeAccount());
		mockGetBillingPlan.mockResolvedValue(makePlan());

		const { account } = await import("../src/commands/account.js");
		await account();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("Jane's Kitchen");
		expect(output).toContain("acct-abc123");
		expect(output).toContain("standard");
		expect(output).toContain("March 15, 2024");
		expect(output).toContain("Cloud Basic");
		expect(output).toContain("Free");
		expect(output).toContain("3");
	});

	it("formats a paid plan amount as a monthly price", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetAccount.mockResolvedValue(makeAccount());
		mockGetBillingPlan.mockResolvedValue(makePlan({ monthlyAmount: 4.99 }));

		const { account } = await import("../src/commands/account.js");
		await account();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("$4.99/mo");
	});

	it("shows 'No billing plan on file.' when plan is null", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetAccount.mockResolvedValue(makeAccount());
		mockGetBillingPlan.mockResolvedValue(null);

		const { account } = await import("../src/commands/account.js");
		await account();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("No billing plan on file.");
	});

	it("shows N/A for null optional account fields", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetAccount.mockResolvedValue(makeAccount({ name: null, type: null, createdOn: null }));
		mockGetBillingPlan.mockResolvedValue(null);

		const { account } = await import("../src/commands/account.js");
		await account();

		const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
		expect(output).toContain("acct-abc123");
		expect(output).toContain("N/A");
	});

	it("exits with error when not logged in", async () => {
		mockGetCredentials.mockResolvedValue(null);
		const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit");
		});

		const { account } = await import("../src/commands/account.js");
		await expect(account()).rejects.toThrow("process.exit");

		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Not logged in"));
		exitSpy.mockRestore();
	});
});

// =============================================================================
// account command - JSON output
// =============================================================================

describe("account --json", () => {
	it("outputs account and billing plan as JSON with no ANSI codes", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetAccount.mockResolvedValue(makeAccount());
		mockGetBillingPlan.mockResolvedValue(makePlan());

		const { account } = await import("../src/commands/account.js");
		await account({ json: true });

		expect(logSpy).toHaveBeenCalledTimes(1);
		const raw = logSpy.mock.calls[0][0] as string;
		expect(raw).not.toContain("\x1b[");
		const output = JSON.parse(raw);
		expect(output.account.accountId).toBe("acct-abc123");
		expect(output.billingPlan.name).toBe("Cloud Basic");
	});

	it("outputs null billingPlan as JSON when no plan", async () => {
		mockGetCredentials.mockResolvedValue({ email: "a@b.com", password: "pw" });
		mockGetAccount.mockResolvedValue(makeAccount());
		mockGetBillingPlan.mockResolvedValue(null);

		const { account } = await import("../src/commands/account.js");
		await account({ json: true });

		const output = JSON.parse(logSpy.mock.calls[0][0] as string);
		expect(output.billingPlan).toBeNull();
	});
});
