import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionControls } from "../src/components/SessionControls.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

function makeMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		getTemperatureGuide: vi.fn().mockResolvedValue({
			categories: [
				{
					name: "Pork",
					items: [{ name: "Pulled Pork", temp: 203, units: "F", doneness: "Tender" }],
				},
			],
		}),
		startSession: vi.fn().mockResolvedValue({ success: true }),
		endSession: vi.fn().mockResolvedValue({ success: true }),
		updateDeviceState: vi.fn().mockResolvedValue({ success: true }),
		setAlarm: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

const presetChannels = [{ number: 1, label: "Probe <script>alert(1)</script>", units: "F" }];

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
				<SessionControls client={client} serial="TW-001" sessionStart={null} sessionLabel={null} />,
			);

			expect(screen.getByRole("button", { name: /start session/i })).toBeInTheDocument();
			expect(screen.getByPlaceholderText(/session label/i)).toBeInTheDocument();
		});

		describe("cook presets", () => {
			it("renders a preset picker sourced from temperature-guide data", async () => {
				const client = makeMockClient();
				render(
					<SessionControls
						client={client}
						serial="TW-001"
						sessionStart={null}
						sessionLabel={null}
						channels={presetChannels}
					/>,
				);

				expect(screen.getByLabelText("Cook preset")).toBeInTheDocument();
				await act(async () => {});

				expect(
					screen.getByRole("option", { name: /pork - pulled pork \(tender\) - 203°f/i }),
				).toBeInTheDocument();
			});

			it("assigns a preset to a channel and previews exact alarm changes with sanitized labels", async () => {
				const client = makeMockClient();
				render(
					<SessionControls
						client={client}
						serial="TW-001"
						sessionStart={null}
						sessionLabel={null}
						channels={presetChannels}
					/>,
				);

				await act(async () => {});

				expect(screen.getByRole("option", { name: /pulled pork/i })).toBeInTheDocument();
				fireEvent.change(screen.getByLabelText("Cook preset"), {
					target: { value: "Pork-Pulled Pork-Tender-203-F" },
				});
				fireEvent.change(screen.getByLabelText("Preset channel"), { target: { value: "1" } });

				expect(screen.getByText("Preview alarm changes")).toBeInTheDocument();
				expect(screen.getByText("Session label: Pulled Pork (Tender)")).toBeInTheDocument();
				expect(
					screen.getByText("Probe scriptalert(1)/script: enable high alarm at 203°F"),
				).toBeInTheDocument();
				expect(screen.getByText("Low alarm: unchanged")).toBeInTheDocument();
				expect(screen.queryByText(/<script>/i)).not.toBeInTheDocument();
			});

			it("starts a preset cook by creating the session label and setting the selected channel alarm", async () => {
				const client = makeMockClient();
				render(
					<SessionControls
						client={client}
						serial="TW-001"
						sessionStart={null}
						sessionLabel={null}
						channels={presetChannels}
					/>,
				);

				await act(async () => {});

				expect(screen.getByRole("option", { name: /pulled pork/i })).toBeInTheDocument();
				fireEvent.change(screen.getByLabelText("Cook preset"), {
					target: { value: "Pork-Pulled Pork-Tender-203-F" },
				});
				fireEvent.change(screen.getByLabelText("Preset channel"), { target: { value: "1" } });

				await act(async () => {
					fireEvent.click(screen.getByRole("button", { name: /start preset cook/i }));
				});

				expect(client.startSession).toHaveBeenCalledWith("TW-001", "Pulled Pork (Tender)");
				expect(client.setAlarm).toHaveBeenCalledWith("TW-001", 1, {
					high: { value: 203, units: "F", enabled: true },
				});
				expect(
					screen.getByText('Session: Started session "Pulled Pork (Tender)".'),
				).toBeInTheDocument();
				expect(
					screen.getByText("Alarm: Set Probe scriptalert(1)/script high alarm to 203°F."),
				).toBeInTheDocument();
			});

			it("updates an active session label and applies the preset alarm", async () => {
				const client = makeMockClient();
				render(
					<SessionControls
						client={client}
						serial="TW-001"
						sessionStart={new Date()}
						sessionLabel="Old Cook"
						channels={presetChannels}
					/>,
				);

				await act(async () => {});

				expect(screen.getByRole("option", { name: /pulled pork/i })).toBeInTheDocument();
				fireEvent.change(screen.getByLabelText("Cook preset"), {
					target: { value: "Pork-Pulled Pork-Tender-203-F" },
				});
				fireEvent.change(screen.getByLabelText("Preset channel"), { target: { value: "1" } });

				await act(async () => {
					fireEvent.click(screen.getByRole("button", { name: /update cook/i }));
				});

				expect(client.updateDeviceState).toHaveBeenCalledWith("TW-001", {
					sessionLabel: "Pulled Pork (Tender)",
				});
				expect(client.setAlarm).toHaveBeenCalledWith("TW-001", 1, {
					high: { value: 203, units: "F", enabled: true },
				});
				expect(
					screen.getByText('Session: Updated session label to "Pulled Pork (Tender)".'),
				).toBeInTheDocument();
			});

			it("shows per-step partial failure without hiding the successful session change", async () => {
				const client = makeMockClient({
					setAlarm: vi.fn().mockRejectedValue(new Error("Alarm service unavailable")),
				} as unknown as Partial<ThermoworksWebClient>);
				render(
					<SessionControls
						client={client}
						serial="TW-001"
						sessionStart={null}
						sessionLabel={null}
						channels={presetChannels}
					/>,
				);

				await act(async () => {});

				expect(screen.getByRole("option", { name: /pulled pork/i })).toBeInTheDocument();
				fireEvent.change(screen.getByLabelText("Cook preset"), {
					target: { value: "Pork-Pulled Pork-Tender-203-F" },
				});
				fireEvent.change(screen.getByLabelText("Preset channel"), { target: { value: "1" } });

				await act(async () => {
					fireEvent.click(screen.getByRole("button", { name: /start preset cook/i }));
				});

				expect(client.startSession).toHaveBeenCalledWith("TW-001", "Pulled Pork (Tender)");
				expect(
					screen.getByText('Session: Started session "Pulled Pork (Tender)".'),
				).toBeInTheDocument();
				expect(screen.getByText("Alarm: Alarm service unavailable")).toBeInTheDocument();
			});
		});

		it("calls startSession with label when start button is clicked", async () => {
			const client = makeMockClient();
			render(
				<SessionControls client={client} serial="TW-001" sessionStart={null} sessionLabel={null} />,
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
				<SessionControls client={client} serial="TW-001" sessionStart={null} sessionLabel={null} />,
			);

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /start session/i }));
			});

			expect(client.startSession).toHaveBeenCalledWith("TW-001", undefined);
		});

		it("starts session on Enter key in input", async () => {
			const client = makeMockClient();
			render(
				<SessionControls client={client} serial="TW-001" sessionStart={null} sessionLabel={null} />,
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
				<SessionControls client={client} serial="TW-001" sessionStart={null} sessionLabel={null} />,
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
