import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AccountInvite, User } from "thermoworks-sdk";
import { describe, expect, it, vi } from "vitest";
import { UserManagement } from "../src/components/UserManagement.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

function makeUser(overrides: Partial<User> = {}): User {
	return {
		userId: "user-1",
		accountId: "acct-1",
		email: "admin@example.com",
		displayName: "Admin User",
		timeZone: "America/Denver",
		preferredUnits: "F",
		locale: "en",
		photoUrl: null,
		use24Time: false,
		lastLogin: null,
		appVersion: null,
		accountRoles: { admin: true },
		roles: null,
		notificationSettings: null,
		...overrides,
	};
}

function makeInvite(overrides: Partial<AccountInvite> = {}): AccountInvite {
	return {
		id: "inv-1",
		accountId: "acct-1",
		email: "invited@example.com",
		status: "pending",
		createdAt: "2026-06-01T00:00:00Z",
		...overrides,
	};
}

function makeMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		getUser: vi.fn().mockResolvedValue(makeUser()),
		getInvites: vi
			.fn()
			.mockResolvedValue([
				makeInvite(),
				makeInvite({ id: "inv-2", email: "other@example.com", status: "accepted" }),
			]),
		removeUser: vi.fn().mockResolvedValue({ success: true }),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

describe("UserManagement", () => {
	it("shows loading state initially", () => {
		const client = makeMockClient();
		render(<UserManagement client={client} />);

		expect(screen.getByRole("status")).toBeInTheDocument();
		expect(screen.getByText("Loading user data...")).toBeInTheDocument();
	});

	it("renders invite list for admin users", async () => {
		const client = makeMockClient();
		render(<UserManagement client={client} />);

		await waitFor(() => {
			expect(screen.getByText("invited@example.com")).toBeInTheDocument();
		});

		expect(screen.getByText("other@example.com")).toBeInTheDocument();
		expect(screen.getByText("Account Users")).toBeInTheDocument();
		expect(screen.getByText(/Pending/)).toBeInTheDocument();
		expect(screen.getByText(/Accepted/)).toBeInTheDocument();
		// Both invites have dates rendered; verify at least one date is shown
		const dateElements = screen.getAllByText(/2026/);
		expect(dateElements.length).toBe(2);
	});

	it("shows non-admin message when user lacks admin role", async () => {
		const client = makeMockClient({
			getUser: vi.fn().mockResolvedValue(makeUser({ accountRoles: null })),
		});

		render(<UserManagement client={client} />);

		await waitFor(() => {
			expect(screen.getByText("Contact your account admin to manage users.")).toBeInTheDocument();
		});

		expect(screen.queryByText("Account Users")).not.toBeInTheDocument();
	});

	it("shows non-admin message when accountRoles has admin: false", async () => {
		const client = makeMockClient({
			getUser: vi.fn().mockResolvedValue(makeUser({ accountRoles: { admin: false } })),
		});

		render(<UserManagement client={client} />);

		await waitFor(() => {
			expect(screen.getByText("Contact your account admin to manage users.")).toBeInTheDocument();
		});
	});

	it("shows empty state when no invites exist", async () => {
		const client = makeMockClient({
			getInvites: vi.fn().mockResolvedValue([]),
		});

		render(<UserManagement client={client} />);

		await waitFor(() => {
			expect(screen.getByText("No pending invites.")).toBeInTheDocument();
		});
	});

	it("shows confirmation dialog before removing a user", async () => {
		const client = makeMockClient();
		render(<UserManagement client={client} />);

		await waitFor(() => {
			expect(screen.getByText("invited@example.com")).toBeInTheDocument();
		});

		const removeButtons = screen.getAllByTitle("Remove user");
		fireEvent.click(removeButtons[0]);

		expect(screen.getByText("Confirm")).toBeInTheDocument();
		expect(screen.getByText("Cancel")).toBeInTheDocument();
	});

	it("cancels removal when Cancel is clicked", async () => {
		const client = makeMockClient();
		render(<UserManagement client={client} />);

		await waitFor(() => {
			expect(screen.getByText("invited@example.com")).toBeInTheDocument();
		});

		const removeButtons = screen.getAllByTitle("Remove user");
		fireEvent.click(removeButtons[0]);
		fireEvent.click(screen.getByText("Cancel"));

		expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
	});

	it("removes user on confirmation", async () => {
		const client = makeMockClient();
		render(<UserManagement client={client} />);

		await waitFor(() => {
			expect(screen.getByText("invited@example.com")).toBeInTheDocument();
		});

		const removeButtons = screen.getAllByTitle("Remove user");
		fireEvent.click(removeButtons[0]);
		fireEvent.click(screen.getByText("Confirm"));

		await waitFor(() => {
			expect(client.removeUser).toHaveBeenCalledWith("inv-1");
		});

		await waitFor(() => {
			expect(screen.queryByText("invited@example.com")).not.toBeInTheDocument();
		});

		expect(screen.getByText("other@example.com")).toBeInTheDocument();
	});

	it("shows error when removal fails", async () => {
		const client = makeMockClient({
			removeUser: vi.fn().mockResolvedValue({ success: false }),
		});
		render(<UserManagement client={client} />);

		await waitFor(() => {
			expect(screen.getByText("invited@example.com")).toBeInTheDocument();
		});

		const removeButtons = screen.getAllByTitle("Remove user");
		fireEvent.click(removeButtons[0]);
		fireEvent.click(screen.getByText("Confirm"));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeInTheDocument();
		});

		expect(screen.getByText("Failed to remove user")).toBeInTheDocument();
		// User should still be in the list
		expect(screen.getByText("invited@example.com")).toBeInTheDocument();
	});

	it("shows error when removal throws", async () => {
		const client = makeMockClient({
			removeUser: vi.fn().mockRejectedValue(new Error("Network failure")),
		});
		render(<UserManagement client={client} />);

		await waitFor(() => {
			expect(screen.getByText("invited@example.com")).toBeInTheDocument();
		});

		const removeButtons = screen.getAllByTitle("Remove user");
		fireEvent.click(removeButtons[0]);
		fireEvent.click(screen.getByText("Confirm"));

		await waitFor(() => {
			expect(screen.getByText("Network failure")).toBeInTheDocument();
		});
	});

	it("shows error state when data loading fails", async () => {
		const client = makeMockClient({
			getUser: vi.fn().mockRejectedValue(new Error("Auth expired")),
		});

		render(<UserManagement client={client} />);

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeInTheDocument();
		});

		expect(screen.getByText("Auth expired")).toBeInTheDocument();
		expect(screen.getByText("Retry")).toBeInTheDocument();
	});

	it("retries data loading on Retry click", async () => {
		const getUser = vi
			.fn()
			.mockRejectedValueOnce(new Error("Temporary failure"))
			.mockResolvedValue(makeUser());

		const client = makeMockClient({ getUser });
		render(<UserManagement client={client} />);

		await waitFor(() => {
			expect(screen.getByText("Retry")).toBeInTheDocument();
		});

		fireEvent.click(screen.getByText("Retry"));

		await waitFor(() => {
			expect(screen.getByText("Account Users")).toBeInTheDocument();
		});

		expect(getUser).toHaveBeenCalledTimes(2);
	});
});
