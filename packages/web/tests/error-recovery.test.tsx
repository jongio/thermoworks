import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionStatus } from "../src/components/ConnectionStatus.tsx";
import { ErrorBoundary } from "../src/components/ErrorBoundary.tsx";
import { OfflineBanner } from "../src/components/OfflineBanner.tsx";
import { useOnlineStatus } from "../src/hooks/useOnlineStatus.ts";
import { useRetry } from "../src/hooks/useRetry.ts";

// Suppress React's console.error for expected error boundary triggers
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	consoleErrorSpy.mockRestore();
	vi.useRealTimers();
});

function ThrowingComponent({ message }: { message: string }): never {
	throw new Error(message);
}

function GoodComponent() {
	return <p>All good</p>;
}

// --- ErrorBoundary ---

describe("ErrorBoundary", () => {
	it("renders children when no error occurs", () => {
		render(
			<ErrorBoundary>
				<GoodComponent />
			</ErrorBoundary>,
		);
		expect(screen.getByText("All good")).toBeInTheDocument();
	});

	it("shows error card UI when child throws", () => {
		render(
			<ErrorBoundary>
				<ThrowingComponent message="Render failed" />
			</ErrorBoundary>,
		);
		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
		expect(screen.getByText(/encountered an unexpected error/i)).toBeInTheDocument();
	});

	it("renders a Try again button that resets the boundary", () => {
		let shouldThrow = true;

		function MaybeThrowing() {
			if (shouldThrow) throw new Error("boom");
			return <p>Recovered</p>;
		}

		render(
			<ErrorBoundary>
				<MaybeThrowing />
			</ErrorBoundary>,
		);

		expect(screen.getByText("Something went wrong")).toBeInTheDocument();

		// Fix the underlying issue, then click "Try again"
		shouldThrow = false;
		fireEvent.click(screen.getByRole("button", { name: /try again/i }));

		expect(screen.getByText("Recovered")).toBeInTheDocument();
	});

	it("renders a Reload page button", () => {
		render(
			<ErrorBoundary>
				<ThrowingComponent message="oops" />
			</ErrorBoundary>,
		);
		expect(screen.getByRole("button", { name: /reload page/i })).toBeInTheDocument();
	});

	it("shows collapsible technical details", () => {
		render(
			<ErrorBoundary>
				<ThrowingComponent message="Connection timeout" />
			</ErrorBoundary>,
		);

		const toggle = screen.getByRole("button", { name: /technical details/i });
		expect(toggle).toBeInTheDocument();
		expect(toggle).toHaveAttribute("aria-expanded", "false");

		fireEvent.click(toggle);

		expect(toggle).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByText(/Connection timeout/)).toBeInTheDocument();
	});

	it("renders custom fallback prop when provided", () => {
		render(
			<ErrorBoundary fallback={<div>Custom error screen</div>}>
				<ThrowingComponent message="crash" />
			</ErrorBoundary>,
		);
		expect(screen.getByText("Custom error screen")).toBeInTheDocument();
		expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
	});

	it("calls onReset callback when Try again is clicked", () => {
		const onReset = vi.fn();
		let shouldThrow = true;

		function MaybeThrowing() {
			if (shouldThrow) throw new Error("fail");
			return <p>OK</p>;
		}

		render(
			<ErrorBoundary onReset={onReset}>
				<MaybeThrowing />
			</ErrorBoundary>,
		);

		shouldThrow = false;
		fireEvent.click(screen.getByRole("button", { name: /try again/i }));

		expect(onReset).toHaveBeenCalledTimes(1);
	});
});

// --- useOnlineStatus ---

describe("useOnlineStatus", () => {
	it("returns true when browser is online", () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
		const { result } = renderHook(() => useOnlineStatus());
		expect(result.current).toBe(true);
	});

	it("returns false when browser is offline", () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { result } = renderHook(() => useOnlineStatus());
		expect(result.current).toBe(false);
	});

	it("updates when the online event fires", () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { result } = renderHook(() => useOnlineStatus());
		expect(result.current).toBe(false);

		// Simulate going online
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		expect(result.current).toBe(true);
	});

	it("updates when the offline event fires", () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
		const { result } = renderHook(() => useOnlineStatus());
		expect(result.current).toBe(true);

		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		expect(result.current).toBe(false);
	});
});

// --- OfflineBanner ---

describe("OfflineBanner", () => {
	it("renders nothing when online", () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
		const { container } = render(<OfflineBanner />);
		expect(container.firstChild).toBeNull();
	});

	it("renders warning when offline", () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		render(<OfflineBanner />);
		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
	});

	it("has appropriate aria attributes", () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		render(<OfflineBanner />);
		const alert = screen.getByRole("alert");
		expect(alert).toHaveAttribute("aria-live", "polite");
	});
});

// --- ConnectionStatus ---

describe("ConnectionStatus", () => {
	it("shows Connected when online", () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
		render(<ConnectionStatus />);
		expect(screen.getByText("Connected")).toBeInTheDocument();
	});

	it("shows Reconnecting when offline", () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		render(<ConnectionStatus />);
		expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
	});
});

// --- useRetry ---

describe("useRetry", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	it("returns result on first success", async () => {
		const fn = vi.fn().mockResolvedValue("data");
		const { result } = renderHook(() => useRetry(fn));

		let value: string | undefined;
		await act(async () => {
			value = await result.current.execute();
		});

		expect(value).toBe("data");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(result.current.isRetrying).toBe(false);
		expect(result.current.attempts).toBe(1);
		expect(result.current.error).toBeNull();
	});

	it("retries on failure with exponential backoff", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("fail 1"))
			.mockRejectedValueOnce(new Error("fail 2"))
			.mockResolvedValueOnce("success");

		const { result } = renderHook(() => useRetry(fn, { maxAttempts: 3, delay: 100 }));

		const promise = act(async () => {
			return result.current.execute();
		});

		// First attempt fires immediately, fails
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
		});
		expect(fn).toHaveBeenCalledTimes(1);

		// Wait for first backoff: 100ms * 2^0 = 100ms
		await act(async () => {
			await vi.advanceTimersByTimeAsync(100);
		});
		expect(fn).toHaveBeenCalledTimes(2);

		// Wait for second backoff: 100ms * 2^1 = 200ms
		await act(async () => {
			await vi.advanceTimersByTimeAsync(200);
		});
		expect(fn).toHaveBeenCalledTimes(3);

		const value = await promise;
		expect(value).toBe("success");
		expect(result.current.error).toBeNull();
	});

	it("sets error after all attempts exhausted", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("persistent failure"));
		const { result } = renderHook(() => useRetry(fn, { maxAttempts: 2, delay: 50 }));

		let executePromise: Promise<unknown>;
		act(() => {
			executePromise = result.current.execute();
		});

		// First attempt rejects immediately, then backoff timer fires
		await act(async () => {
			await vi.advanceTimersByTimeAsync(50);
		});

		// Second attempt rejects, execute resolves
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0);
			await executePromise!;
		});

		expect(result.current.error?.message).toBe("persistent failure");
		expect(result.current.isRetrying).toBe(false);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("reset clears all state", async () => {
		vi.useRealTimers();
		const fn = vi.fn().mockRejectedValue(new Error("fail"));
		const { result } = renderHook(() => useRetry(fn, { maxAttempts: 1, delay: 50 }));

		await act(async () => {
			await result.current.execute();
		});

		expect(result.current.error).not.toBeNull();

		act(() => {
			result.current.reset();
		});

		expect(result.current.error).toBeNull();
		expect(result.current.attempts).toBe(0);
		expect(result.current.isRetrying).toBe(false);
	});
});
