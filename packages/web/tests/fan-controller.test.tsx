import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FanController } from "../src/components/FanController.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

function makeMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		setFanEnabled: vi.fn().mockResolvedValue({ success: true }),
		setFanTarget: vi.fn().mockResolvedValue({ success: true }),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

describe("FanController", () => {
	it("renders fan controller with toggle and label", () => {
		const client = makeMockClient();
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: true, connection: false, setTemp: null, fanChannel: null, state: null }}
			/>,
		);

		expect(screen.getByText("Fan Controller")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /enable fan/i })).toBeInTheDocument();
	});

	it("shows connected indicator when fan is physically connected", () => {
		const client = makeMockClient();
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: true, connection: false, setTemp: null, fanChannel: null, state: null }}
			/>,
		);

		expect(screen.getByText("(connected)")).toBeInTheDocument();
	});

	it("does not show connected indicator when fan is not physically connected", () => {
		const client = makeMockClient();
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: false, connection: false, setTemp: null, fanChannel: null, state: null }}
			/>,
		);

		expect(screen.queryByText("(connected)")).not.toBeInTheDocument();
	});

	it("shows target input when fan is enabled", () => {
		const client = makeMockClient();
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: true, connection: true, setTemp: 225, fanChannel: "1", state: 1 }}
			/>,
		);

		expect(screen.getByLabelText(/target/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /set/i })).toBeInTheDocument();
	});

	it("hides target input when fan is disabled", () => {
		const client = makeMockClient();
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: true, connection: false, setTemp: 225, fanChannel: null, state: null }}
			/>,
		);

		expect(screen.queryByLabelText(/target/i)).not.toBeInTheDocument();
	});

	it("displays current target temperature when set", () => {
		const client = makeMockClient();
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: true, connection: false, setTemp: 225, fanChannel: null, state: null }}
			/>,
		);

		expect(screen.getByText(/current target: 225°F/i)).toBeInTheDocument();
	});

	it("calls setFanEnabled when toggle is clicked", async () => {
		const client = makeMockClient();
		const onUpdated = vi.fn();
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: true, connection: false, setTemp: null, fanChannel: null, state: null }}
				onUpdated={onUpdated}
			/>,
		);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /enable fan/i }));
		});

		expect(client.setFanEnabled).toHaveBeenCalledWith("TW-001", true);
		expect(onUpdated).toHaveBeenCalled();
	});

	it("calls setFanEnabled(false) when disabling", async () => {
		const client = makeMockClient();
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: true, connection: true, setTemp: 225, fanChannel: "1", state: 1 }}
			/>,
		);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /disable fan/i }));
		});

		expect(client.setFanEnabled).toHaveBeenCalledWith("TW-001", false);
	});

	it("calls setFanTarget when Set button is clicked", async () => {
		const client = makeMockClient();
		const onUpdated = vi.fn();
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: true, connection: true, setTemp: 225, fanChannel: "1", state: 1 }}
				onUpdated={onUpdated}
			/>,
		);

		const input = screen.getByLabelText(/target/i);
		fireEvent.change(input, { target: { value: "250" } });

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /set/i }));
		});

		expect(client.setFanTarget).toHaveBeenCalledWith("TW-001", 250);
		expect(onUpdated).toHaveBeenCalled();
	});

	it("calls setFanTarget on Enter key in input", async () => {
		const client = makeMockClient();
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: true, connection: true, setTemp: null, fanChannel: "1", state: 1 }}
			/>,
		);

		const input = screen.getByLabelText(/target/i);
		fireEvent.change(input, { target: { value: "275" } });

		await act(async () => {
			fireEvent.keyDown(input, { key: "Enter" });
		});

		expect(client.setFanTarget).toHaveBeenCalledWith("TW-001", 275);
	});

	it("shows error when setFanTarget returns failure", async () => {
		const client = makeMockClient({
			setFanTarget: vi.fn().mockResolvedValue({ success: false }),
		});
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: true, connection: true, setTemp: 225, fanChannel: "1", state: 1 }}
			/>,
		);

		const input = screen.getByLabelText(/target/i);
		fireEvent.change(input, { target: { value: "300" } });

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /set/i }));
		});

		expect(screen.getByText(/failed to set target temperature/i)).toBeInTheDocument();
	});

	it("shows error for empty temperature input", async () => {
		const client = makeMockClient();
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: true, connection: true, setTemp: null, fanChannel: "1", state: 1 }}
			/>,
		);

		const input = screen.getByLabelText(/target/i);
		fireEvent.change(input, { target: { value: "" } });

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /set/i }));
		});

		expect(screen.getByText(/enter a valid temperature/i)).toBeInTheDocument();
		expect(client.setFanTarget).not.toHaveBeenCalled();
	});

	it("shows error when setFanEnabled throws", async () => {
		const client = makeMockClient({
			setFanEnabled: vi.fn().mockRejectedValue(new Error("Network error")),
		});
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: true, connection: false, setTemp: null, fanChannel: null, state: null }}
			/>,
		);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /enable fan/i }));
		});

		expect(screen.getByText("Network error")).toBeInTheDocument();
	});

	it("pre-fills target input with current setTemp value", () => {
		const client = makeMockClient();
		render(
			<FanController
				client={client}
				serial="TW-001"
				fan={{ connected: true, connection: true, setTemp: 225, fanChannel: "1", state: 1 }}
			/>,
		);

		expect(screen.getByLabelText(/target/i)).toHaveValue(225);
	});
});
