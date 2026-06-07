import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginForm } from "../src/components/LoginForm.tsx";
import { AuthError } from "../src/lib/api.ts";

// Mock the entire api module
vi.mock("../src/lib/api.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../src/lib/api.ts")>();
	const MockClient = vi.fn();
	MockClient.prototype.login = vi.fn();
	return {
		...actual,
		ThermoworksWebClient: MockClient,
	};
});

// Get the mocked class so we can configure its prototype per test
async function getMockClient() {
	const mod = await import("../src/lib/api.ts");
	return mod.ThermoworksWebClient as unknown as { prototype: { login: ReturnType<typeof vi.fn> } };
}

describe("LoginForm", () => {
	it("renders email and password fields with sign-in button", () => {
		render(<LoginForm onLogin={vi.fn()} />);

		expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
	});

	it("renders the heading and description", () => {
		render(<LoginForm onLogin={vi.fn()} />);

		expect(screen.getByText("ThermoWorks Dashboard")).toBeInTheDocument();
		expect(screen.getByText(/thermoworks cloud account/i)).toBeInTheDocument();
	});

	it("shows error message on AuthError with invalid credentials", async () => {
		const MockClient = await getMockClient();
		MockClient.prototype.login = vi
			.fn()
			.mockRejectedValue(new AuthError("Auth failed", "INVALID_LOGIN_CREDENTIALS"));

		render(<LoginForm onLogin={vi.fn()} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "test@example.com" },
		});
		fireEvent.change(screen.getByLabelText(/password/i), {
			target: { value: "wrongpass" },
		});
		fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password.");
		});
	});

	it("shows generic error message on non-AuthError", async () => {
		const MockClient = await getMockClient();
		MockClient.prototype.login = vi.fn().mockRejectedValue(new Error("Network error"));

		render(<LoginForm onLogin={vi.fn()} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "test@example.com" },
		});
		fireEvent.change(screen.getByLabelText(/password/i), {
			target: { value: "pass" },
		});
		fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Network error");
		});
	});

	it("calls onLogin with client on successful login", async () => {
		const MockClient = await getMockClient();
		MockClient.prototype.login = vi.fn().mockResolvedValue(undefined);
		const onLogin = vi.fn();

		render(<LoginForm onLogin={onLogin} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "user@example.com" },
		});
		fireEvent.change(screen.getByLabelText(/password/i), {
			target: { value: "correct" },
		});
		fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

		await waitFor(() => {
			expect(onLogin).toHaveBeenCalledTimes(1);
		});
	});

	it("does not submit with empty fields", () => {
		const onLogin = vi.fn();
		render(<LoginForm onLogin={onLogin} />);

		fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

		// onLogin should never be called since fields are empty
		expect(onLogin).not.toHaveBeenCalled();
	});
});
