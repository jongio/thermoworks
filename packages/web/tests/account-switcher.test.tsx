import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountSwitcher } from "../src/components/AccountSwitcher.tsx";
import type { StoredAccount } from "../src/hooks/useAccounts.ts";

function makeAccount(overrides: Partial<StoredAccount> = {}): StoredAccount {
	return {
		id: "user-1",
		email: "alice@example.com",
		displayName: null,
		token: {
			accessToken: "access-1",
			refreshToken: "refresh-1",
			userId: "user-1",
			expiresAt: Date.now() + 3600_000,
		},
		projectId: "proj-1",
		lastUsed: Date.now(),
		...overrides,
	};
}

describe("AccountSwitcher", () => {
	const defaultProps = {
		accounts: [makeAccount()],
		activeAccountId: "user-1",
		collapsed: false,
		onSwitch: vi.fn(),
		onAddAccount: vi.fn(),
		onRemoveAccount: vi.fn(),
		onSignOutAll: vi.fn(),
	};

	it("renders nothing when no accounts exist", () => {
		const { container } = render(
			<AccountSwitcher {...defaultProps} accounts={[]} activeAccountId={null} />,
		);
		expect(container.firstChild).toBeNull();
	});

	it("renders the trigger button with active account email", () => {
		render(<AccountSwitcher {...defaultProps} />);
		const trigger = screen.getByRole("button", { name: /alice@example.com/i });
		expect(trigger).toBeInTheDocument();
	});

	it("shows only avatar when collapsed", () => {
		render(<AccountSwitcher {...defaultProps} collapsed={true} />);
		const trigger = screen.getByRole("button", { name: /alice@example.com/i });
		expect(trigger).toBeInTheDocument();
		// Email text should not be visible (only in aria-label)
		expect(trigger.textContent).not.toContain("alice@example.com");
	});

	it("opens dropdown on trigger click", () => {
		render(<AccountSwitcher {...defaultProps} />);
		fireEvent.click(screen.getByRole("button", { name: /alice@example.com/i }));
		expect(screen.getByRole("menu", { name: /account switcher/i })).toBeInTheDocument();
	});

	it("shows all accounts in the dropdown", () => {
		const accounts = [
			makeAccount({ id: "user-1", email: "alice@example.com" }),
			makeAccount({ id: "user-2", email: "bob@example.com" }),
		];
		render(<AccountSwitcher {...defaultProps} accounts={accounts} />);
		fireEvent.click(screen.getByRole("button", { name: /alice@example.com/i }));

		expect(
			screen.getByRole("menuitem", { name: /alice@example.com.*current/i }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("menuitem", { name: /switch to bob@example.com/i }),
		).toBeInTheDocument();
	});

	it("calls onSwitch when clicking a non-active account", () => {
		const onSwitch = vi.fn();
		const accounts = [
			makeAccount({ id: "user-1", email: "alice@example.com" }),
			makeAccount({ id: "user-2", email: "bob@example.com" }),
		];
		render(<AccountSwitcher {...defaultProps} accounts={accounts} onSwitch={onSwitch} />);
		fireEvent.click(screen.getByRole("button", { name: /alice@example.com/i }));
		fireEvent.click(screen.getByRole("menuitem", { name: /switch to bob@example.com/i }));

		expect(onSwitch).toHaveBeenCalledWith("user-2");
	});

	it("does not call onSwitch when clicking the active account", () => {
		const onSwitch = vi.fn();
		render(<AccountSwitcher {...defaultProps} onSwitch={onSwitch} />);
		fireEvent.click(screen.getByRole("button", { name: /alice@example.com/i }));
		fireEvent.click(screen.getByRole("menuitem", { name: /alice@example.com.*current/i }));

		expect(onSwitch).not.toHaveBeenCalled();
	});

	it("calls onAddAccount when clicking Add account", () => {
		const onAddAccount = vi.fn();
		render(<AccountSwitcher {...defaultProps} onAddAccount={onAddAccount} />);
		fireEvent.click(screen.getByRole("button", { name: /alice@example.com/i }));
		fireEvent.click(screen.getByRole("menuitem", { name: /add account/i }));

		expect(onAddAccount).toHaveBeenCalledTimes(1);
	});

	it("calls onSignOutAll when clicking sign out", () => {
		const onSignOutAll = vi.fn();
		render(<AccountSwitcher {...defaultProps} onSignOutAll={onSignOutAll} />);
		fireEvent.click(screen.getByRole("button", { name: /alice@example.com/i }));
		fireEvent.click(screen.getByRole("menuitem", { name: /sign out of all/i }));

		expect(onSignOutAll).toHaveBeenCalledTimes(1);
	});

	it("shows a check mark next to the active account", () => {
		const accounts = [
			makeAccount({ id: "user-1", email: "alice@example.com" }),
			makeAccount({ id: "user-2", email: "bob@example.com" }),
		];
		render(<AccountSwitcher {...defaultProps} accounts={accounts} />);
		fireEvent.click(screen.getByRole("button", { name: /alice@example.com/i }));

		// Active account menu item should exist with "current" label
		const activeItem = screen.getByRole("menuitem", { name: /alice@example.com.*current/i });
		expect(activeItem).toBeInTheDocument();
	});

	it("shows remove button on hover for non-active accounts", () => {
		const accounts = [
			makeAccount({ id: "user-1", email: "alice@example.com" }),
			makeAccount({ id: "user-2", email: "bob@example.com" }),
		];
		render(<AccountSwitcher {...defaultProps} accounts={accounts} />);
		fireEvent.click(screen.getByRole("button", { name: /alice@example.com/i }));

		// Remove button should exist in the DOM (hidden via CSS group-hover)
		const removeBtn = screen.getByRole("button", { name: /remove bob@example.com/i });
		expect(removeBtn).toBeInTheDocument();
	});

	it("calls onRemoveAccount when remove button is clicked", () => {
		const onRemoveAccount = vi.fn();
		const accounts = [
			makeAccount({ id: "user-1", email: "alice@example.com" }),
			makeAccount({ id: "user-2", email: "bob@example.com" }),
		];
		render(
			<AccountSwitcher {...defaultProps} accounts={accounts} onRemoveAccount={onRemoveAccount} />,
		);
		fireEvent.click(screen.getByRole("button", { name: /alice@example.com/i }));
		fireEvent.click(screen.getByRole("button", { name: /remove bob@example.com/i }));

		expect(onRemoveAccount).toHaveBeenCalledWith("user-2");
	});
});
