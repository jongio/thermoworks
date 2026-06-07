import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../src/components/ErrorBoundary.tsx";

// Suppress React's console.error for expected error boundary triggers
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	consoleErrorSpy.mockRestore();
});

function ThrowingComponent({ message }: { message: string }): never {
	throw new Error(message);
}

function GoodComponent() {
	return <p>All good</p>;
}

describe("ErrorBoundary", () => {
	it("renders children when no error occurs", () => {
		render(
			<ErrorBoundary>
				<GoodComponent />
			</ErrorBoundary>,
		);

		expect(screen.getByText("All good")).toBeInTheDocument();
	});

	it("shows error fallback UI when child throws", () => {
		render(
			<ErrorBoundary>
				<ThrowingComponent message="Render failed" />
			</ErrorBoundary>,
		);

		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
		expect(screen.getByText(/encountered an unexpected error/i)).toBeInTheDocument();
	});

	it("displays the error message in a pre block", () => {
		render(
			<ErrorBoundary>
				<ThrowingComponent message="Connection timeout" />
			</ErrorBoundary>,
		);

		const pre = screen.getByText("Connection timeout");
		expect(pre.tagName).toBe("PRE");
	});

	it("renders a Reload button", () => {
		render(
			<ErrorBoundary>
				<ThrowingComponent message="oops" />
			</ErrorBoundary>,
		);

		expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
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
});
