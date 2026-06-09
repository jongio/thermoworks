import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResetMinMaxButton } from "../src/components/ResetMinMaxButton.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

function makeMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		resetMinMax: vi.fn().mockResolvedValue({ success: true }),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

describe("ResetMinMaxButton", () => {
	it("renders reset button with correct aria-label", () => {
		const client = makeMockClient();
		render(<ResetMinMaxButton serial="TW-001" channel={1} client={client} />);

		expect(screen.getByRole("button", { name: /reset min\/max/i })).toBeInTheDocument();
	});

	it("shows confirmation prompt when clicked", () => {
		const client = makeMockClient();
		render(<ResetMinMaxButton serial="TW-001" channel={1} client={client} />);

		fireEvent.click(screen.getByRole("button", { name: /reset min\/max/i }));

		expect(screen.getByText("Reset?")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
	});

	it("hides confirmation when cancel is clicked", () => {
		const client = makeMockClient();
		render(<ResetMinMaxButton serial="TW-001" channel={1} client={client} />);

		fireEvent.click(screen.getByRole("button", { name: /reset min\/max/i }));
		fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

		expect(screen.queryByText("Reset?")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: /reset min\/max/i })).toBeInTheDocument();
	});

	it("calls resetMinMax with correct serial and channel on confirm", async () => {
		const client = makeMockClient();
		render(<ResetMinMaxButton serial="TW-001" channel={3} client={client} />);

		fireEvent.click(screen.getByRole("button", { name: /reset min\/max/i }));

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
		});

		expect(client.resetMinMax).toHaveBeenCalledWith("TW-001", 3);
	});

	it("calls onReset callback after successful reset", async () => {
		const client = makeMockClient();
		const onReset = vi.fn();
		render(<ResetMinMaxButton serial="TW-001" channel={1} client={client} onReset={onReset} />);

		fireEvent.click(screen.getByRole("button", { name: /reset min\/max/i }));

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
		});

		expect(onReset).toHaveBeenCalledOnce();
	});

	it("shows error when resetMinMax returns success: false", async () => {
		const client = makeMockClient({
			resetMinMax: vi.fn().mockResolvedValue({ success: false }),
		} as unknown as Partial<ThermoworksWebClient>);

		render(<ResetMinMaxButton serial="TW-001" channel={1} client={client} />);

		fireEvent.click(screen.getByRole("button", { name: /reset min\/max/i }));

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
		});

		expect(screen.getByText("Reset failed")).toBeInTheDocument();
	});

	it("shows error when resetMinMax throws", async () => {
		const client = makeMockClient({
			resetMinMax: vi.fn().mockRejectedValue(new Error("Network error")),
		} as unknown as Partial<ThermoworksWebClient>);

		render(<ResetMinMaxButton serial="TW-001" channel={1} client={client} />);

		fireEvent.click(screen.getByRole("button", { name: /reset min\/max/i }));

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
		});

		expect(screen.getByText("Network error")).toBeInTheDocument();
	});

	it("does not call onReset when reset fails", async () => {
		const client = makeMockClient({
			resetMinMax: vi.fn().mockResolvedValue({ success: false }),
		} as unknown as Partial<ThermoworksWebClient>);
		const onReset = vi.fn();

		render(<ResetMinMaxButton serial="TW-001" channel={1} client={client} onReset={onReset} />);

		fireEvent.click(screen.getByRole("button", { name: /reset min\/max/i }));

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
		});

		expect(onReset).not.toHaveBeenCalled();
	});

	it("returns to initial state after successful reset", async () => {
		const client = makeMockClient();
		render(<ResetMinMaxButton serial="TW-001" channel={1} client={client} />);

		fireEvent.click(screen.getByRole("button", { name: /reset min\/max/i }));

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
		});

		// Should return to icon button state
		expect(screen.getByRole("button", { name: /reset min\/max/i })).toBeInTheDocument();
		expect(screen.queryByText("Reset?")).not.toBeInTheDocument();
	});
});
