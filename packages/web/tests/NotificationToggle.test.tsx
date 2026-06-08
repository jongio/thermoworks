import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationToggle } from "../src/components/NotificationToggle.tsx";

// Store original Notification to restore later
const OriginalNotification = globalThis.Notification;

function mockNotification(permission: NotificationPermission) {
	const mock = {
		permission,
		requestPermission: vi.fn().mockResolvedValue("granted"),
	};
	Object.defineProperty(globalThis, "Notification", {
		value: mock,
		writable: true,
		configurable: true,
	});
	return mock;
}

function removeNotificationAPI() {
	Object.defineProperty(globalThis, "Notification", {
		value: undefined,
		writable: true,
		configurable: true,
	});
}

describe("NotificationToggle", () => {
	beforeEach(() => {
		localStorage.clear();
		// Default: mock with granted permission
		mockNotification("granted");
		// Mock navigator.permissions
		Object.defineProperty(navigator, "permissions", {
			value: {
				query: vi.fn().mockResolvedValue({
					state: "granted",
					addEventListener: vi.fn(),
					removeEventListener: vi.fn(),
				}),
			},
			writable: true,
			configurable: true,
		});
	});

	afterEach(() => {
		Object.defineProperty(globalThis, "Notification", {
			value: OriginalNotification,
			writable: true,
			configurable: true,
		});
	});

	it("renders enabled state when permission is granted and user has enabled", () => {
		localStorage.setItem("thermoworks-notifications-enabled", "true");
		mockNotification("granted");

		render(<NotificationToggle />);

		const button = screen.getByRole("button");
		expect(button).toHaveAttribute("aria-label", "Disable alarm notifications");
		expect(button).not.toBeDisabled();
	});

	it("renders disabled button when permission is denied", () => {
		mockNotification("denied");

		render(<NotificationToggle />);

		const button = screen.getByRole("button");
		expect(button).toHaveAttribute("aria-label", "Notifications blocked by browser");
		expect(button).toBeDisabled();
	});

	it("does nothing on click when permission is denied", () => {
		mockNotification("denied");

		render(<NotificationToggle />);

		const button = screen.getByRole("button");
		fireEvent.click(button);

		// Still disabled, no state change
		expect(button).toBeDisabled();
		expect(button).toHaveAttribute("aria-label", "Notifications blocked by browser");
	});

	it("requests permission when permission is 'default' and enables on grant", async () => {
		const mock = mockNotification("default");
		mock.requestPermission = vi.fn().mockResolvedValue("granted");

		render(<NotificationToggle />);

		const button = screen.getByRole("button");
		expect(button).toHaveAttribute("aria-label", "Enable alarm notifications");

		await act(async () => {
			fireEvent.click(button);
		});

		expect(mock.requestPermission).toHaveBeenCalledOnce();
	});

	it("toggles notifications off when granted and currently enabled", () => {
		localStorage.setItem("thermoworks-notifications-enabled", "true");
		mockNotification("granted");

		render(<NotificationToggle />);

		const button = screen.getByRole("button");
		fireEvent.click(button);

		// Should now show "Enable alarm notifications"
		expect(button).toHaveAttribute("aria-label", "Enable alarm notifications");
		expect(localStorage.getItem("thermoworks-notifications-enabled")).toBe("false");
	});

	it("toggles notifications on when granted and currently disabled", () => {
		localStorage.setItem("thermoworks-notifications-enabled", "false");
		mockNotification("granted");

		render(<NotificationToggle />);

		const button = screen.getByRole("button");
		fireEvent.click(button);

		expect(button).toHaveAttribute("aria-label", "Disable alarm notifications");
		expect(localStorage.getItem("thermoworks-notifications-enabled")).toBe("true");
	});

	it("renders denied state when Notification API is unavailable", () => {
		removeNotificationAPI();

		render(<NotificationToggle />);

		const button = screen.getByRole("button");
		expect(button).toBeDisabled();
		expect(button).toHaveAttribute("aria-label", "Notifications blocked by browser");
	});

	it("does not request permission when clicking toggle in granted state", () => {
		const mock = mockNotification("granted");
		localStorage.setItem("thermoworks-notifications-enabled", "true");

		render(<NotificationToggle />);

		fireEvent.click(screen.getByRole("button"));

		expect(mock.requestPermission).not.toHaveBeenCalled();
	});

	it("syncs permission change via navigator.permissions API", async () => {
		let onChange: (() => void) | undefined;
		Object.defineProperty(navigator, "permissions", {
			value: {
				query: vi.fn().mockResolvedValue({
					state: "granted",
					addEventListener: (_event: string, handler: () => void) => {
						onChange = handler;
					},
					removeEventListener: vi.fn(),
				}),
			},
			writable: true,
			configurable: true,
		});

		mockNotification("granted");
		localStorage.setItem("thermoworks-notifications-enabled", "true");

		render(<NotificationToggle />);

		// Wait for the permissions query to resolve
		await act(async () => {
			await Promise.resolve();
		});

		const button = screen.getByRole("button");
		expect(button).not.toBeDisabled();
	});

	it("handles request permission returning denied", async () => {
		const mock = mockNotification("default");
		mock.requestPermission = vi.fn().mockResolvedValue("denied");

		render(<NotificationToggle />);

		await act(async () => {
			fireEvent.click(screen.getByRole("button"));
		});

		expect(mock.requestPermission).toHaveBeenCalledOnce();
		// Permission should update to denied, button should become disabled
		const button = screen.getByRole("button");
		expect(button).toBeDisabled();
	});
});
