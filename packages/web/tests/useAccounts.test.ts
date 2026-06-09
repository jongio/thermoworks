import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccounts } from "../src/hooks/useAccounts.ts";

// Mock ThermoworksWebClient
vi.mock("../src/lib/api.ts", () => {
	const MockClient = vi.fn();
	MockClient.prototype.login = vi.fn();
	MockClient.prototype.logout = vi.fn();
	Object.defineProperty(MockClient.prototype, "isAuthenticated", {
		get: () => true,
	});
	return {
		ThermoworksWebClient: MockClient,
		AuthError: class extends Error {
			reason: string;
			constructor(msg: string, reason: string) {
				super(msg);
				this.reason = reason;
			}
		},
	};
});

describe("useAccounts", () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	afterEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	function seedSessionStorage(userId: string, projectId = "test-project") {
		sessionStorage.setItem(
			"thermoworks-session",
			JSON.stringify({
				token: {
					accessToken: `access-${userId}`,
					refreshToken: `refresh-${userId}`,
					userId,
					expiresAt: Date.now() + 3600_000,
				},
				projectId,
			}),
		);
	}

	it("starts with empty accounts when localStorage is empty", () => {
		const { result } = renderHook(() => useAccounts());
		expect(result.current.accounts).toEqual([]);
		expect(result.current.activeAccountId).toBeNull();
		expect(result.current.activeAccount).toBeNull();
	});

	it("addAccount stores an account from session data", () => {
		seedSessionStorage("user-1");
		const { result } = renderHook(() => useAccounts());

		act(() => {
			const mockClient = { isAuthenticated: true } as never;
			result.current.addAccount("alice@example.com", mockClient);
		});

		expect(result.current.accounts).toHaveLength(1);
		expect(result.current.accounts[0].email).toBe("alice@example.com");
		expect(result.current.accounts[0].id).toBe("user-1");
		expect(result.current.activeAccountId).toBe("user-1");
	});

	it("addAccount updates existing account if same userId", () => {
		seedSessionStorage("user-1");
		const { result } = renderHook(() => useAccounts());
		const mockClient = { isAuthenticated: true } as never;

		act(() => {
			result.current.addAccount("alice@example.com", mockClient);
		});

		// Seed with new token (simulating re-login)
		seedSessionStorage("user-1");
		act(() => {
			result.current.addAccount("alice@example.com", mockClient);
		});

		expect(result.current.accounts).toHaveLength(1);
	});

	it("addAccount supports multiple accounts", () => {
		const { result } = renderHook(() => useAccounts());
		const mockClient = { isAuthenticated: true } as never;

		seedSessionStorage("user-1");
		act(() => {
			result.current.addAccount("alice@example.com", mockClient);
		});

		seedSessionStorage("user-2");
		act(() => {
			result.current.addAccount("bob@example.com", mockClient);
		});

		expect(result.current.accounts).toHaveLength(2);
		expect(result.current.activeAccountId).toBe("user-2");
	});

	it("switchAccount changes the active account and returns a client", () => {
		const { result } = renderHook(() => useAccounts());
		const mockClient = { isAuthenticated: true } as never;

		seedSessionStorage("user-1");
		act(() => {
			result.current.addAccount("alice@example.com", mockClient);
		});

		seedSessionStorage("user-2");
		act(() => {
			result.current.addAccount("bob@example.com", mockClient);
		});

		let newClient: unknown;
		act(() => {
			newClient = result.current.switchAccount("user-1");
		});

		expect(newClient).not.toBeNull();
		expect(result.current.activeAccountId).toBe("user-1");
	});

	it("switchAccount returns null for unknown id", () => {
		const { result } = renderHook(() => useAccounts());

		let client: unknown;
		act(() => {
			client = result.current.switchAccount("nonexistent");
		});

		expect(client).toBeNull();
	});

	it("removeAccount removes an account from the list", () => {
		const { result } = renderHook(() => useAccounts());
		const mockClient = { isAuthenticated: true } as never;

		seedSessionStorage("user-1");
		act(() => {
			result.current.addAccount("alice@example.com", mockClient);
		});

		seedSessionStorage("user-2");
		act(() => {
			result.current.addAccount("bob@example.com", mockClient);
		});

		act(() => {
			result.current.removeAccount("user-1");
		});

		expect(result.current.accounts).toHaveLength(1);
		expect(result.current.accounts[0].id).toBe("user-2");
	});

	it("removeAccount switches active when removing the active account", () => {
		const { result } = renderHook(() => useAccounts());
		const mockClient = { isAuthenticated: true } as never;

		seedSessionStorage("user-1");
		act(() => {
			result.current.addAccount("alice@example.com", mockClient);
		});

		seedSessionStorage("user-2");
		act(() => {
			result.current.addAccount("bob@example.com", mockClient);
		});

		// user-2 is active, remove it
		act(() => {
			result.current.removeAccount("user-2");
		});

		expect(result.current.accounts).toHaveLength(1);
		expect(result.current.activeAccountId).toBe("user-1");
	});

	it("clearAllAccounts removes everything", () => {
		const { result } = renderHook(() => useAccounts());
		const mockClient = { isAuthenticated: true } as never;

		seedSessionStorage("user-1");
		act(() => {
			result.current.addAccount("alice@example.com", mockClient);
		});

		seedSessionStorage("user-2");
		act(() => {
			result.current.addAccount("bob@example.com", mockClient);
		});

		act(() => {
			result.current.clearAllAccounts();
		});

		expect(result.current.accounts).toEqual([]);
		expect(result.current.activeAccountId).toBeNull();
		expect(sessionStorage.getItem("thermoworks-session")).toBeNull();
	});

	it("persists accounts to localStorage", () => {
		seedSessionStorage("user-1");
		const { result } = renderHook(() => useAccounts());
		const mockClient = { isAuthenticated: true } as never;

		act(() => {
			result.current.addAccount("alice@example.com", mockClient);
		});

		const stored = localStorage.getItem("thermoworks-accounts");
		expect(stored).not.toBeNull();
		const parsed = JSON.parse(stored!);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].email).toBe("alice@example.com");
	});
});
