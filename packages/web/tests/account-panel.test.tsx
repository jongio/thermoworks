import { act, render, screen } from "@testing-library/react";
import type { User } from "thermoworks-sdk";
import { describe, expect, it, vi } from "vitest";
import { AccountPanel } from "../src/components/AccountPanel.tsx";
import type { AccountInfo, ThermoworksWebClient } from "../src/lib/api.ts";

const BASE_USER: User = {
	userId: "user-1",
	accountId: "acct-1",
	email: "cook@example.com",
	displayName: "Pit Master",
	timeZone: "America/Denver",
	preferredUnits: "F",
	locale: null,
	photoUrl: null,
	use24Time: null,
	lastLogin: null,
	appVersion: null,
	accountRoles: null,
	roles: null,
	notificationSettings: null,
};

const BASE_ACCOUNT: AccountInfo = {
	id: "acct-1",
	name: "Backyard BBQ",
	plan: "Pro",
	devicesUsed: 3,
	devicesLimit: 10,
};

function makeMockClient(
	overrides: { account?: Partial<AccountInfo>; user?: Partial<User>; fail?: string } = {},
): ThermoworksWebClient {
	const account = { ...BASE_ACCOUNT, ...overrides.account };
	const user = { ...BASE_USER, ...overrides.user };

	return {
		isAuthenticated: true,
		getAccount: overrides.fail
			? vi.fn().mockRejectedValue(new Error(overrides.fail))
			: vi.fn().mockResolvedValue(account),
		getUser: overrides.fail
			? vi.fn().mockRejectedValue(new Error(overrides.fail))
			: vi.fn().mockResolvedValue(user),
	} as unknown as ThermoworksWebClient;
}

describe("AccountPanel", () => {
	it("shows loading skeleton initially", () => {
		const client = makeMockClient();
		// Use a never-resolving promise so loading state persists
		(client.getAccount as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
		render(<AccountPanel client={client} />);

		expect(screen.getByLabelText(/loading account information/i)).toBeInTheDocument();
	});

	it("renders account name, ID, and plan", async () => {
		const client = makeMockClient();

		await act(async () => {
			render(<AccountPanel client={client} />);
		});

		// user.displayName takes precedence over account.name
		expect(screen.getByText("Pit Master")).toBeInTheDocument();
		expect(screen.getByText("acct-1")).toBeInTheDocument();
		expect(screen.getByText("Pro")).toBeInTheDocument();
	});

	it("renders device usage bar with correct ARIA values", async () => {
		const client = makeMockClient({ account: { devicesUsed: 3, devicesLimit: 10 } });

		await act(async () => {
			render(<AccountPanel client={client} />);
		});

		const bar = screen.getByRole("progressbar");
		expect(bar).toHaveAttribute("aria-valuenow", "3");
		expect(bar).toHaveAttribute("aria-valuemax", "10");
		expect(bar).toHaveAttribute("aria-label", "3 of 10 devices used");
		expect(screen.getByText("3 / 10")).toBeInTheDocument();
	});

	it("applies destructive color when usage is 90% or above", async () => {
		const client = makeMockClient({ account: { devicesUsed: 9, devicesLimit: 10 } });

		await act(async () => {
			render(<AccountPanel client={client} />);
		});

		const bar = screen.getByRole("progressbar");
		const fill = bar.firstElementChild as HTMLElement;
		expect(fill.className).toContain("bg-destructive");
	});

	it("applies orange color when usage is between 70% and 89%", async () => {
		const client = makeMockClient({ account: { devicesUsed: 8, devicesLimit: 10 } });

		await act(async () => {
			render(<AccountPanel client={client} />);
		});

		const bar = screen.getByRole("progressbar");
		const fill = bar.firstElementChild as HTMLElement;
		expect(fill.className).toContain("bg-orange-500");
	});

	it("hides usage bar when devicesLimit is 0", async () => {
		const client = makeMockClient({ account: { devicesUsed: 0, devicesLimit: 0 } });

		await act(async () => {
			render(<AccountPanel client={client} />);
		});

		expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
	});

	it("shows 'Unknown' when plan is null", async () => {
		const client = makeMockClient({ account: { plan: null } });

		await act(async () => {
			render(<AccountPanel client={client} />);
		});

		expect(screen.getByText("Unknown")).toBeInTheDocument();
	});

	it("renders user email, timezone, and units", async () => {
		const client = makeMockClient();

		await act(async () => {
			render(<AccountPanel client={client} />);
		});

		expect(screen.getByText("cook@example.com")).toBeInTheDocument();
		expect(screen.getByText("America/Denver")).toBeInTheDocument();
		expect(screen.getByText("Fahrenheit")).toBeInTheDocument();
	});

	it("shows Celsius when preferredUnits is C", async () => {
		const client = makeMockClient({ user: { preferredUnits: "C" } });

		await act(async () => {
			render(<AccountPanel client={client} />);
		});

		expect(screen.getByText("Celsius")).toBeInTheDocument();
	});

	it("renders management link to cloud.thermoworks.com", async () => {
		const client = makeMockClient();

		await act(async () => {
			render(<AccountPanel client={client} />);
		});

		const link = screen.getByRole("link", { name: /manage account/i });
		expect(link).toHaveAttribute("href", "https://cloud.thermoworks.com");
		expect(link).toHaveAttribute("target", "_blank");
		expect(link).toHaveAttribute("rel", "noopener noreferrer");
	});

	it("shows error message when loading fails", async () => {
		const client = makeMockClient({ fail: "Network timeout" });

		await act(async () => {
			render(<AccountPanel client={client} />);
		});

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText("Network timeout")).toBeInTheDocument();
	});

	it("omits name row when both displayName and account name are null", async () => {
		const client = makeMockClient({ account: { name: null }, user: { displayName: null } });

		await act(async () => {
			render(<AccountPanel client={client} />);
		});

		// "Name" dt should not be present
		const dts = screen.getAllByRole("term");
		const names = dts.filter((dt) => dt.textContent === "Name");
		expect(names).toHaveLength(0);
	});

	it("caps usage percentage at 100 when oversubscribed", async () => {
		const client = makeMockClient({ account: { devicesUsed: 15, devicesLimit: 10 } });

		await act(async () => {
			render(<AccountPanel client={client} />);
		});

		const bar = screen.getByRole("progressbar");
		const fill = bar.firstElementChild as HTMLElement;
		expect(fill.style.width).toBe("100%");
	});
});
