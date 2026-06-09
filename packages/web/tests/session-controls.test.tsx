import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionControls } from "../src/components/SessionControls.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

function makeMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		startSession: vi.fn().mockResolvedValue({ success: true }),
		endSession: vi.fn().mockResolvedValue({ success: true }),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

describe("SessionControls", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("inactive state", () => {
		it("renders start session button and label input", () => {
			const client = makeMockClient();
			render(
				<SessionControls
					client={client}
					serial="TW-001"
					sessionStart={null}
					sessionLabel={null}
				/>,
			);

			expect(screen.getByRole("button", { name: /start session/i })).toBeInTheDocument();
			expect(screen.getByPlaceholderText(/session label/i)).toBeInTheDocument();
		});

		it("calls startSession with label when start button is clicked", async () => {
			const client = makeMockClient();
			render(
				<SessionControls
					client={client}
					serial="TW-001"
					sessionStart={null}
					sessionLabel={null}
				/>,
			);

			const input = screen.getByPlaceholderText(/session label/i);
			fireEvent.change(input, { target: { value: "Brisket Cook" } });

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /start session/i }));
			});

			expect(client.startSession).toHaveBeenCalledWith("TW-001", "Brisket Cook");
		});

		it("calls startSession with undefined label when input is empty", async () => {
			const client = makeMockClient();
			render(
				<SessionControls
					client={client}
					serial="TW-001"
					sessionStart={null}
					sessionLabel={null}
				/>,
			);

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /start session/i }));
			});

			expect(client.startSession).toHaveBeenCalledWith("TW-001", undefined);
		});

		it("starts session on Enter key in input", async () => {
			const client = makeMockClient();
			render(
				<SessionControls
					client={client}
					serial="TW-001"
					sessionStart={null}
					sessionLabel={null}
				/>,
			);

			const input = screen.getByPlaceholderText(/session label/i);
			fireEvent.change(input, { target: { value: "Ribs" } });

			await act(async () => {
				fireEvent.keyDown(input, { key: "Enter" });
			});

			expect(client.startSession).toHaveBeenCalledWith("TW-001", "Ribs");
		});
	});

	describe("active state", () => {
		it("renders elapsed time display when session is active", () => {
			const client = makeMockClient();
			const sessionStart = new Date(Date.now() - 3661000); // 1h 1m 1s ago

			render(
				<SessionControls
					client={client}
					serial="TW-001"
					sessionStart={sessionStart}
					sessionLabel="Brisket"
				/>,
			);

			expect(screen.getByLabelText(/session elapsed time/i)).toBeInTheDocument();
			expect(screen.getByText("01:01:01")).toBeInTheDocument();
			expect(screen.getByText(/brisket/i)).toBeInTheDocument();
		});

		it("updates elapsed time every second", () => {
			const client = makeMockClient();
			const sessionStart = new Date(Date.now() - 5000);

			render(
				<SessionControls
					client={client}
					serial="TW-001"
					sessionStart={sessionStart}
					sessionLabel={null}
				/>,
			);

			expect(screen.getByText("00:00:05")).toBeInTheDocument();

			act(() => {
				vi.advanceTimersByTime(3000);
			});

			expect(screen.getByText("00:00:08")).toBeInTheDocument();
		});

		it("shows end session button", () => {
			const client = makeMockClient();
			render(
				<SessionControls
					client={client}
					serial="TW-001"
					sessionStart={new Date()}
					sessionLabel={null}
				/>,
			);

			expect(screen.getByRole("button", { name: /end/i })).toBeInTheDocument();
		});
	});

	describe("end session confirmation", () => {
		it("shows confirmation dialog when end is clicked", () => {
			const client = makeMockClient();
			render(
				<SessionControls
					client={client}
					serial="TW-001"
					sessionStart={new Date()}
					sessionLabel={null}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: /end/i }));

			expect(screen.getByText(/end session\?/i)).toBeInTheDocument();
			expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
		});

		it("calls endSession on confirm", async () => {
			const client = makeMockClient();
			render(
				<SessionControls
					client={client}
					serial="TW-001"
					sessionStart={new Date()}
					sessionLabel={null}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: /end/i }));

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
			});

			expect(client.endSession).toHaveBeenCalledWith("TW-001");
		});

		it("hides confirmation on cancel", () => {
			const client = makeMockClient();
			render(
				<SessionControls
					client={client}
					serial="TW-001"
					sessionStart={new Date()}
					sessionLabel={null}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: /end/i }));
			fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

			expect(screen.queryByText(/end session\?/i)).not.toBeInTheDocument();
			expect(screen.getByRole("button", { name: /end/i })).toBeInTheDocument();
		});
	});

	describe("error handling", () => {
		it("displays error when startSession fails", async () => {
			const client = makeMockClient({
				startSession: vi.fn().mockRejectedValue(new Error("Network error")),
			} as unknown as Partial<ThermoworksWebClient>);

			render(
				<SessionControls
					client={client}
					serial="TW-001"
					sessionStart={null}
					sessionLabel={null}
				/>,
			);

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /start session/i }));
			});

			expect(screen.getByText("Network error")).toBeInTheDocument();
		});

		it("displays error when endSession fails", async () => {
			const client = makeMockClient({
				endSession: vi.fn().mockRejectedValue(new Error("Server error")),
			} as unknown as Partial<ThermoworksWebClient>);

			render(
				<SessionControls
					client={client}
					serial="TW-001"
					sessionStart={new Date()}
					sessionLabel={null}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: /end/i }));

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
			});

			expect(screen.getByText("Server error")).toBeInTheDocument();
		});
	});
});
