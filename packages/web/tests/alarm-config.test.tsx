import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlarmConfig } from "../src/components/AlarmConfig.tsx";
import type { ThermoworksWebClient } from "../src/lib/api.ts";

function makeMockClient(overrides: Partial<ThermoworksWebClient> = {}): ThermoworksWebClient {
	return {
		isAuthenticated: true,
		setAlarm: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as unknown as ThermoworksWebClient;
}

describe("AlarmConfig", () => {
	const defaultProps = {
		serial: "TW-001",
		channelNumber: 1,
		channelUnits: "F",
		currentHighValue: null,
		currentHighEnabled: false,
		currentLowValue: null,
		currentLowEnabled: false,
		onClose: vi.fn(),
		onSaved: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders the dialog with alarm settings title", () => {
		const client = makeMockClient();
		render(<AlarmConfig client={client} {...defaultProps} />);

		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(screen.getByText("Alarm Settings")).toBeInTheDocument();
	});

	it("shows current alarm values when pre-populated", () => {
		const client = makeMockClient();
		render(
			<AlarmConfig
				client={client}
				{...defaultProps}
				currentHighValue={275}
				currentHighEnabled={true}
				currentLowValue={32}
				currentLowEnabled={true}
			/>,
		);

		const highCheckbox = screen.getByLabelText("High alarm") as HTMLInputElement;
		const lowCheckbox = screen.getByLabelText("Low alarm") as HTMLInputElement;
		expect(highCheckbox.checked).toBe(true);
		expect(lowCheckbox.checked).toBe(true);

		const highInput = screen.getByLabelText("High alarm temperature") as HTMLInputElement;
		const lowInput = screen.getByLabelText("Low alarm temperature") as HTMLInputElement;
		expect(highInput.value).toBe("275");
		expect(lowInput.value).toBe("32");
	});

	it("calls onClose when Cancel is clicked", () => {
		const client = makeMockClient();
		const onClose = vi.fn();
		render(<AlarmConfig client={client} {...defaultProps} onClose={onClose} />);

		fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("calls onClose when X button is clicked", () => {
		const client = makeMockClient();
		const onClose = vi.fn();
		render(<AlarmConfig client={client} {...defaultProps} onClose={onClose} />);

		fireEvent.click(screen.getByLabelText("Close alarm settings"));
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("calls onClose when Escape is pressed", () => {
		const client = makeMockClient();
		const onClose = vi.fn();
		render(<AlarmConfig client={client} {...defaultProps} onClose={onClose} />);

		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("validates high must be greater than low", async () => {
		const client = makeMockClient();
		render(
			<AlarmConfig
				client={client}
				{...defaultProps}
				currentHighEnabled={true}
				currentLowEnabled={true}
			/>,
		);

		const highInput = screen.getByLabelText("High alarm temperature");
		const lowInput = screen.getByLabelText("Low alarm temperature");

		fireEvent.change(highInput, { target: { value: "100" } });
		fireEvent.change(lowInput, { target: { value: "200" } });

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /save/i }));
		});

		expect(screen.getByRole("alert")).toHaveTextContent(
			"High alarm must be greater than low alarm",
		);
		expect(client.setAlarm).not.toHaveBeenCalled();
	});

	it("validates high value is a valid number when enabled", async () => {
		const client = makeMockClient();
		render(<AlarmConfig client={client} {...defaultProps} currentHighEnabled={true} />);

		const highInput = screen.getByLabelText("High alarm temperature");
		fireEvent.change(highInput, { target: { value: "abc" } });

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /save/i }));
		});

		expect(screen.getByRole("alert")).toHaveTextContent("High alarm value must be a valid number");
		expect(client.setAlarm).not.toHaveBeenCalled();
	});

	it("calls setAlarm with correct config when saving high alarm", async () => {
		const client = makeMockClient();
		const onSaved = vi.fn();
		render(<AlarmConfig client={client} {...defaultProps} onSaved={onSaved} />);

		// Enable high alarm
		fireEvent.click(screen.getByLabelText("High alarm"));
		const highInput = screen.getByLabelText("High alarm temperature");
		fireEvent.change(highInput, { target: { value: "275" } });

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /save/i }));
		});

		expect(client.setAlarm).toHaveBeenCalledWith("TW-001", 1, {
			high: { value: 275, units: "F", enabled: true },
			low: { value: 0, units: "F", enabled: false },
		});
		expect(onSaved).toHaveBeenCalledOnce();
	});

	it("calls setAlarm with both high and low alarms", async () => {
		const client = makeMockClient();
		const onSaved = vi.fn();
		render(<AlarmConfig client={client} {...defaultProps} onSaved={onSaved} />);

		// Enable both
		fireEvent.click(screen.getByLabelText("High alarm"));
		fireEvent.click(screen.getByLabelText("Low alarm"));

		const highInput = screen.getByLabelText("High alarm temperature");
		const lowInput = screen.getByLabelText("Low alarm temperature");
		fireEvent.change(highInput, { target: { value: "275" } });
		fireEvent.change(lowInput, { target: { value: "32" } });

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /save/i }));
		});

		expect(client.setAlarm).toHaveBeenCalledWith("TW-001", 1, {
			high: { value: 275, units: "F", enabled: true },
			low: { value: 32, units: "F", enabled: true },
		});
		expect(onSaved).toHaveBeenCalledOnce();
	});

	it("disables both alarms when neither checkbox is checked", async () => {
		const client = makeMockClient();
		const onClose = vi.fn();
		render(
			<AlarmConfig
				client={client}
				{...defaultProps}
				currentHighValue={275}
				currentHighEnabled={true}
				currentLowValue={32}
				currentLowEnabled={true}
				onClose={onClose}
			/>,
		);

		// Uncheck both
		fireEvent.click(screen.getByLabelText("High alarm"));
		fireEvent.click(screen.getByLabelText("Low alarm"));

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /save/i }));
		});

		expect(client.setAlarm).toHaveBeenCalledWith("TW-001", 1, {
			high: { value: 275, units: "F", enabled: false },
			low: { value: 32, units: "F", enabled: false },
		});
	});

	it("shows error message when setAlarm fails", async () => {
		const client = makeMockClient({
			setAlarm: vi.fn().mockRejectedValue(new Error("Network error")),
		});
		render(
			<AlarmConfig
				client={client}
				{...defaultProps}
				currentHighEnabled={true}
				currentHighValue={275}
			/>,
		);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /save/i }));
		});

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Network error");
		});
	});

	it("shows Saving state while request is in-flight", async () => {
		let resolveSetAlarm: () => void;
		const setAlarmPromise = new Promise<void>((resolve) => {
			resolveSetAlarm = resolve;
		});
		const client = makeMockClient({
			setAlarm: vi.fn().mockReturnValue(setAlarmPromise),
		});
		render(
			<AlarmConfig
				client={client}
				{...defaultProps}
				currentHighEnabled={true}
				currentHighValue={275}
			/>,
		);

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /save/i }));
		});

		expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();

		await act(async () => {
			resolveSetAlarm!();
		});
	});

	it("hides value input when alarm is unchecked", () => {
		const client = makeMockClient();
		render(
			<AlarmConfig
				client={client}
				{...defaultProps}
				currentHighEnabled={false}
				currentLowEnabled={false}
			/>,
		);

		expect(screen.queryByLabelText("High alarm temperature")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Low alarm temperature")).not.toBeInTheDocument();
	});
});
