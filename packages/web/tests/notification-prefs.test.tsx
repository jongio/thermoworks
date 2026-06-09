import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NotificationPrefs } from "../src/components/NotificationPrefs.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

function makeMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		getNotificationSettings: vi.fn().mockResolvedValue({
			enabled: false,
			continuousAlerts: false,
			emailNotification: false,
			smsNotification: false,
			deviceNotification: false,
		}),
		updateNotificationSettings: vi.fn().mockResolvedValue({ success: true }),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

describe("NotificationPrefs", () => {
	describe("rendering", () => {
		it("shows loading state initially", () => {
			const client = makeMockClient({
				getNotificationSettings: vi.fn().mockReturnValue(new Promise(() => {})),
			});
			render(<NotificationPrefs client={client} />);

			expect(screen.getByText(/loading notification settings/i)).toBeInTheDocument();
		});

		it("renders all toggle switches after loading", async () => {
			const client = makeMockClient();
			await act(async () => {
				render(<NotificationPrefs client={client} />);
			});

			expect(screen.getByRole("switch", { name: /enable notifications/i })).toBeInTheDocument();
			expect(screen.getByRole("switch", { name: /continuous alerts/i })).toBeInTheDocument();
			expect(screen.getByRole("switch", { name: /email notifications/i })).toBeInTheDocument();
			expect(screen.getByRole("switch", { name: /sms notifications/i })).toBeInTheDocument();
			expect(screen.getByRole("switch", { name: /push notifications/i })).toBeInTheDocument();
		});

		it("renders section heading with bell icon", async () => {
			const client = makeMockClient();
			await act(async () => {
				render(<NotificationPrefs client={client} />);
			});

			expect(screen.getByRole("heading", { name: /notifications/i })).toBeInTheDocument();
		});

		it("shows descriptions for each setting", async () => {
			const client = makeMockClient();
			await act(async () => {
				render(<NotificationPrefs client={client} />);
			});

			expect(screen.getByText(/master toggle for all notification channels/i)).toBeInTheDocument();
			expect(
				screen.getByText(/keep alerting until the alarm condition clears/i),
			).toBeInTheDocument();
			expect(screen.getByText(/receive alarm alerts via email/i)).toBeInTheDocument();
			expect(screen.getByText(/receive alarm alerts via text message/i)).toBeInTheDocument();
			expect(screen.getByText(/receive alarm alerts on your mobile device/i)).toBeInTheDocument();
		});

		it("reflects initial enabled state from API", async () => {
			const client = makeMockClient({
				getNotificationSettings: vi.fn().mockResolvedValue({
					enabled: true,
					continuousAlerts: false,
					emailNotification: true,
					smsNotification: false,
					deviceNotification: false,
				}),
			});

			await act(async () => {
				render(<NotificationPrefs client={client} />);
			});

			expect(screen.getByRole("switch", { name: /enable notifications/i })).toHaveAttribute(
				"aria-checked",
				"true",
			);
			expect(screen.getByRole("switch", { name: /continuous alerts/i })).toHaveAttribute(
				"aria-checked",
				"false",
			);
			expect(screen.getByRole("switch", { name: /email notifications/i })).toHaveAttribute(
				"aria-checked",
				"true",
			);
		});
	});

	describe("auto-save on toggle", () => {
		it("calls updateNotificationSettings when a toggle is clicked", async () => {
			const client = makeMockClient();
			await act(async () => {
				render(<NotificationPrefs client={client} />);
			});

			await act(async () => {
				screen.getByRole("switch", { name: /enable notifications/i }).click();
			});

			expect(client.updateNotificationSettings).toHaveBeenCalledWith({ enabled: true });
		});

		it("optimistically updates the toggle state", async () => {
			let resolveUpdate: () => void;
			const updatePromise = new Promise<{ success: boolean }>((resolve) => {
				resolveUpdate = () => resolve({ success: true });
			});

			const client = makeMockClient({
				updateNotificationSettings: vi.fn().mockReturnValue(updatePromise),
			});

			await act(async () => {
				render(<NotificationPrefs client={client} />);
			});

			const toggle = screen.getByRole("switch", { name: /email notifications/i });
			expect(toggle).toHaveAttribute("aria-checked", "false");

			await act(async () => {
				toggle.click();
			});

			// Should be checked immediately (optimistic)
			expect(toggle).toHaveAttribute("aria-checked", "true");

			// Resolve the update
			await act(async () => {
				resolveUpdate!();
			});

			expect(toggle).toHaveAttribute("aria-checked", "true");
		});

		it("reverts toggle on update failure", async () => {
			const client = makeMockClient({
				updateNotificationSettings: vi.fn().mockRejectedValue(new Error("Network error")),
			});

			await act(async () => {
				render(<NotificationPrefs client={client} />);
			});

			const toggle = screen.getByRole("switch", { name: /sms notifications/i });
			expect(toggle).toHaveAttribute("aria-checked", "false");

			await act(async () => {
				toggle.click();
			});

			// Should revert after failure
			expect(toggle).toHaveAttribute("aria-checked", "false");
		});

		it("shows error message on update failure", async () => {
			const client = makeMockClient({
				updateNotificationSettings: vi.fn().mockRejectedValue(new Error("Network error")),
			});

			await act(async () => {
				render(<NotificationPrefs client={client} />);
			});

			await act(async () => {
				screen.getByRole("switch", { name: /sms notifications/i }).click();
			});

			expect(screen.getByText("Network error")).toBeInTheDocument();
		});
	});

	describe("error state", () => {
		it("shows error when initial fetch fails", async () => {
			const client = makeMockClient({
				getNotificationSettings: vi.fn().mockRejectedValue(new Error("Auth expired")),
			});

			await act(async () => {
				render(<NotificationPrefs client={client} />);
			});

			expect(screen.getByText("Auth expired")).toBeInTheDocument();
			expect(screen.queryByRole("switch")).not.toBeInTheDocument();
		});
	});

	describe("disabled state during save", () => {
		it("disables all toggles while a save is in progress", async () => {
			const client = makeMockClient({
				updateNotificationSettings: vi.fn().mockReturnValue(new Promise(() => {})),
			});

			await act(async () => {
				render(<NotificationPrefs client={client} />);
			});

			await act(async () => {
				screen.getByRole("switch", { name: /enable notifications/i }).click();
			});

			const switches = screen.getAllByRole("switch");
			for (const sw of switches) {
				expect(sw).toBeDisabled();
			}
		});
	});
});
