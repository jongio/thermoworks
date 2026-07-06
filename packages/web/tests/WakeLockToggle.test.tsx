import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WakeLockToggle } from "../src/components/WakeLockToggle.tsx";

interface FakeSentinel {
	release: ReturnType<typeof vi.fn>;
	addEventListener: ReturnType<typeof vi.fn>;
	removeEventListener: ReturnType<typeof vi.fn>;
}

function makeSentinel(): FakeSentinel {
	return {
		release: vi.fn().mockResolvedValue(undefined),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	};
}

function mockWakeLock() {
	const sentinel = makeSentinel();
	const request = vi.fn().mockResolvedValue(sentinel);
	Object.defineProperty(navigator, "wakeLock", {
		value: { request },
		writable: true,
		configurable: true,
	});
	return { sentinel, request };
}

function removeWakeLock() {
	// Delete the property so `"wakeLock" in navigator` is false.
	// @ts-expect-error - deleting an optional runtime property for the test.
	delete (navigator as { wakeLock?: unknown }).wakeLock;
}

describe("WakeLockToggle", () => {
	beforeEach(() => {
		localStorage.clear();
		mockWakeLock();
	});

	afterEach(() => {
		removeWakeLock();
		vi.restoreAllMocks();
	});

	it("renders nothing when the Wake Lock API is unavailable", () => {
		removeWakeLock();

		const { container } = render(<WakeLockToggle />);

		expect(container).toBeEmptyDOMElement();
	});

	it("renders the off state by default", () => {
		render(<WakeLockToggle />);

		const button = screen.getByRole("button");
		expect(button).toHaveAttribute("aria-label", "Keep screen awake");
		expect(button).toHaveAttribute("aria-pressed", "false");
	});

	it("renders the on state when the preference is stored", () => {
		localStorage.setItem("thermoworks-wake-lock-enabled", "true");

		render(<WakeLockToggle />);

		const button = screen.getByRole("button");
		expect(button).toHaveAttribute("aria-label", "Let screen sleep");
		expect(button).toHaveAttribute("aria-pressed", "true");
	});

	it("enables and requests a wake lock on click", async () => {
		const { request } = mockWakeLock();

		render(<WakeLockToggle />);

		const button = screen.getByRole("button");
		await act(async () => {
			fireEvent.click(button);
		});

		expect(button).toHaveAttribute("aria-pressed", "true");
		expect(localStorage.getItem("thermoworks-wake-lock-enabled")).toBe("true");
		expect(request).toHaveBeenCalledWith("screen");
	});

	it("disables and releases the wake lock on click", async () => {
		localStorage.setItem("thermoworks-wake-lock-enabled", "true");
		const { sentinel } = mockWakeLock();

		render(<WakeLockToggle />);

		// Let the initial acquire resolve.
		await act(async () => {
			await Promise.resolve();
		});

		const button = screen.getByRole("button");
		await act(async () => {
			fireEvent.click(button);
		});

		expect(button).toHaveAttribute("aria-pressed", "false");
		expect(localStorage.getItem("thermoworks-wake-lock-enabled")).toBe("false");
		expect(sentinel.release).toHaveBeenCalled();
	});

	it("swallows a rejected wake lock request", async () => {
		const request = vi.fn().mockRejectedValue(new Error("denied"));
		Object.defineProperty(navigator, "wakeLock", {
			value: { request },
			writable: true,
			configurable: true,
		});

		render(<WakeLockToggle />);

		const button = screen.getByRole("button");
		await act(async () => {
			fireEvent.click(button);
		});

		// Toggle still reflects the user's intent even if the request failed.
		expect(button).toHaveAttribute("aria-pressed", "true");
		expect(request).toHaveBeenCalledWith("screen");
	});
});
