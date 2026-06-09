import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeviceSettings } from "../src/components/DeviceSettings.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

function makeMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		updateDeviceState: vi.fn().mockResolvedValue({ success: true }),
		factoryReset: vi.fn().mockResolvedValue({ success: true }),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

describe("DeviceSettings", () => {
	describe("collapsible behavior", () => {
		it("renders collapsed by default with Settings heading", () => {
			const client = makeMockClient();
			render(
				<DeviceSettings client={client} serial="TW-001" timezone={null} preferredUnits={null} />,
			);

			expect(screen.getByRole("heading", { name: /settings/i })).toBeInTheDocument();
			expect(screen.queryByLabelText(/timezone/i)).not.toBeInTheDocument();
		});

		it("expands when header is clicked", () => {
			const client = makeMockClient();
			render(
				<DeviceSettings client={client} serial="TW-001" timezone={null} preferredUnits={null} />,
			);

			fireEvent.click(screen.getByRole("button", { name: /settings/i }));

			expect(screen.getByLabelText(/timezone/i)).toBeInTheDocument();
			expect(screen.getByLabelText(/preferred units/i)).toBeInTheDocument();
		});

		it("collapses when header is clicked again", () => {
			const client = makeMockClient();
			render(
				<DeviceSettings client={client} serial="TW-001" timezone={null} preferredUnits={null} />,
			);

			const toggle = screen.getByRole("button", { name: /settings/i });
			fireEvent.click(toggle);
			fireEvent.click(toggle);

			expect(screen.queryByLabelText(/timezone/i)).not.toBeInTheDocument();
		});
	});

	describe("save settings", () => {
		it("calls updateDeviceState with timezone and units on save", async () => {
			const client = makeMockClient();
			render(
				<DeviceSettings
					client={client}
					serial="TW-001"
					timezone="America/Denver"
					preferredUnits="C"
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: /settings/i }));

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
			});

			expect(client.updateDeviceState).toHaveBeenCalledWith("TW-001", {
				timeZone: "America/Denver",
				deviceDisplayUnits: "C",
			});
		});

		it("shows success message after successful save", async () => {
			const client = makeMockClient();
			render(
				<DeviceSettings
					client={client}
					serial="TW-001"
					timezone="America/Denver"
					preferredUnits="F"
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: /settings/i }));

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
			});

			expect(screen.getByText(/settings saved successfully/i)).toBeInTheDocument();
		});

		it("shows error message when save fails", async () => {
			const client = makeMockClient({
				updateDeviceState: vi.fn().mockRejectedValue(new Error("Network error")),
			} as unknown as Partial<ThermoworksWebClient>);

			render(
				<DeviceSettings client={client} serial="TW-001" timezone={null} preferredUnits={null} />,
			);

			fireEvent.click(screen.getByRole("button", { name: /settings/i }));

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
			});

			expect(screen.getByText("Network error")).toBeInTheDocument();
		});

		it("omits timezone from state when field is empty", async () => {
			const client = makeMockClient();
			render(<DeviceSettings client={client} serial="TW-001" timezone={null} preferredUnits="F" />);

			fireEvent.click(screen.getByRole("button", { name: /settings/i }));

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /save settings/i }));
			});

			expect(client.updateDeviceState).toHaveBeenCalledWith("TW-001", {
				deviceDisplayUnits: "F",
			});
		});
	});

	describe("factory reset", () => {
		it("disables factory reset button until serial is typed", () => {
			const client = makeMockClient();
			render(
				<DeviceSettings client={client} serial="TW-001" timezone={null} preferredUnits={null} />,
			);

			fireEvent.click(screen.getByRole("button", { name: /settings/i }));

			const resetBtn = screen.getByRole("button", { name: /factory reset/i });
			expect(resetBtn).toBeDisabled();
		});

		it("enables factory reset button when serial matches", () => {
			const client = makeMockClient();
			render(
				<DeviceSettings client={client} serial="TW-001" timezone={null} preferredUnits={null} />,
			);

			fireEvent.click(screen.getByRole("button", { name: /settings/i }));

			const input = screen.getByLabelText(/type.*TW-001.*to confirm/i);
			fireEvent.change(input, { target: { value: "TW-001" } });

			const resetBtn = screen.getByRole("button", { name: /factory reset/i });
			expect(resetBtn).not.toBeDisabled();
		});

		it("calls factoryReset when confirmed", async () => {
			const client = makeMockClient();
			render(
				<DeviceSettings client={client} serial="TW-001" timezone={null} preferredUnits={null} />,
			);

			fireEvent.click(screen.getByRole("button", { name: /settings/i }));

			const input = screen.getByLabelText(/type.*TW-001.*to confirm/i);
			fireEvent.change(input, { target: { value: "TW-001" } });

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /factory reset/i }));
			});

			expect(client.factoryReset).toHaveBeenCalledWith("TW-001");
		});

		it("shows success message after factory reset", async () => {
			const client = makeMockClient();
			render(
				<DeviceSettings client={client} serial="TW-001" timezone={null} preferredUnits={null} />,
			);

			fireEvent.click(screen.getByRole("button", { name: /settings/i }));

			const input = screen.getByLabelText(/type.*TW-001.*to confirm/i);
			fireEvent.change(input, { target: { value: "TW-001" } });

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /factory reset/i }));
			});

			expect(screen.getByText(/factory reset initiated/i)).toBeInTheDocument();
		});

		it("shows error when factory reset fails", async () => {
			const client = makeMockClient({
				factoryReset: vi.fn().mockRejectedValue(new Error("Reset failed")),
			} as unknown as Partial<ThermoworksWebClient>);

			render(
				<DeviceSettings client={client} serial="TW-001" timezone={null} preferredUnits={null} />,
			);

			fireEvent.click(screen.getByRole("button", { name: /settings/i }));

			const input = screen.getByLabelText(/type.*TW-001.*to confirm/i);
			fireEvent.change(input, { target: { value: "TW-001" } });

			await act(async () => {
				fireEvent.click(screen.getByRole("button", { name: /factory reset/i }));
			});

			expect(screen.getByText("Reset failed")).toBeInTheDocument();
		});

		it("does not call factoryReset when serial does not match", () => {
			const client = makeMockClient();
			render(
				<DeviceSettings client={client} serial="TW-001" timezone={null} preferredUnits={null} />,
			);

			fireEvent.click(screen.getByRole("button", { name: /settings/i }));

			const input = screen.getByLabelText(/type.*TW-001.*to confirm/i);
			fireEvent.change(input, { target: { value: "wrong" } });

			const resetBtn = screen.getByRole("button", { name: /factory reset/i });
			expect(resetBtn).toBeDisabled();
			expect(client.factoryReset).not.toHaveBeenCalled();
		});
	});

	describe("danger zone visibility", () => {
		it("shows danger zone warning text", () => {
			const client = makeMockClient();
			render(
				<DeviceSettings client={client} serial="TW-001" timezone={null} preferredUnits={null} />,
			);

			fireEvent.click(screen.getByRole("button", { name: /settings/i }));

			expect(screen.getByText(/danger zone/i)).toBeInTheDocument();
			expect(screen.getByText(/irreversible/i)).toBeInTheDocument();
		});
	});
});
